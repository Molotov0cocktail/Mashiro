import { mkdtempSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID, createHash } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { AssistantService } from '../../src/main/assistant/assistant-service.js'
import { SqliteStore } from '../../src/main/data/sqlite.js'
import { MemoryService } from '../../src/main/memory/memory-service.js'
import { ProviderService } from '../../src/main/provider/provider-service.js'
import { validateToolCalls, toolDefinitions } from '../../src/main/provider/tool-protocol.js'
import type { MemoryMutation } from '../../src/shared/memory-contract.js'
import type {
  TransportRequest,
  TransportResult
} from '../../src/main/provider/chat-completions-transport.js'

const roots: string[] = [],
  closers: (() => void)[] = []
const fingerprint = createHash('sha256')
  .update('chat-completions-v1|https://open.bigmodel.cn/api/paas/v4')
  .digest('hex')
afterEach(() => {
  closers.splice(0).forEach((close) => close())
  roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }))
})
function setup(fault?: (phase: string) => void) {
  const root = mkdtempSync(join(tmpdir(), 'mashiro-memory-test-'))
  roots.push(root)
  const path = join(root, 'state.sqlite')
  const assistants = AssistantService.open(path)
  const first = assistants.create({
    protocolVersion: 1,
    displayName: '合成助手',
    expectedStateRevision: 0
  })
  if (!first.ok) throw Error('fixture')
  const assistantId = first.data.assistants[0]!.id
  assistants.close()
  const store = new SqliteStore(path)
  closers.push(() => store.close())
  const memory = new MemoryService(
    store,
    join(root, 'memory'),
    () => ({ fingerprint, display: '合成端点' }),
    undefined,
    fault
  )
  const query = () => memory.query({ protocolVersion: 1, assistantId })
  const mutate = (mutation: MemoryMutation, commandId = randomUUID()) =>
    memory.mutate({ protocolVersion: 1, assistantId, commandId, mutation })
  const grant = (scope: 'global' | 'assistant' = 'global', overrides = {}) => {
    const current = memory.permissionState(assistantId, scope)
    return memory.setPermissions({
      protocolVersion: 1,
      assistantId,
      scope,
      expectedVersion: current.version,
      read: true,
      write: true,
      writeInferences: false,
      receive: true,
      ...overrides
    })
  }
  return { root, path, store, memory, assistantId, query, mutate, grant }
}
const remember = (markdown = '我喜欢合成茶'): Extract<MemoryMutation, { markdown: string }> => ({
  action: 'remember',
  targetId: null,
  expectedVersion: null,
  kind: 'user',
  scope: 'global',
  title: '合成偏好',
  markdown,
  nature: 'user-statement',
  event: null
})
describe('memory accepted versions and trusted scope', () => {
  it('persists readable Markdown, searches, corrects and preserves idempotent original receipt', () => {
    const f = setup(),
      command = randomUUID()
    const saved = f.mutate(remember(), command)
    expect(saved.ok).toBe(true)
    if (!saved.ok) return
    expect(f.mutate(remember(), command)).toEqual(saved)
    expect(f.mutate(remember('改变参数'), command)).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' }
    })
    expect(f.query()).toMatchObject({
      ok: true,
      data: { records: [{ markdown: '我喜欢合成茶', objectVersion: 1 }] }
    })
    const corrected = f.mutate({
      ...remember('我喜欢合成咖啡'),
      action: 'correct',
      targetId: saved.data.objectId,
      expectedVersion: 1
    })
    expect(corrected.ok).toBe(true)
    expect(
      f.mutate({
        ...remember('旧作业'),
        action: 'correct',
        targetId: saved.data.objectId,
        expectedVersion: 1
      })
    ).toMatchObject({ ok: false, error: { code: 'STALE_WRITE' } })
    f.memory.rebuildIndex()
    expect(f.query()).toMatchObject({
      ok: true,
      data: { records: [{ markdown: '我喜欢合成咖啡', objectVersion: 2 }] }
    })
    expect(readdirSync(join(f.root, 'memory')).filter((name) => name.endsWith('.md'))).toHaveLength(
      2
    )
    expect(f.mutate(remember(), command)).toEqual(saved)
  })
  it('requires exact local confirmation, suppresses representation and supports explicit restoration', () => {
    const f = setup(),
      saved = f.mutate(remember())
    if (!saved.ok) throw Error('save')
    const removal = f.mutate({
      action: 'delete',
      targetId: saved.data.objectId,
      expectedVersion: 1
    })
    expect(removal).toMatchObject({ ok: true, data: { state: 'PENDING_CONFIRMATION' } })
    expect(f.query()).toMatchObject({ ok: true, data: { records: [{ state: 'active' }] } })
    if (!removal.ok) return
    const result = f.memory.confirm({
      protocolVersion: 1,
      assistantId: f.assistantId,
      confirmationId: removal.data.confirmationId,
      accept: true
    })
    expect(result).toMatchObject({ ok: true, data: { state: 'SUCCEEDED', objectVersion: 2 } })
    f.memory.rebuildIndex()
    expect(f.query()).toMatchObject({ ok: true, data: { records: [] } })
    const restored = f.mutate({
      action: 'restore',
      targetId: saved.data.objectId,
      expectedVersion: 2
    })
    expect(restored).toMatchObject({ ok: true, data: { objectVersion: 3 } })
    expect(f.query()).toMatchObject({ ok: true, data: { records: [{ markdown: '我喜欢合成茶' }] } })
  })
  it('rejects changed dependency impact after removal preview and keeps source grants on external reload', () => {
    const f = setup(),
      saved = f.mutate(remember())
    if (!saved.ok) throw Error('save')
    const removal = f.mutate({
      action: 'withdraw',
      targetId: saved.data.objectId,
      expectedVersion: 1
    })
    if (!removal.ok) throw Error('preview')
    expect(removal.data.impact?.totalMemories).toBe(1)
    f.memory.addDependencies('round', randomUUID(), 1, [
      { type: 'memory', id: saved.data.objectId, assistantId: f.assistantId, version: 1 }
    ])
    expect(
      f.memory.confirm({
        protocolVersion: 1,
        assistantId: f.assistantId,
        confirmationId: removal.data.confirmationId,
        accept: true
      })
    ).toMatchObject({ ok: false, error: { code: 'STALE_WRITE' } })
    expect(f.query()).toMatchObject({ ok: true, data: { records: [{ state: 'active' }] } })
  })
  it('deduplicates a business command across different model attempts and rejects second payload', () => {
    const f = setup()
    f.grant()
    const requestId = randomUUID()
    const execution = {
      assistantId: f.assistantId,
      requestId,
      fingerprint,
      assertCurrent: () => undefined,
      sources: []
    }
    const first = f.memory.toolMutation(execution, remember())
    const second = f.memory.toolMutation({ ...execution }, remember())
    expect(second).toEqual(first)
    expect(() => f.memory.toolMutation(execution, remember('第二个不同请求'))).toThrow('CONFLICT')
    expect(f.query()).toMatchObject({ ok: true, data: { records: [{ objectVersion: 1 }] } })
    expect(
      f.store.database.prepare('SELECT count(*) AS n FROM memory_commands').get()
    ).toMatchObject({ n: 1 })
  })
  it('keeps inference and event states explicit, independently gates inference writing', () => {
    const f = setup()
    f.grant()
    const execution = {
      assistantId: f.assistantId,
      requestId: randomUUID(),
      fingerprint,
      assertCurrent: () => undefined,
      sources: []
    }
    expect(() => f.memory.toolMutation(execution, { ...remember(), nature: 'inference' })).toThrow(
      'PERMISSION_DENIED'
    )
    f.grant('global', { writeInferences: true })
    f.memory.toolMutation(execution, { ...remember(), nature: 'inference' })
    expect(f.query()).toMatchObject({ ok: true, data: { records: [{ nature: 'inference' }] } })
    for (const status of [
      'intention',
      'planned',
      'arranged',
      'reported-happened',
      'completed',
      'cancelled',
      'unknown'
    ] as const) {
      expect(
        f.mutate({
          ...remember(),
          kind: 'event',
          event: { status, occurredAt: null, timeZone: null }
        }).ok
      ).toBe(true)
    }
    expect(
      f.store.database.prepare('SELECT count(*) AS n FROM memory_objects').get()
    ).toMatchObject({ n: 8 })
  })
  it('keeps another assistant private memory out of local assistant-filter and tool queries', () => {
    const f = setup()
    f.grant('assistant')
    const saved = f.mutate({ ...remember(), kind: 'relationship', scope: 'assistant' })
    if (!saved.ok) throw Error('save')
    const assistants = AssistantService.open(f.path)
    const second = assistants.create({
      protocolVersion: 1,
      displayName: '第二合成助手',
      expectedStateRevision: 1
    })
    if (!second.ok) throw Error('assistant')
    const id = second.data.assistants.find((row) => row.id !== f.assistantId)!.id
    assistants.close()
    expect(f.memory.query({ protocolVersion: 1, assistantId: id })).toMatchObject({
      ok: true,
      data: { records: [] }
    })
    expect(
      f.memory.inspect({ protocolVersion: 1, assistantId: id, id: saved.data.objectId })
    ).toMatchObject({ ok: false, error: { code: 'PERMISSION_DENIED' } })
    expect(
      f.memory.search(
        {
          assistantId: id,
          requestId: randomUUID(),
          fingerprint,
          assertCurrent: () => undefined,
          sources: []
        },
        '茶',
        10
      )
    ).toHaveLength(0)
  })
  it('does not permit stale confirmation after a user edit', () => {
    const f = setup(),
      saved = f.mutate(remember())
    if (!saved.ok) throw Error('save')
    const removal = f.mutate({
      action: 'withdraw',
      targetId: saved.data.objectId,
      expectedVersion: 1
    })
    if (!removal.ok) throw Error('preview')
    f.mutate({
      ...remember('用户新编辑'),
      action: 'correct',
      targetId: saved.data.objectId,
      expectedVersion: 1
    })
    expect(
      f.memory.confirm({
        protocolVersion: 1,
        assistantId: f.assistantId,
        confirmationId: removal.data.confirmationId,
        accept: true
      })
    ).toMatchObject({ ok: false, error: { code: 'STALE_WRITE' } })
  })
  it('blocks tampering then accepts only explicitly previewed content as a new version', () => {
    const f = setup(),
      saved = f.mutate(remember())
    if (!saved.ok) throw Error('save')
    const path = join(f.root, 'memory', readdirSync(join(f.root, 'memory'))[0]!)
    writeFileSync(path, '# 外部编辑\n我喜欢新茶')
    expect(f.query()).toMatchObject({
      ok: true,
      data: { records: [{ state: 'integrity-blocked', markdown: '' }] }
    })
    f.memory.rebuildIndex()
    const preview = f.memory.previewReload({
      protocolVersion: 1,
      assistantId: f.assistantId,
      id: saved.data.objectId,
      expectedVersion: 1
    })
    if (!preview.ok) throw Error('preview')
    expect(
      f.memory.acceptReload({
        protocolVersion: 1,
        assistantId: f.assistantId,
        previewId: preview.data.previewId
      })
    ).toMatchObject({ ok: true, data: { objectVersion: 2 } })
    expect(f.query()).toMatchObject({
      ok: true,
      data: { records: [{ markdown: '# 外部编辑\n我喜欢新茶', scope: 'global' }] }
    })
  })
  it.each(['intent', 'file-temp', 'file-ready', 'before-commit'])(
    'fault at %s cannot create accepted data or success',
    (phase) => {
      const f = setup((at) => {
        if (at === phase) throw Error('synthetic fault')
      })
      expect(f.mutate(remember())).toMatchObject({ ok: false })
      expect(f.query()).toMatchObject({ ok: true, data: { records: [] } })
      expect(
        f.store.database.prepare("SELECT 1 FROM memory_commands WHERE state='SUCCEEDED'").get()
      ).toBeUndefined()
    }
  )
  it('keeps acceptance and receipt after post-commit interruption', () => {
    const f = setup((at) => {
        if (at === 'after-commit') throw Error('synthetic fault')
      }),
      commandId = randomUUID()
    expect(f.mutate(remember(), commandId).ok).toBe(false)
    expect(f.mutate(remember(), commandId)).toMatchObject({
      ok: true,
      data: { state: 'SUCCEEDED' }
    })
    expect(f.query()).toMatchObject({ ok: true, data: { records: [{ objectVersion: 1 }] } })
  })
  it('separates global/private grants and endpoint receive; blocks history-derived replay after withdrawal', () => {
    const f = setup(),
      saved = f.mutate(remember())
    if (!saved.ok) throw Error('save')
    f.grant('assistant')
    const execution = {
      assistantId: f.assistantId,
      requestId: randomUUID(),
      fingerprint,
      assertCurrent: () => undefined,
      sources: []
    }
    expect(f.memory.search(execution, '茶', 10)).toHaveLength(0)
    f.grant('global')
    expect(f.memory.search(execution, '茶', 10)).toHaveLength(1)
    expect(f.memory.search({ ...execution, fingerprint: 'other-endpoint' }, '茶', 10)).toHaveLength(
      0
    )
    const removal = f.mutate({
      action: 'withdraw',
      targetId: saved.data.objectId,
      expectedVersion: 1
    })
    if (!removal.ok) throw Error('preview')
    f.memory.confirm({
      protocolVersion: 1,
      assistantId: f.assistantId,
      confirmationId: removal.data.confirmationId,
      accept: true
    })
    expect(() => f.memory.assertRound(f.assistantId, execution.requestId, fingerprint)).toThrow()
    expect(
      f.mutate({ action: 'restore', targetId: saved.data.objectId, expectedVersion: 2 })
    ).toMatchObject({ ok: false, error: { code: 'PERMISSION_DENIED' } })
  })
})

describe('real trusted conversation tool mutation', () => {
  it('rejects the observed model-chosen create ID and advertises trusted create identity', () => {
    const oldArgs = { ...remember(), targetId: randomUUID(), expectedVersion: 0 }
    const call = {
      id: 'observed-live-equivalent',
      type: 'function',
      function: { name: 'write_memory', arguments: JSON.stringify(oldArgs) }
    }
    expect(() => validateToolCalls([call])).toThrow()
    const fields = Object.fromEntries(
      Object.entries(remember()).filter(
        ([key]) => !['action', 'targetId', 'expectedVersion'].includes(key)
      )
    )
    expect(
      validateToolCalls([
        { ...call, function: { name: 'write_memory', arguments: JSON.stringify(fields) } }
      ])
    ).toHaveLength(1)
    const advertised = toolDefinitions('clock-and-memory').find(
      (tool) => tool.function.name === 'write_memory'
    )!
    expect(JSON.stringify(advertised.function.parameters)).not.toContain('targetId')
    expect(JSON.stringify(advertised.function.parameters)).not.toContain('expectedVersion')
    expect(() =>
      validateToolCalls([
        {
          ...call,
          function: {
            name: 'correct_memory',
            arguments: JSON.stringify({ ...fields, targetId: randomUUID(), expectedVersion: 0 })
          }
        }
      ])
    ).toThrow()
  })
  it('commits business and ledger success together, then retrieves and refuses temporary memory tools', async () => {
    const f = setup()
    let phase = 0
    let removalTargetId = ''
    let missingCorrection = false
    const captured: TransportRequest[] = []
    const transport = async (request: TransportRequest): Promise<TransportResult> => {
      captured.push(request)
      phase++
      if (missingCorrection)
        return {
          status: 'completed',
          text: '',
          finishReason: 'tool_calls',
          usage: null,
          toolCalls: [
            {
              id: 'missing-correction',
              type: 'function',
              function: {
                name: 'correct_memory',
                arguments: JSON.stringify({
                  ...Object.fromEntries(
                    Object.entries(remember()).filter(([key]) => key !== 'action')
                  ),
                  targetId: randomUUID(),
                  expectedVersion: 1
                })
              }
            }
          ]
        }
      if (phase === 6)
        return {
          status: 'completed',
          text: '',
          finishReason: 'tool_calls',
          usage: null,
          toolCalls: [
            {
              id: 'remove-new-call-id',
              type: 'function',
              function: {
                name: 'request_memory_removal',
                arguments: JSON.stringify({
                  action: 'delete',
                  targetId: removalTargetId,
                  expectedVersion: 1
                })
              }
            }
          ]
        }
      if (phase === 1 || phase === 3)
        return {
          status: 'completed',
          text: '',
          finishReason: 'tool_calls',
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
          toolCalls: [
            {
              id: `model-call-${phase}`,
              type: 'function',
              function: {
                name: phase === 1 ? 'write_memory' : 'search_memory',
                arguments: JSON.stringify(
                  phase === 1
                    ? Object.fromEntries(
                        Object.entries(remember()).filter(
                          ([key]) => !['action', 'targetId', 'expectedVersion'].includes(key)
                        )
                      )
                    : { query: '合成茶', limit: 10 }
                )
              }
            }
          ]
        }
      return {
        status: 'completed',
        text: '根据可信回执回答',
        finishReason: 'stop',
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }
      }
    }
    const service = ProviderService.open(
      f.path,
      join(f.root, 'credentials'),
      {
        isEncryptionAvailable: () => true,
        encryptString: (value) => Buffer.from(value),
        decryptString: (value) => value.toString()
      },
      transport
    )
    closers.push(() => service.close())
    const connection = service.saveConnection({
      protocolVersion: 1,
      displayName: '合成端点',
      baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
      enabled: true
    })
    if (!connection.ok) throw Error('connection')
    const connectionId = connection.data.connections[0]!.id
    service.setCredential({
      protocolVersion: 1,
      connectionId,
      apiKey: 'synthetic-not-a-key',
      persistence: 'temporary'
    })
    service.bindAssistant({
      protocolVersion: 1,
      assistantId: f.assistantId,
      connectionId,
      model: 'glm-5.3-flash',
      expectedVersion: null
    })
    const p = service.permissions({ protocolVersion: 1, assistantId: f.assistantId })
    if (!p.ok) throw Error('permissions')
    service.setPermissions({
      protocolVersion: 1,
      assistantId: f.assistantId,
      connectionId,
      endpointFingerprint: p.data.endpointFingerprint,
      expectedVersion: p.data.version,
      readHistory: true,
      sendHistory: true
    })
    f.grant()
    const request = {
      protocolVersion: 1 as const,
      assistantId: f.assistantId,
      text: '请记住：我喜欢合成茶',
      mode: 'normal' as const,
      context: { kind: 'none' as const },
      tools: 'clock-and-memory' as const,
      stream: false
    }
    const first = await service.startChat({ ...request, requestId: randomUUID() }, () => undefined)
    expect(first.ok).toBe(true)
    expect(f.query()).toMatchObject({ ok: true, data: { records: [{ markdown: '我喜欢合成茶' }] } })
    expect(
      f.store.database
        .prepare("SELECT count(*) AS n FROM memory_commands WHERE state='SUCCEEDED'")
        .get()
    ).toMatchObject({ n: 1 })
    expect(
      f.store.database.prepare('SELECT count(*) AS n FROM protocol_results').get()
    ).toMatchObject({ n: 1 })
    const recallRequestId = randomUUID()
    const second = await service.startChat(
      { ...request, text: '我喜欢什么合成茶？', requestId: recallRequestId },
      () => undefined
    )
    expect(second.ok).toBe(true)
    expect(JSON.stringify(captured[3]!.messages)).toContain('我喜欢合成茶')
    const count = captured.length
    expect(
      await service.startChat(
        { ...request, mode: 'temporary', requestId: randomUUID() },
        () => undefined
      )
    ).toMatchObject({ ok: false, error: { code: 'PERMISSION_DENIED' } })
    expect(captured).toHaveLength(count)
    const records = f.query()
    if (!records.ok) throw Error('records')
    const removal = f.mutate({
      action: 'withdraw',
      targetId: records.data.records[0]!.id,
      expectedVersion: 1
    })
    if (!removal.ok) throw Error('removal')
    expect(
      f.memory.confirm({
        protocolVersion: 1,
        assistantId: f.assistantId,
        confirmationId: removal.data.confirmationId,
        accept: true
      }).ok
    ).toBe(true)
    expect(
      await service.startChat(
        {
          ...request,
          requestId: randomUUID(),
          context: { kind: 'selected', requestIds: [recallRequestId] }
        },
        () => undefined
      )
    ).toMatchObject({ ok: false, error: { code: 'PERMISSION_DENIED' } })
    expect(captured).toHaveLength(count)
    const continued = await service.startChat(
      {
        ...request,
        requestId: randomUUID(),
        text: '继续新的话题',
        tools: 'off',
        context: { kind: 'recent' }
      },
      () => undefined
    )
    expect(continued).toMatchObject({ ok: true, data: { status: 'completed' } })
    expect(JSON.stringify(captured[count]!.messages)).not.toContain('合成茶')
    expect(captured[count]!.messages).toHaveLength(2)
    expect(captured[count]!.messages[0]).toMatchObject({
      role: 'system',
      content: expect.stringContaining('配置数据：')
    })
    const newMemory = f.mutate(remember('独立待删除记忆'))
    if (!newMemory.ok) throw Error('new memory')
    removalTargetId = newMemory.data.objectId
    const removalRequestId = randomUUID()
    const requested = await service.startChat(
      { ...request, requestId: removalRequestId, text: '删除独立待删除记忆' },
      () => undefined
    )
    expect(requested.ok).toBe(true)
    const pendingOps = service.tools({
      protocolVersion: 1,
      assistantId: f.assistantId,
      mode: 'normal',
      requestId: removalRequestId
    })
    if (!pendingOps.ok) throw Error('pending operations')
    const receipt = pendingOps.data.operations[0]!.memoryReceipt!
    expect(receipt.state).toBe('PENDING_CONFIRMATION')
    expect(receipt.impact?.memoryIds).toContain(removalTargetId)
    const beforeConfirm = captured.length
    expect(
      service.memory.confirm({
        protocolVersion: 1,
        assistantId: f.assistantId,
        confirmationId: receipt.confirmationId,
        accept: true
      })
    ).toMatchObject({ ok: true, data: { state: 'SUCCEEDED' } })
    expect(
      service.tools({
        protocolVersion: 1,
        assistantId: f.assistantId,
        mode: 'normal',
        requestId: removalRequestId
      })
    ).toMatchObject({
      ok: true,
      data: {
        operations: [{ memoryReceipt: { state: 'SUCCEEDED', operationId: receipt.operationId } }]
      }
    })
    expect(captured).toHaveLength(beforeConfirm)
    missingCorrection = true
    const missingRequest = randomUUID()
    const commandsBefore = f.store.database
      .prepare('SELECT count(*) AS n FROM memory_commands')
      .get()
    expect(
      await service.startChat({ ...request, requestId: missingRequest }, () => undefined)
    ).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
    expect(f.store.database.prepare('SELECT count(*) AS n FROM memory_commands').get()).toEqual(
      commandsBefore
    )
    expect(
      service.tools({
        protocolVersion: 1,
        assistantId: f.assistantId,
        mode: 'normal',
        requestId: missingRequest
      })
    ).toMatchObject({
      ok: true,
      data: { operations: [{ state: 'CONFIRMED_NOT_APPLIED', toolName: 'correct_memory' }] }
    })
    expect(
      readFileSync(
        join(
          f.root,
          'memory',
          readdirSync(join(f.root, 'memory')).find((name) =>
            name.startsWith(records.data.records[0]!.id)
          )!
        ),
        'utf8'
      )
    ).toBe('我喜欢合成茶')
  })
})

describe('corrected memory provenance regression', () => {
  it('resolves only ancestor back-edges while retaining multi-level withdrawal and recipient authority', () => {
    const f = setup()
    f.grant()
    f.store.database
      .prepare('INSERT INTO history_permissions VALUES(?,?,?)')
      .run(f.assistantId, 1, 1)
    f.store.database
      .prepare('INSERT INTO history_recipient_grants VALUES(?,?,?)')
      .run(f.assistantId, fingerprint, 1)
    const execution = (
      sources: import('../../src/shared/memory-contract.js').MemorySource[] = []
    ) => ({
      assistantId: f.assistantId,
      requestId: randomUUID(),
      fingerprint,
      assertCurrent: () => undefined,
      sources
    })
    const original = execution()
    const originalSource = {
      type: 'user-round' as const,
      id: original.requestId,
      assistantId: f.assistantId,
      version: 1
    }
    const a = f.memory.toolMutation({ ...original, sources: [originalSource] }, remember())
    const roundA = { ...originalSource, type: 'round' as const }
    const correction = f.memory.toolMutation(execution([roundA]), {
      ...remember('纠正合成咖啡'),
      nature: 'faithful-summary',
      action: 'correct',
      targetId: a.objectId,
      expectedVersion: 1
    })
    expect(correction).toMatchObject({ state: 'SUCCEEDED', objectVersion: 2 })
    const currentA = {
      type: 'memory' as const,
      id: a.objectId!,
      assistantId: f.assistantId,
      version: 2
    }
    expect(f.memory.search(execution(), '纠正合成咖啡', 10)).toHaveLength(1)
    const b = f.memory.toolMutation(execution([currentA]), {
      ...remember('派生二层'),
      nature: 'faithful-summary'
    })
    const c = f.memory.toolMutation(execution([{ ...currentA, id: b.objectId!, version: 1 }]), {
      ...remember('派生三层'),
      nature: 'faithful-summary'
    })
    expect(f.memory.search(execution(), '派生', 10)).toHaveLength(2)
    expect(() => f.memory.assertRound(f.assistantId, original.requestId, fingerprint)).toThrow(
      'PERMISSION_DENIED'
    )
    expect(() =>
      f.memory.assertSource({ ...currentA, version: 1 }, f.assistantId, fingerprint)
    ).toThrow('PERMISSION_DENIED')
    expect(() =>
      f.memory.assertSource({ ...currentA, version: 1 }, f.assistantId, fingerprint, [currentA])
    ).not.toThrow()
    f.store.database
      .prepare('UPDATE history_recipient_grants SET send_history=0 WHERE assistant_id=?')
      .run(f.assistantId)
    expect(f.memory.search(execution(), '派生', 10)).toHaveLength(0)
    f.store.database
      .prepare('UPDATE history_recipient_grants SET send_history=1 WHERE assistant_id=?')
      .run(f.assistantId)
    f.store.database
      .prepare('UPDATE history_permissions SET read_history=0 WHERE assistant_id=?')
      .run(f.assistantId)
    expect(f.memory.search(execution(), '纠正', 10)).toHaveLength(0)
    f.store.database
      .prepare('UPDATE history_permissions SET read_history=1 WHERE assistant_id=?')
      .run(f.assistantId)
    const removal = f.mutate({ action: 'withdraw', targetId: a.objectId, expectedVersion: 2 })
    if (!removal.ok) throw Error('preview')
    expect(
      f.memory.confirm({
        protocolVersion: 1,
        assistantId: f.assistantId,
        confirmationId: removal.data.confirmationId,
        accept: true
      })
    ).toMatchObject({ ok: true })
    expect(f.memory.search(execution(), '派生', 10)).toHaveLength(0)
    expect(() =>
      f.memory.assertSource(
        { ...currentA, id: c.objectId!, version: 1 },
        f.assistantId,
        fingerprint
      )
    ).toThrow()
    expect(() => f.memory.assertSource(originalSource, f.assistantId, fingerprint)).toThrow()
  })

  it('continues after search and correction within one request but rejects old historical replay', async () => {
    const f = setup()
    const saved = f.mutate(remember())
    if (!saved.ok) throw Error('save')
    const captured: TransportRequest[] = []
    const transport = async (request: TransportRequest): Promise<TransportResult> => {
      captured.push(request)
      const index = captured.length
      const call =
        index === 1
          ? {
              name: 'search_memory' as const,
              arguments: JSON.stringify({ query: '合成茶', limit: 10 })
            }
          : index === 2
            ? {
                name: 'correct_memory' as const,
                arguments: JSON.stringify({
                  kind: 'user',
                  scope: 'global',
                  title: '合成偏好',
                  markdown: '我喜欢纠正咖啡',
                  nature: 'user-statement',
                  event: null,
                  targetId: saved.data.objectId,
                  expectedVersion: 1
                })
              }
            : null
      return {
        status: 'completed',
        text: call ? '' : '已按可信回执纠正',
        finishReason: call ? 'tool_calls' : 'stop',
        usage: null,
        ...(call ? { toolCalls: [{ id: 'step-' + index, type: 'function', function: call }] } : {})
      }
    }
    const service = ProviderService.open(
      f.path,
      join(f.root, 'credentials'),
      {
        isEncryptionAvailable: () => true,
        encryptString: (value) => Buffer.from(value),
        decryptString: (value) => value.toString()
      },
      transport
    )
    closers.push(() => service.close())
    let policy = await service.retention.policy({
      protocolVersion: 1,
      assistantId: f.assistantId
    })
    for (let attempt = 0; attempt < 20; attempt++) {
      if (policy.ok && policy.data.audit.state === 'COMPLETE') break
      await new Promise((resolve) => setImmediate(resolve))
      policy = await service.retention.policy({
        protocolVersion: 1,
        assistantId: f.assistantId
      })
    }
    expect(policy).toMatchObject({ ok: true, data: { audit: { state: 'COMPLETE' } } })
    const connection = service.saveConnection({
      protocolVersion: 1,
      displayName: '合成端点',
      baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
      enabled: true
    })
    if (!connection.ok) throw Error('connection')
    const connectionId = connection.data.connections[0]!.id
    service.setCredential({
      protocolVersion: 1,
      connectionId,
      apiKey: 'synthetic-not-a-key',
      persistence: 'temporary'
    })
    service.bindAssistant({
      protocolVersion: 1,
      assistantId: f.assistantId,
      connectionId,
      model: 'glm-5.3-flash',
      expectedVersion: null
    })
    const permissions = service.permissions({ protocolVersion: 1, assistantId: f.assistantId })
    if (!permissions.ok) throw Error('permissions')
    service.setPermissions({
      protocolVersion: 1,
      assistantId: f.assistantId,
      connectionId,
      endpointFingerprint: permissions.data.endpointFingerprint,
      expectedVersion: permissions.data.version,
      readHistory: true,
      sendHistory: true
    })
    f.grant()
    const requestId = randomUUID()
    const request = {
      protocolVersion: 1 as const,
      assistantId: f.assistantId,
      requestId,
      text: '请纠正为：我喜欢纠正咖啡',
      mode: 'normal' as const,
      context: { kind: 'none' as const },
      tools: 'clock-and-memory' as const,
      stream: false
    }
    expect(await service.startChat(request, () => undefined)).toMatchObject({
      ok: true,
      data: { status: 'completed' }
    })
    expect(captured).toHaveLength(3)
    expect(JSON.stringify(captured[2]!.messages)).toContain('SUCCEEDED')
    expect(f.query()).toMatchObject({
      ok: true,
      data: { records: [{ objectVersion: 2, markdown: '我喜欢纠正咖啡' }] }
    })
    expect(
      await service.startChat(
        {
          ...request,
          requestId: randomUUID(),
          context: { kind: 'selected', requestIds: [requestId] }
        },
        () => undefined
      )
    ).toMatchObject({ ok: false, error: { code: 'PERMISSION_DENIED' } })
    expect(captured).toHaveLength(3)
  })
})

describe('bounded context-sensitive source traversal', () => {
  it('validates a dense shared history DAG once per ancestor context', () => {
    const f = setup()
    f.store.database
      .prepare('INSERT INTO history_permissions VALUES(?,?,?)')
      .run(f.assistantId, 1, 1)
    f.store.database
      .prepare('INSERT INTO history_recipient_grants VALUES(?,?,?)')
      .run(f.assistantId, fingerprint, 1)
    const roots: import('../../src/shared/memory-contract.js').MemorySource[] = []
    for (let i = 0; i < 20; i++) {
      const round = {
        type: 'round' as const,
        id: randomUUID(),
        assistantId: f.assistantId,
        version: 1
      }
      f.memory.addDependencies('round', round.id, 1, [...roots])
      roots.push(round)
    }
    expect(() => f.memory.assertSource(roots[19]!, f.assistantId, fingerprint)).not.toThrow()
    f.store.database
      .prepare('INSERT INTO memory_suppressions VALUES(?,?,?,?,?)')
      .run('round', roots[0]!.id, 1, 'withdrawal', randomUUID())
    expect(() => f.memory.assertSource(roots[19]!, f.assistantId, fingerprint)).toThrow(
      'PERMISSION_DENIED'
    )
  })
  it('does not reuse obsolete-version approval outside its current-memory ancestor path', () => {
    const f = setup()
    f.grant()
    f.store.database
      .prepare('INSERT INTO history_permissions VALUES(?,?,?)')
      .run(f.assistantId, 1, 1)
    f.store.database
      .prepare('INSERT INTO history_recipient_grants VALUES(?,?,?)')
      .run(f.assistantId, fingerprint, 1)
    const originalId = randomUUID()
    const execution = {
      assistantId: f.assistantId,
      requestId: originalId,
      fingerprint,
      assertCurrent: () => undefined,
      sources: []
    }
    const saved = f.memory.toolMutation(execution, remember())
    const original = {
      type: 'round' as const,
      id: originalId,
      assistantId: f.assistantId,
      version: 1
    }
    f.memory.toolMutation(
      { ...execution, requestId: randomUUID(), sources: [original] },
      { ...remember('新值'), action: 'correct', targetId: saved.objectId, expectedVersion: 1 }
    )
    const root = { ...original, id: randomUUID() }
    f.memory.addDependencies('round', root.id, 1, [
      { type: 'memory', id: saved.objectId!, assistantId: f.assistantId, version: 2 },
      original
    ])
    expect(() => f.memory.assertSource(root, f.assistantId, fingerprint)).toThrow(
      'PERMISSION_DENIED'
    )
  })
})
