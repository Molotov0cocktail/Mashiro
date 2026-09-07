import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { AssistantService } from '../../src/main/assistant/assistant-service.js'
import { SqliteStore } from '../../src/main/data/sqlite.js'
import { MemoryService } from '../../src/main/memory/memory-service.js'
import { ItemService } from '../../src/main/item/item-service.js'
import { ReminderService } from '../../src/main/reminder/reminder-service.js'
import { RetentionService } from '../../src/main/retention/retention-service.js'
import { TimelineRepository } from '../../src/main/provider/timeline-repository.js'
import { ToolRepository } from '../../src/main/provider/tool-repository.js'
import {
  currentRetentionIntent,
  roundSource
} from '../../src/main/background/background-sources.js'
import type { ToolOperation } from '../../src/shared/tool-contract.js'
const cleanups: (() => void)[] = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup()
})
function fixture(toolName: ToolOperation['toolName']) {
  const root = mkdtempSync(join(tmpdir(), 'mashiro-background-receipts-'))
  cleanups.push(() => rmSync(root, { recursive: true, force: true }))
  const path = join(root, 'db.sqlite')
  const assistant = AssistantService.open(path)
  const made = assistant.create({
    protocolVersion: 1,
    displayName: '合成回执',
    expectedStateRevision: 0
  })
  if (!made.ok) throw Error('fixture')
  const assistantId = made.data.assistants[0]!.id
  assistant.close()
  const store = new SqliteStore(path)
  cleanups.push(() => store.close())
  const fingerprint = 'a'.repeat(64),
    endpoint = () => ({ fingerprint, display: 'synthetic' })
  const memory = new MemoryService(store, join(root, 'memory'), endpoint)
  const items = new ItemService(store, endpoint, () => undefined)
  const ledger = new ToolRepository(store)
  const reminders = new ReminderService(
    store,
    () => new Date('2030-01-01T00:00:00Z'),
    undefined,
    items,
    ledger
  )
  cleanups.push(() => reminders.close())
  const retention = new RetentionService(store, join(root, 'memory'), memory)
  cleanups.push(() => retention.close())
  const base = { protocolVersion: 1 as const, assistantId }
  expect(
    memory.setPermissions({
      ...base,
      scope: 'assistant',
      expectedVersion: 0,
      read: true,
      write: true,
      writeInferences: false,
      receive: true
    }).ok
  ).toBe(true)
  expect(
    items.setPermissions({
      ...base,
      expectedVersion: 0,
      read: true,
      write: true,
      receive: true,
      propose: true
    }).ok
  ).toBe(true)
  const requestId = randomUUID(),
    createdAt = '2030-01-01T00:00:00Z'
  new TimelineRepository(store).insert(assistantId, [
    {
      id: randomUUID(),
      requestId,
      role: 'user',
      content: '合成确认请求',
      status: 'completed',
      createdAt,
      saved: true
    },
    {
      id: randomUUID(),
      requestId,
      role: 'assistant',
      content: '历史回复：仍待确认',
      status: 'completed',
      createdAt,
      saved: true
    }
  ])
  const segment = {
    id: randomUUID(),
    assistantId,
    requestId,
    endpointFingerprint: fingerprint,
    model: 'synthetic',
    adapterVersion: 'synthetic',
    messages: [],
    createdAt
  }
  ledger.create(segment)
  const call = {
    id: 'synthetic-call',
    type: 'function' as const,
    function: { name: toolName, arguments: '{}' }
  }
  const operation = ledger.prepare(segment, randomUUID(), call)
  ledger.update({ ...operation, state: 'DISPATCHING' })
  const close = (result: unknown) => {
    ledger.messages(
      segment.id,
      [
        { role: 'assistant', content: '', tool_calls: [call] },
        { role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) },
        { role: 'assistant', content: '历史结果：等待用户确认' }
      ],
      true
    )
  }
  const finish = (fields: Partial<ToolOperation>, result: unknown) => {
    ledger.update({ ...operation, ...fields, state: 'SUCCEEDED' }, JSON.stringify(result))
    close(result)
  }
  const source = () => JSON.parse(roundSource(store, assistantId, requestId).body)[0]
  const remember = () => {
    const result = memory.mutate({
      ...base,
      commandId: randomUUID(),
      mutation: {
        action: 'remember',
        targetId: null,
        expectedVersion: null,
        kind: 'continuity',
        scope: 'assistant',
        title: '合成记忆',
        markdown: '只用于确认测试',
        nature: 'faithful-summary',
        event: null
      }
    })
    if (!result.ok) throw Error('remember')
    return result.data
  }
  const createItem = () =>
    items.applyMutation(
      assistantId,
      randomUUID(),
      {
        action: 'create',
        content: {
          kind: 'task',
          title: '合成事项',
          description: '',
          status: 'open',
          dueAt: null,
          timeZone: null,
          parentId: null,
          relatedIds: [],
          counterpart: ''
        }
      },
      []
    )
  return {
    root,
    store,
    memory,
    items,
    reminders,
    retention,
    base,
    assistantId,
    requestId,
    fingerprint,
    operation,
    close,
    finish,
    source,
    remember,
    createItem
  }
}
it.each([true, false])(
  'memory confirmation resolves the original frozen receipt: accept=%s',
  (accept) => {
    const f = fixture('request_memory_removal'),
      record = f.remember()
    const pending = f.memory.toolMutation(
      {
        assistantId: f.assistantId,
        requestId: f.requestId,
        fingerprint: f.fingerprint,
        assertCurrent: () => undefined,
        sources: []
      },
      { action: 'delete', targetId: record.objectId, expectedVersion: record.objectVersion }
    )
    f.finish({ memoryReceipt: pending }, pending)
    expect(f.source).toThrow('PERMISSION_DENIED')
    const confirmed = f.memory.confirm({
      ...f.base,
      confirmationId: pending.confirmationId,
      accept
    })
    expect(confirmed.ok).toBe(true)
    const body = f.source()
    expect(body.operations[0].memoryReceipt.state).toBe(
      accept ? 'SUCCEEDED' : 'CANCELLED_BEFORE_DISPATCH'
    )
    expect(body.businessStateNotice).toContain('历史')
    // Missing authoritative state must never fall back to the old tool snapshot.
    f.store.database.prepare('DELETE FROM memory_commands WHERE id=?').run(pending.operationId)
    expect(f.source).toThrow('PERMISSION_DENIED')
  }
)
it.each([true, false])(
  'reminder confirmation uses current durable preview and command: accept=%s',
  (accept) => {
    const f = fixture('prepare_reminder'),
      item = f.createItem(),
      commandId = randomUUID()
    const preview = f.reminders.prepare(
      f.assistantId,
      commandId,
      {
        action: 'create',
        itemId: item.objectId!,
        expectedItemVersion: item.objectVersion,
        dueAt: '2030-01-02T00:00:00Z',
        timeZone: 'UTC'
      },
      {
        assistantId: f.assistantId,
        requestId: f.requestId,
        fingerprint: f.fingerprint,
        sources: [],
        assertCurrent: () => undefined
      },
      f.operation
    )
    f.close(preview)
    expect(f.source).toThrow('PERMISSION_DENIED')
    const result = f.reminders.confirm({
      ...f.base,
      confirmationId: preview.confirmationId,
      accept
    })
    expect(result).toMatchObject({ ok: true })
    const body = f.source()
    expect(body.operations[0].reminderPreview.state).toBe(accept ? 'ACCEPTED' : 'REJECTED')
    expect(body.operations[0].reminderReceipt.state).toBe(
      accept ? 'SUCCEEDED' : 'CONFIRMED_NOT_APPLIED'
    )
    if (accept) {
      f.store.database
        .prepare(
          "UPDATE reminder_commands SET receipt_json=json_set(receipt_json,'$.state','RESULT_UNKNOWN') WHERE id=?"
        )
        .run(commandId)
      expect(f.source).toThrow('PERMISSION_DENIED')
    }
  }
)

it.each([true, false])(
  'retention UI re-preview keeps expired intent separate from actual confirmation: accept=%s',
  async (accept) => {
    const f = fixture('request_retention_cleanup'),
      record = f.remember()
    const input = {
      ...f.base,
      intent: 'delete-representation',
      target: {
        type: 'memories',
        objects: [{ id: record.objectId, version: record.objectVersion }]
      }
    }
    const original = await f.retention.preview(input)
    if (!original.ok) throw Error('preview')
    f.finish({ retentionPreview: original.data }, original.data)
    expect(f.source().currentRetentionOutcomes[0]).toMatchObject({
      state: 'EXPIRED_INTENT_ONLY',
      receipt: null
    })
    // The product panel explicitly requests a fresh preview after the tool protocol completes.
    const fresh = await f.retention.preview(input)
    if (!fresh.ok) throw Error('preview')
    const current = () => currentRetentionIntent(f.store, f.assistantId, fresh.data)
    expect(current).toThrow('PERMISSION_DENIED')
    const commandId = randomUUID()
    const result = await f.retention.confirm({
      ...f.base,
      commandId,
      previewId: fresh.data.id,
      nonce: fresh.data.nonce,
      accept
    })
    expect(result).toMatchObject({ ok: true })
    if (accept)
      await vi.waitFor(() => {
        expect(
          f.store.database
            .prepare('SELECT state FROM retention_jobs WHERE command_id=?')
            .get(commandId)!.state
        ).toBe('COMPLETED')
      })
    expect(current().state).toBe(accept ? 'COMPLETED' : 'CANCELLED')
    expect(f.source().currentRetentionOutcomes[0]).toMatchObject({
      state: accept ? 'INVALIDATED_NOT_APPLIED' : 'EXPIRED_INTENT_ONLY',
      receipt: null
    })
    const proof = f.store.database
      .prepare('SELECT manifest_json FROM retention_previews WHERE id=?')
      .get(fresh.data.id)!.manifest_json
    const other = f.remember()
    const later = await f.retention.preview({
      ...f.base,
      intent: 'delete-representation',
      target: { type: 'memories', objects: [{ id: other.objectId, version: other.objectVersion }] }
    })
    if (!later.ok) throw Error('later')
    expect(
      await f.retention.confirm({
        ...f.base,
        commandId: randomUUID(),
        previewId: later.data.id,
        nonce: later.data.nonce,
        accept: true
      })
    ).toMatchObject({ ok: true })
    expect(
      f.store.database
        .prepare('SELECT manifest_json FROM retention_previews WHERE id=?')
        .get(fresh.data.id)!.manifest_json
    ).toBe(proof)
    expect(current().state).toBe(accept ? 'COMPLETED' : 'CANCELLED')
    f.store.database
      .prepare(
        "UPDATE retention_commands SET receipt_json=json_set(receipt_json,'$.state','RESULT_UNKNOWN') WHERE id=?"
      )
      .run(commandId)
    expect(current).toThrow('PERMISSION_DENIED')
  }
)
it('retention closed legacy or forged proof never becomes an applied result', async () => {
  const f = fixture('request_retention_cleanup'),
    record = f.remember()
  const preview = await f.retention.preview({
    ...f.base,
    intent: 'delete-representation',
    target: { type: 'memories', objects: [{ id: record.objectId, version: 1 }] }
  })
  if (!preview.ok) throw Error('preview')
  f.finish({ retentionPreview: preview.data }, preview.data)
  const commandId = randomUUID()
  expect(
    await f.retention.confirm({
      ...f.base,
      commandId,
      previewId: preview.data.id,
      nonce: preview.data.nonce,
      accept: false
    })
  ).toMatchObject({ ok: true })
  expect(f.source().currentRetentionOutcomes[0].state).toBe('CANCELLED')
  for (const proof of [
    {},
    { version: 1, kind: 'confirmation', commandId: randomUUID(), accept: false },
    { version: 1, kind: 'confirmation', commandId, accept: true }
  ]) {
    f.store.database
      .prepare('UPDATE retention_previews SET manifest_json=? WHERE id=?')
      .run(JSON.stringify(proof), preview.data.id)
    expect(f.source).toThrow('PERMISSION_DENIED')
  }
})
it('a current item unknown receipt blocks a historically succeeded protocol', () => {
  const f = fixture('apply_item_intent'),
    receipt = f.createItem()
  f.finish({ itemReceipt: receipt }, receipt)
  expect(f.source().operations[0].itemReceipt.state).toBe('SUCCEEDED')
  f.store.database
    .prepare(
      "UPDATE item_commands SET receipt_json=json_set(receipt_json,'$.state','RESULT_UNKNOWN') WHERE id=?"
    )
    .run(receipt.operationId)
  expect(f.source).toThrow('PERMISSION_DENIED')
})
