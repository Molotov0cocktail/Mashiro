import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { afterEach, expect, it, vi } from 'vitest'
import { AssistantService } from '../../src/main/assistant/assistant-service.js'
import { SqliteStore } from '../../src/main/data/sqlite.js'
import { MemoryService } from '../../src/main/memory/memory-service.js'
import { migrateMemoryRound, verifyMemoryRound } from '../../src/main/memory/memory-round-schema.js'
import {
  recordMemoryEvidence,
  dispatchedMemorySources
} from '../../src/main/memory/memory-round-evidence.js'
import { memoryRoundResultSchema } from '../../src/shared/memory-round-contract.js'
import type { MemoryMutation, MemoryRecord } from '../../src/shared/memory-contract.js'

const close: (() => void)[] = []
afterEach(() =>
  close
    .splice(0)
    .reverse()
    .forEach((fn) => fn())
)
const mutation = (markdown = '唯一合成偏好'): MemoryMutation => ({
  action: 'remember',
  targetId: null,
  expectedVersion: null,
  kind: 'user',
  scope: 'global',
  title: '合成标题',
  markdown,
  nature: 'user-statement',
  event: null
})
function setup() {
  const root = mkdtempSync(join(tmpdir(), 'mashiro-round-017-'))
  close.push(() => rmSync(root, { recursive: true, force: true }))
  const path = join(root, 'state.sqlite')
  const assistants = AssistantService.open(path)
  const result = assistants.create({
    protocolVersion: 1,
    displayName: '合成',
    expectedStateRevision: 0
  })
  if (!result.ok) throw Error('fixture')
  const assistantId = result.data.assistants[0]!.id
  const other = assistants.create({
    protocolVersion: 1,
    displayName: '另一个合成助手',
    expectedStateRevision: result.data.stateRevision
  })
  if (!other.ok) throw Error('second assistant')
  const otherId = other.data.assistants.find((assistant) => assistant.id !== assistantId)!.id
  assistants.close()
  const store = new SqliteStore(path)
  close.push(() => store.close())
  // Explicit module migration until the schema17 writer connects schema18 centrally.
  migrateMemoryRound(store.database)
  const memory = new MemoryService(store, join(root, 'memory'), () => ({
    fingerprint: 'synthetic',
    display: '合成'
  }))
  store.database.prepare('INSERT INTO history_permissions VALUES(?,1,1)').run(assistantId)
  store.database
    .prepare('INSERT INTO history_recipient_grants VALUES(?,?,1)')
    .run(assistantId, 'synthetic')
  memory.setPermissions({
    protocolVersion: 1,
    assistantId,
    scope: 'global',
    expectedVersion: 0,
    read: true,
    receive: true,
    write: true,
    writeInferences: false
  })
  const requestId = randomUUID()
  store.database
    .prepare(
      `INSERT INTO timeline_messages(id,assistant_id,request_id,role,content,status,created_at)
    VALUES(?,?,?,'user','合成请求','completed',?)`
    )
    .run(randomUUID(), assistantId, requestId, new Date().toISOString())
  const input = {
    protocolVersion: 1 as const,
    assistantId,
    requestId,
    mode: 'normal' as const,
    section: 'provided' as const
  }
  const save = (text = '唯一合成偏好') => {
    const receipt = memory.mutate({
      protocolVersion: 1,
      assistantId,
      commandId: randomUUID(),
      mutation: mutation(text)
    })
    if (!receipt.ok) throw Error('fixture mutation')
    return receipt.data
  }
  const source = (id: string, version = 1) => ({
    type: 'memory' as const,
    id,
    version,
    assistantId
  })
  return { root, path, store, memory, assistantId, otherId, requestId, input, save, source }
}
it('paginates bounded evidence and preserves exact versions without exposing corrected bodies', () => {
  const f = setup(),
    first = f.save(),
    second = f.save('另一个合成偏好')
  recordMemoryEvidence(
    f.store,
    f.assistantId,
    f.requestId,
    [f.source(first.objectId), f.source(second.objectId)],
    'PREPARED'
  )
  recordMemoryEvidence(
    f.store,
    f.assistantId,
    f.requestId,
    [f.source(first.objectId)],
    'RESPONSE_OBSERVED'
  )
  const page = memoryRoundResultSchema.parse(f.memory.round({ ...f.input, limit: 1 }))
  expect(page).toMatchObject({
    ok: true,
    data: {
      entries: [
        {
          objectId: first.objectId,
          evidence: 'RESPONSE_OBSERVED',
          record: { markdown: '唯一合成偏好' }
        }
      ]
    }
  })
  if (!page.ok) throw Error('page')
  expect(f.memory.round({ ...f.input, cursor: page.data.nextCursor, limit: 1 })).toMatchObject({
    ok: true,
    data: { entries: [{ objectId: second.objectId, evidence: 'PREPARED' }], nextCursor: null }
  })
  expect(
    f.memory.mutate({
      protocolVersion: 1,
      assistantId: f.assistantId,
      commandId: randomUUID(),
      mutation: {
        ...mutation('纠正后秘密'),
        action: 'correct',
        targetId: first.objectId,
        expectedVersion: 1
      }
    }).ok
  ).toBe(true)
  const changed = f.memory.round(f.input)
  expect(changed).toMatchObject({
    ok: true,
    data: {
      entries: [{ objectVersion: 1, availability: 'obsolete', record: null, canInspect: true }, {}]
    }
  })
  expect(JSON.stringify(changed)).not.toContain('纠正后秘密')
  for (const bad of [
    { limit: 51 },
    { cursor: -1 },
    { cursor: Number.MAX_SAFE_INTEGER + 1 },
    { sql: 'anything' }
  ])
    expect(f.memory.round({ ...f.input, ...bad })).toMatchObject({
      ok: false,
      error: { code: 'INVALID_INPUT' }
    })
})
it.each(['memory', 'recipient', 'source', 'trash', 'tombstone'] as const)(
  'rechecks current %s restrictions without returning body copies',
  (kind) => {
    const f = setup(),
      saved = f.save('不可泄露的合成正文')
    recordMemoryEvidence(
      f.store,
      f.assistantId,
      f.requestId,
      [f.source(saved.objectId)],
      'RESPONSE_OBSERVED'
    )
    if (kind === 'memory')
      f.store.database
        .prepare('UPDATE memory_permissions SET read_allowed=0 WHERE assistant_id=?')
        .run(f.assistantId)
    if (kind === 'recipient')
      f.store.database
        .prepare('UPDATE memory_recipients SET allowed=0 WHERE assistant_id=?')
        .run(f.assistantId)
    if (kind === 'source')
      f.store.database
        .prepare('INSERT INTO memory_suppressions VALUES(?,?,?,?,?)')
        .run('memory', saved.objectId, 1, 'withdrawal', saved.objectId)
    if (kind === 'trash')
      f.store.database
        .prepare(
          "UPDATE memory_objects SET record_json=json_set(record_json,'$.retention','trash') WHERE id=?"
        )
        .run(saved.objectId)
    if (kind === 'tombstone')
      f.store.database.prepare('DELETE FROM memory_objects WHERE id=?').run(saved.objectId)
    const result = f.memory.round(f.input)
    expect(result).toMatchObject({
      ok: true,
      data: { entries: [{ availability: 'unavailable', record: null, canInspect: false }] }
    })
    expect(JSON.stringify(result)).not.toContain('不可泄露')
  }
)
it('denies wrong request ownership, revoked history and withdrawn requests before evidence lookup', () => {
  const f = setup()
  expect(f.memory.round({ ...f.input, requestId: randomUUID() })).toMatchObject({
    ok: false,
    error: { code: 'NOT_FOUND' }
  })
  const wrong = randomUUID()
  f.store.database
    .prepare('UPDATE timeline_messages SET request_id=? WHERE request_id=?')
    .run(wrong, f.requestId)
  expect(f.memory.round(f.input)).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
  f.store.database
    .prepare('UPDATE timeline_messages SET request_id=? WHERE request_id=?')
    .run(f.requestId, wrong)
  f.store.database
    .prepare('INSERT INTO memory_suppressions VALUES(?,?,?,?,?)')
    .run('round', f.requestId, 1, 'withdrawal', randomUUID())
  expect(f.memory.round(f.input)).toMatchObject({ ok: false, error: { code: 'PERMISSION_DENIED' } })
  f.store.database.prepare('DELETE FROM memory_suppressions').run()
  f.store.database.prepare('UPDATE history_permissions SET read_history=0').run()
  expect(f.memory.round(f.input)).toMatchObject({ ok: false, error: { code: 'PERMISSION_DENIED' } })
})
it('denies another active assistant and hides foreign private objects even if evidence exists', () => {
  const f = setup(),
    saved = f.save()
  recordMemoryEvidence(
    f.store,
    f.assistantId,
    f.requestId,
    [f.source(saved.objectId)],
    'RESPONSE_OBSERVED'
  )
  expect(f.memory.round({ ...f.input, assistantId: f.otherId })).toMatchObject({
    ok: false,
    error: { code: 'NOT_FOUND' }
  })
  expect(() =>
    recordMemoryEvidence(f.store, f.otherId, f.requestId, [f.source(saved.objectId)], 'PREPARED')
  ).toThrow('MEMORY_ROUND_OWNER')
  f.store.database
    .prepare(
      "UPDATE memory_objects SET record_json=json_set(record_json,'$.scope','assistant','$.ownerAssistantId',?) WHERE id=?"
    )
    .run(f.otherId, saved.objectId)
  expect(f.memory.round(f.input)).toMatchObject({
    ok: true,
    data: { entries: [{ record: null, canInspect: false }] }
  })
})
it('temporary query performs no normal reads, writes, or assistant lookup', () => {
  const f = setup()
  const prepare = vi.spyOn(f.store.database, 'prepare').mockImplementation(() => {
    throw Error('NORMAL_DATA_READ')
  })
  expect(f.memory.round({ ...f.input, mode: 'temporary' })).toMatchObject({
    ok: true,
    data: { entries: [], nextCursor: null }
  })
  expect(prepare).not.toHaveBeenCalled()
})
it('shows real command outcomes and never promotes a preparation dependency into dispatch evidence', () => {
  const f = setup()
  const receipt = f.memory.toolMutation(
    {
      assistantId: f.assistantId,
      requestId: f.requestId,
      fingerprint: 'synthetic',
      assertCurrent: () => undefined,
      sources: []
    },
    mutation()
  )
  const pendingRequest = randomUUID()
  f.store.database
    .prepare(
      "INSERT INTO timeline_messages(id,assistant_id,request_id,role,content,status,created_at) VALUES(?,?,?,'user','合成','completed',?)"
    )
    .run(randomUUID(), f.assistantId, pendingRequest, new Date().toISOString())
  const pending = f.memory.toolMutation(
    {
      assistantId: f.assistantId,
      requestId: pendingRequest,
      fingerprint: 'synthetic',
      assertCurrent: () => undefined,
      sources: []
    },
    { action: 'delete', targetId: receipt.objectId, expectedVersion: 1 }
  )
  expect(pending.state).toBe('PENDING_CONFIRMATION')
  expect(f.memory.round(f.input)).toMatchObject({
    ok: true,
    data: { entries: [], evidenceCoverage: 'recorded-only' }
  })
  const changes = memoryRoundResultSchema.parse(f.memory.round({ ...f.input, section: 'changes' }))
  expect(changes).toMatchObject({
    ok: true,
    data: { entries: [{ state: 'SUCCEEDED', objectId: receipt.objectId }] }
  })
  expect(
    f.memory.round({ ...f.input, requestId: pendingRequest, section: 'changes' })
  ).toMatchObject({
    ok: true,
    data: { entries: [{ state: 'PENDING_CONFIRMATION', confirmationId: pending.confirmationId }] }
  })
  f.store.database
    .prepare("UPDATE memory_commands SET state='NOT_APPLIED',receipt_json=NULL WHERE id=?")
    .run(receipt.operationId)
  expect(f.memory.round({ ...f.input, section: 'changes' })).toMatchObject({
    ok: true,
    data: { entries: [{ state: 'NOT_APPLIED', objectId: null, record: null }] }
  })
})
it('extracts only matching trusted search tool results, including replay, and ignores arbitrary JSON prose', () => {
  const f = setup(),
    saved = f.save()
  const record = (
    f.memory.inspect({ protocolVersion: 1, assistantId: f.assistantId, id: saved.objectId }) as {
      ok: true
      data: { record: MemoryRecord }
    }
  ).data.record
  const body = JSON.stringify({ records: [record] })
  expect(
    dispatchedMemorySources([
      { role: 'user', content: body },
      { role: 'tool', tool_call_id: 'no-call', content: body }
    ])
  ).toEqual([])
  expect(
    dispatchedMemorySources([
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          { id: 'search', type: 'function', function: { name: 'search_memory', arguments: '{}' } }
        ]
      },
      { role: 'tool', tool_call_id: 'search', content: body }
    ])
  ).toEqual([f.source(saved.objectId)])
})
it('migrates schema17 atomically, verifies exact DDL, and refuses malformed evidence tables', () => {
  const db = new DatabaseSync(':memory:')
  try {
    db.exec('PRAGMA user_version=17')
    migrateMemoryRound(db)
    expect(db.prepare('PRAGMA user_version').get()!.user_version).toBe(18)
    migrateMemoryRound(db)
    db.exec('DROP INDEX memory_round_evidence_request')
    expect(() => verifyMemoryRound(db)).toThrow('MEMORY_ROUND_SCHEMA_INVALID')
  } finally {
    db.close()
  }
  const bad = new DatabaseSync(':memory:')
  try {
    bad.exec('PRAGMA user_version=17; CREATE TABLE memory_round_evidence_request(x)')
    expect(() => migrateMemoryRound(bad)).toThrow()
    expect(bad.prepare('PRAGMA user_version').get()!.user_version).toBe(17)
    expect(
      bad.prepare("SELECT 1 FROM sqlite_master WHERE name='memory_round_evidence'").get()
    ).toBeUndefined()
  } finally {
    bad.close()
  }
})
