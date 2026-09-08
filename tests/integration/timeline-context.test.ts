import { removeRetentionFixture } from './retention-legacy-fixture.js'
import { SqliteStore } from '../../src/main/data/sqlite.js'
import { registerTimelineIpc } from '../../src/main/ipc/register-timeline-ipc.js'
import { DatabaseSync } from 'node:sqlite'
import { TimelineRepository } from '../../src/main/provider/timeline-repository.js'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { AssistantService } from '../../src/main/assistant/assistant-service.js'
import { ProviderService } from '../../src/main/provider/provider-service.js'
import type {
  TransportRequest,
  TransportResult
} from '../../src/main/provider/chat-completions-transport.js'
const cleanups: (() => void)[] = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
})
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'mashiro-context-'))
  const path = join(root, 'mashiro.sqlite')
  const assistants = AssistantService.open(path)
  const created = assistants.create({
    protocolVersion: 1,
    displayName: 'A',
    expectedStateRevision: 0
  })
  if (!created.ok) throw Error('fixture')
  const assistantId = created.data.assistants[0]!.id
  assistants.close()
  const transport = vi.fn(async (request: TransportRequest): Promise<TransportResult> => {
    void request
    return { status: 'completed', text: 'reply', usage: null }
  })
  const service = ProviderService.open(
    path,
    join(root, 'credentials'),
    {
      isEncryptionAvailable: () => true,
      encryptString: (value: string) => Buffer.from(value),
      decryptString: (value: Buffer) => value.toString()
    },
    transport
  )
  cleanups.push(() => {
    service.close()
    rmSync(root, { recursive: true, force: true })
  })
  const connection = service.saveConnection({
    protocolVersion: 1,
    displayName: 'Test',
    baseUrl: 'https://example.com/v1',
    enabled: true
  })
  if (!connection.ok) throw Error('fixture')
  const connectionId = connection.data.connections[0]!.id
  service.bindAssistant({
    protocolVersion: 1,
    assistantId,
    connectionId,
    model: 'm',
    expectedVersion: null
  })
  service.setCredential({
    protocolVersion: 1,
    connectionId,
    apiKey: 'synthetic',
    persistence: 'temporary'
  })
  const send = (text: string, context: unknown = { kind: 'recent' }) =>
    service.startChat(
      {
        protocolVersion: 1,
        assistantId,
        requestId: crypto.randomUUID(),
        text,
        mode: 'normal',
        stream: false,
        context
      },
      () => {}
    )
  return { service, transport, assistantId, connectionId, send, path }
}

function permission(item: ReturnType<typeof fixture>, readHistory = true, sendHistory = true) {
  const result = item.service.permissions({ protocolVersion: 1, assistantId: item.assistantId })
  if (!result.ok) throw Error('permission')
  const data = result.data
  return item.service.setPermissions({
    protocolVersion: 1,
    assistantId: item.assistantId,
    connectionId: data.connectionId,
    endpointFingerprint: data.endpointFingerprint,
    expectedVersion: data.version,
    readHistory,
    sendHistory
  })
}
function messages(item: ReturnType<typeof fixture>) {
  const result = item.service.readTimeline({
    protocolVersion: 1,
    assistantId: item.assistantId,
    mode: 'normal'
  })
  if (!result.ok) throw Error('timeline')
  return result.data.messages
}
it('selects old complete rounds in chronological order without reading other recent rounds', async () => {
  const item = fixture()
  for (let index = 0; index < 20; index++) await item.send('round-' + index)
  expect(permission(item).ok).toBe(true)
  const rows = messages(item)
  const requestIds = [rows[4]!.requestId, rows[0]!.requestId]
  expect((await item.send('selected', { kind: 'selected', requestIds })).ok).toBe(true)
  expect(
    item.transport.mock.calls
      .at(-1)![0]
      .messages.slice(1)
      .map((row) => row.content)
  ).toEqual(['round-0', 'reply', 'round-2', 'reply', 'selected'])
  expect((await item.send('none', { kind: 'none' })).ok).toBe(true)
  expect(item.transport.mock.calls.at(-1)![0].messages.slice(1)).toEqual([
    { role: 'user', content: 'none' }
  ])
})
it('rejects duplicate, foreign, unknown, incomplete and over-budget selection before persistence or calls', async () => {
  const item = fixture()
  await item.send('original')
  permission(item)
  const id = messages(item)[0]!.requestId
  const before = item.transport.mock.calls.length
  for (const requestIds of [
    [id, id],
    [crypto.randomUUID()],
    Array.from({ length: 17 }, () => id)
  ]) {
    expect(await item.send('invalid', { kind: 'selected', requestIds })).toMatchObject({
      ok: false,
      error: { code: 'INVALID_INPUT' }
    })
  }
  const database = new DatabaseSync(item.path)
  database.prepare("UPDATE timeline_messages SET status='failed' WHERE role='assistant'").run()
  expect(await item.send('incomplete', { kind: 'selected', requestIds: [id] })).toMatchObject({
    ok: false,
    error: { code: 'INVALID_INPUT' }
  })
  database
    .prepare("UPDATE timeline_messages SET status='completed',content=? WHERE role='assistant'")
    .run('x'.repeat(64000))
  expect(await item.send('large', { kind: 'selected', requestIds: [id] })).toMatchObject({
    ok: false,
    error: { code: 'LIMIT' }
  })
  database.close()
  expect(item.transport).toHaveBeenCalledTimes(before)
  expect(messages(item)).toHaveLength(2)
  const assistants = AssistantService.open(item.path)
  const second = assistants.create({
    protocolVersion: 1,
    displayName: 'B',
    expectedStateRevision: 1
  })
  if (!second.ok) throw Error('fixture')
  const other = second.data.assistants.find((row) => row.id !== item.assistantId)!.id
  assistants.close()
  const forged = crypto.randomUUID()
  const db = new DatabaseSync(item.path)
  db.prepare(
    "INSERT INTO timeline_messages(id,assistant_id,request_id,role,content,status,created_at) VALUES(?,?,?,'user','FOREIGN','completed',?)"
  ).run(crypto.randomUUID(), other, forged, new Date().toISOString())
  db.prepare(
    "INSERT INTO timeline_messages(id,assistant_id,request_id,role,content,status,created_at) VALUES(?,?,?,'assistant','FOREIGN','completed',?)"
  ).run(crypto.randomUUID(), other, forged, new Date().toISOString())
  db.close()
  expect(await item.send('foreign', { kind: 'selected', requestIds: [forged] })).toMatchObject({
    ok: false,
    error: { code: 'INVALID_INPUT' }
  })
  expect(item.transport).toHaveBeenCalledTimes(before)
})
it('gates before history reads and keeps strict temporary isolated from stored context', async () => {
  const item = fixture()
  await item.send('stored')
  const id = messages(item)[0]!.requestId
  const spy = vi.spyOn(TimelineRepository.prototype, 'context')
  const selectedSpy = vi.spyOn(TimelineRepository.prototype, 'selectedContext')
  try {
    expect(await item.send('denied', { kind: 'selected', requestIds: [id] })).toMatchObject({
      ok: false,
      error: { code: 'PERMISSION_DENIED' }
    })
    permission(item, false, true)
    await item.send('no-read')
    expect(spy).not.toHaveBeenCalled()
    expect(selectedSpy).not.toHaveBeenCalled()
    spy.mockImplementation(() => {
      throw Error('normal read forbidden')
    })
    selectedSpy.mockImplementation(() => {
      throw Error('normal selected forbidden')
    })
    for (const context of [{ kind: 'recent' }, { kind: 'none' }]) {
      expect(
        await item.service.startChat(
          {
            protocolVersion: 1,
            assistantId: item.assistantId,
            requestId: crypto.randomUUID(),
            text: 'temp',
            mode: 'temporary',
            stream: false,
            context
          },
          () => {}
        )
      ).toMatchObject({ ok: true })
    }
    expect(
      await item.service.startChat(
        {
          protocolVersion: 1,
          assistantId: item.assistantId,
          requestId: crypto.randomUUID(),
          text: 'temp',
          mode: 'temporary',
          stream: false,
          context: { kind: 'selected', requestIds: [id] }
        },
        () => {}
      )
    ).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } })
  } finally {
    spy.mockRestore()
    selectedSpy.mockRestore()
  }
})
it('does not inherit endpoint permission after edits and rejects stale target approval', async () => {
  const item = fixture()
  await item.send('history')
  permission(item)
  const old = item.service.permissions({ protocolVersion: 1, assistantId: item.assistantId })
  if (!old.ok) throw Error('permission')
  let result = item.service.list({ protocolVersion: 1 })
  if (!result.ok) throw Error('list')
  const connection = result.data.connections[0]!
  item.service.saveConnection({
    protocolVersion: 1,
    connectionId: item.connectionId,
    displayName: 'Renamed',
    baseUrl: connection.baseUrl,
    enabled: true,
    expectedVersion: connection.version
  })
  expect(
    item.service.permissions({ protocolVersion: 1, assistantId: item.assistantId })
  ).toMatchObject({
    ok: true,
    data: { sendHistory: true, endpointFingerprint: old.data.endpointFingerprint }
  })
  result = item.service.list({ protocolVersion: 1 })
  if (!result.ok) throw Error('list')
  item.service.saveConnection({
    protocolVersion: 1,
    connectionId: item.connectionId,
    displayName: 'Other endpoint',
    baseUrl: 'https://example.com/other',
    enabled: true,
    expectedVersion: result.data.connections[0]!.version
  })
  expect(
    item.service.permissions({ protocolVersion: 1, assistantId: item.assistantId })
  ).toMatchObject({ ok: true, data: { sendHistory: false } })
  expect(
    item.service.setPermissions({
      protocolVersion: 1,
      assistantId: item.assistantId,
      connectionId: item.connectionId,
      endpointFingerprint: old.data.endpointFingerprint,
      expectedVersion: old.data.version,
      readHistory: true,
      sendHistory: true
    })
  ).toMatchObject({ ok: false, error: { code: 'STALE_WRITE' } })
  await item.send('after-endpoint')
  expect(item.transport.mock.calls.at(-1)![0].messages.slice(1)).toEqual([
    { role: 'user', content: 'after-endpoint' }
  ])
  item.service.bindAssistant({
    protocolVersion: 1,
    assistantId: item.assistantId,
    connectionId: item.connectionId,
    model: 'another',
    expectedVersion: 1
  })
  expect(
    item.service.permissions({ protocolVersion: 1, assistantId: item.assistantId })
  ).toMatchObject({ ok: true, data: { sendHistory: false } })
})
it('preserves per-assistant permission isolation with shared connection and supports unbound local browsing', async () => {
  const item = fixture()
  permission(item)
  const assistants = AssistantService.open(item.path)
  const second = assistants.create({
    protocolVersion: 1,
    displayName: 'B',
    expectedStateRevision: 1
  })
  if (!second.ok) throw Error('fixture')
  const id = second.data.assistants.find((row) => row.id !== item.assistantId)!.id
  assistants.close()
  expect(item.service.permissions({ protocolVersion: 1, assistantId: id })).toMatchObject({
    ok: true,
    data: {
      connectionId: null,
      endpointFingerprint: null,
      endpointDisplay: null,
      sendHistory: false,
      readHistory: true,
      version: 0
    }
  })
  expect(item.service.queryTimeline({ protocolVersion: 1, assistantId: id })).toMatchObject({
    ok: true,
    data: { messages: [] }
  })
  expect(
    item.service.setPermissions({
      protocolVersion: 1,
      assistantId: id,
      connectionId: null,
      endpointFingerprint: null,
      expectedVersion: 0,
      readHistory: false,
      sendHistory: false
    })
  ).toMatchObject({ ok: true, data: { readHistory: false } })
  item.service.bindAssistant({
    protocolVersion: 1,
    assistantId: id,
    connectionId: item.connectionId,
    model: 'm',
    expectedVersion: null
  })
  expect(item.service.permissions({ protocolVersion: 1, assistantId: id })).toMatchObject({
    ok: true,
    data: { readHistory: false, sendHistory: false }
  })
})
it('cancels a history request on revocation and ignores late non-cooperative output', async () => {
  const item = fixture()
  await item.send('history')
  permission(item)
  let release!: (result: TransportResult) => void
  let captured!: TransportRequest
  item.transport.mockImplementationOnce((request) => {
    captured = request
    request.onDelta?.('before')
    return new Promise((resolve) => {
      release = resolve
    })
  })
  const events: unknown[] = []
  const running = item.service.startChat(
    {
      protocolVersion: 1,
      assistantId: item.assistantId,
      requestId: crypto.randomUUID(),
      text: 'inflight',
      mode: 'normal',
      stream: true
    },
    (event) => events.push(event)
  )
  expect(captured.messages.length).toBeGreaterThan(1)
  permission(item, true, false)
  expect(captured.signal!.aborted).toBe(true)
  captured.onDelta?.('AFTER_REVOKE')
  release({
    status: 'completed',
    text: 'LATE_FINAL',
    usage: { promptTokens: 2, completionTokens: 3, totalTokens: 5 }
  })
  expect(await running).toMatchObject({
    ok: true,
    data: { status: 'cancelled', text: 'before', usage: null }
  })
  expect(JSON.stringify(events)).not.toContain('AFTER_REVOKE')
  expect(messages(item).at(-1)).toMatchObject({ status: 'cancelled', content: 'before' })
})
it.each([
  {
    name: 'malformed usage',
    outcome: {
      status: 'completed',
      text: 'LATE_BODY',
      usage: { promptTokens: -1, completionTokens: 1, totalTokens: 0 }
    }
  },
  {
    name: 'oversized body',
    outcome: { status: 'completed', text: 'x'.repeat(120001), usage: null }
  },
  { name: 'rejection', outcome: new Error('synthetic late transport rejection') }
])('keeps cancellation authoritative over a late $name', async ({ outcome }) => {
  const item = fixture()
  await item.send('history')
  permission(item)
  let captured!: TransportRequest
  let resolveTransport!: (result: TransportResult) => void
  let rejectTransport!: (error: unknown) => void
  item.transport.mockImplementationOnce((request) => {
    captured = request
    request.onDelta?.('accepted')
    return new Promise<TransportResult>((resolve, reject) => {
      resolveTransport = resolve
      rejectTransport = reject
    })
  })
  const events: string[] = []
  const running = item.service.startChat(
    {
      protocolVersion: 1,
      assistantId: item.assistantId,
      requestId: crypto.randomUUID(),
      text: 'revoke',
      mode: 'normal',
      stream: true
    },
    (event) => events.push(event.type)
  )
  expect(captured.messages.slice(1).map((row) => row.content)).toEqual([
    'history',
    'reply',
    'revoke'
  ])
  permission(item, true, false)
  expect(captured.signal?.aborted).toBe(true)
  captured.onDelta?.('IGNORED_LATE_DELTA')
  if (outcome instanceof Error) rejectTransport(outcome)
  else resolveTransport(outcome as TransportResult)
  expect(await running).toMatchObject({
    ok: true,
    data: { status: 'cancelled', text: 'accepted', usage: null }
  })
  expect(events).toEqual(['delta', 'cancelled'])
  expect(messages(item).at(-1)).toMatchObject({ status: 'cancelled', content: 'accepted' })
})
it.each([
  {
    name: 'malformed usage',
    outcome: {
      status: 'completed',
      text: 'untrusted',
      usage: { promptTokens: -1, completionTokens: 1, totalTokens: 0 }
    },
    code: 'PROTOCOL'
  },
  {
    name: 'oversized body',
    outcome: { status: 'completed', text: 'x'.repeat(120001), usage: null },
    code: 'LIMIT'
  }
])('rejects an uncancelled $name transport result', async ({ outcome, code }) => {
  const item = fixture()
  item.transport.mockResolvedValueOnce(outcome as TransportResult)
  const events: string[] = []
  const result = await item.service.startChat(
    {
      protocolVersion: 1,
      assistantId: item.assistantId,
      requestId: crypto.randomUUID(),
      text: 'current',
      mode: 'normal',
      stream: false
    },
    (event) => events.push(event.type)
  )
  expect(result).toMatchObject({ ok: false, error: { code } })
  expect(events).toEqual(['failed'])
  expect(messages(item).at(-1)).toMatchObject({ status: 'failed', content: '' })
})
it('keeps local delta overflow authoritative when the aborted transport rejects', async () => {
  const item = fixture()
  item.transport.mockImplementationOnce(async (request) => {
    request.onDelta?.('x'.repeat(120001))
    throw new Error('synthetic rejection after local delta limit')
  })
  const events: string[] = []
  const result = await item.service.startChat(
    {
      protocolVersion: 1,
      assistantId: item.assistantId,
      requestId: crypto.randomUUID(),
      text: 'current',
      mode: 'normal',
      stream: true
    },
    (event) => events.push(event.type)
  )
  expect(result).toMatchObject({ ok: false, error: { code: 'LIMIT' } })
  expect(events.at(-1)).toBe('failed')
  expect(messages(item).at(-1)).toMatchObject({ status: 'failed' })
  expect(messages(item).at(-1)?.content).toHaveLength(120000)
})
it('keeps none-policy inflight calls independent from unrelated history revocation', async () => {
  const item = fixture()
  permission(item)
  let release!: (result: TransportResult) => void
  let signal!: AbortSignal
  item.transport.mockImplementationOnce((request) => {
    signal = request.signal!
    return new Promise((resolve) => {
      release = resolve
    })
  })
  const running = item.send('none', { kind: 'none' })
  permission(item, false, false)
  expect(signal.aborted).toBe(false)
  release({ status: 'completed', text: 'reply', usage: null })
  expect(await running).toMatchObject({ ok: true, data: { status: 'completed' } })
})
it('paginates all old messages stably while new messages arrive and searches literal Chinese text', async () => {
  const item = fixture()
  // Populate historical pairs in one repository transaction; the new arrival below
  // still exercises the real send path while the page-size boundary stays unchanged.
  const seedStore = new SqliteStore(item.path)
  try {
    new TimelineRepository(seedStore).insert(
      item.assistantId,
      Array.from({ length: 61 }, (_, index) => {
        const requestId = crypto.randomUUID()
        return (['user', 'assistant'] as const).map((role) => ({
          id: crypto.randomUUID(),
          requestId,
          role,
          content:
            role === 'assistant' ? 'reply' : index === 0 ? "中文 %_ 引号' space" : 'row-' + index,
          status: 'completed' as const,
          saved: true,
          createdAt: new Date(Date.UTC(2026, 8, 6) + index).toISOString()
        }))
      }).flat()
    )
  } finally {
    seedStore.close()
  }
  const first = item.service.queryTimeline({ protocolVersion: 1, assistantId: item.assistantId })
  if (!first.ok) throw Error('query')
  expect(first.data.messages).toHaveLength(100)
  expect(first.data.nextCursor).not.toBeNull()
  await item.send('new')
  const second = item.service.queryTimeline({
    protocolVersion: 1,
    assistantId: item.assistantId,
    before: first.data.nextCursor
  })
  if (!second.ok) throw Error('query')
  expect(second.data.messages).toHaveLength(22)
  expect(new Set([...first.data.messages, ...second.data.messages].map((row) => row.id)).size).toBe(
    122
  )
  expect(second.data.nextCursor).toBeNull()
  for (const query of ['中文', '%_', "' space"]) {
    const found = item.service.queryTimeline({
      protocolVersion: 1,
      assistantId: item.assistantId,
      query
    })
    expect(found).toMatchObject({
      ok: true,
      data: { messages: [{ content: "中文 %_ 引号' space" }] }
    })
  }
  expect(
    item.service.queryTimeline({
      protocolVersion: 1,
      assistantId: item.assistantId,
      query: 'not-found'
    })
  ).toMatchObject({ ok: true, data: { messages: [], nextCursor: null } })
  for (const extra of [
    { before: 0 },
    { before: Number.MAX_SAFE_INTEGER + 1 },
    { query: 'x'.repeat(201) },
    { sql: 'SELECT' }
  ]) {
    expect(
      item.service.queryTimeline({ protocolVersion: 1, assistantId: item.assistantId, ...extra })
    ).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } })
  }
})
it('rolls permission updates back on storage failure and rejects stale revisions', () => {
  const item = fixture()
  const state = item.service.permissions({ protocolVersion: 1, assistantId: item.assistantId })
  if (!state.ok) throw Error('state')
  expect(permission(item).ok).toBe(true)
  expect(
    item.service.setPermissions({
      protocolVersion: 1,
      assistantId: item.assistantId,
      connectionId: state.data.connectionId,
      endpointFingerprint: state.data.endpointFingerprint,
      expectedVersion: 0,
      readHistory: false,
      sendHistory: false
    })
  ).toMatchObject({ ok: false, error: { code: 'STALE_WRITE' } })
  const db = new DatabaseSync(item.path)
  db.exec(
    "CREATE TRIGGER synthetic_grant_failure BEFORE UPDATE ON history_recipient_grants BEGIN SELECT RAISE(ABORT,'fixture failure'); END"
  )
  expect(permission(item, false, false)).toMatchObject({
    ok: false,
    error: { code: 'STORAGE_UNAVAILABLE' }
  })
  expect(
    item.service.permissions({ protocolVersion: 1, assistantId: item.assistantId })
  ).toMatchObject({ ok: true, data: { readHistory: true, sendHistory: true, version: 1 } })
  db.close()
})

it('migrates populated v3 without inventing grants and preserves new permission state on restart', async () => {
  const item = fixture()
  await item.send('v3-original')
  const before = messages(item)
  item.service.close()
  const db = new DatabaseSync(item.path)
  removeRetentionFixture(db)
  db.exec(
    'DROP TABLE memory_pending; DROP TABLE memory_cleanup; DROP TABLE memory_previews; DROP TABLE memory_suppressions; DROP TABLE memory_index; DROP TABLE memory_recipients; DROP TABLE memory_permissions; DROP TABLE memory_dependencies; DROP TABLE memory_commands; DROP TABLE memory_versions; DROP TABLE memory_objects; DROP TABLE provider_capability_evidence; DROP TABLE protocol_results; DROP TABLE tool_operations; DROP TABLE protocol_segments; DROP TABLE timeline_sources; DROP TABLE history_recipient_grants; DROP TABLE history_permissions; PRAGMA user_version=3'
  )
  db.close()
  const store = new SqliteStore(item.path)
  expect(
    (store.database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version
  ).toBe(19)
  expect(store.database.prepare('SELECT * FROM history_recipient_grants').all()).toHaveLength(0)
  expect(
    store.database
      .prepare('SELECT id FROM timeline_messages ORDER BY sequence')
      .all()
      .map((row) => row.id)
  ).toEqual(before.map((row) => row.id))
  store.close()
  const service = ProviderService.open(
    item.path,
    join(item.path, '..', 'credentials'),
    {
      isEncryptionAvailable: () => true,
      encryptString: (value: string) => Buffer.from(value),
      decryptString: (value: Buffer) => value.toString()
    },
    item.transport
  )
  try {
    const permission = service.permissions({ protocolVersion: 1, assistantId: item.assistantId })
    if (!permission.ok) throw Error('permission')
    expect(permission.data).toMatchObject({ readHistory: true, sendHistory: false, version: 0 })
    expect(
      service.setPermissions({
        protocolVersion: 1,
        assistantId: item.assistantId,
        connectionId: permission.data.connectionId,
        endpointFingerprint: permission.data.endpointFingerprint,
        expectedVersion: 0,
        readHistory: false,
        sendHistory: true
      }).ok
    ).toBe(true)
  } finally {
    service.close()
  }
  const next = ProviderService.open(
    item.path,
    join(item.path, '..', 'credentials'),
    {
      isEncryptionAvailable: () => true,
      encryptString: (value: string) => Buffer.from(value),
      decryptString: (value: Buffer) => value.toString()
    },
    item.transport
  )
  try {
    expect(next.permissions({ protocolVersion: 1, assistantId: item.assistantId })).toMatchObject({
      ok: true,
      data: { readHistory: false, sendHistory: true, version: 1 }
    })
    expect(item.transport).toHaveBeenCalledTimes(1)
  } finally {
    next.close()
  }
})
it('rolls back a failed v3 upgrade without losing history or advancing schema', async () => {
  const item = fixture()
  await item.send('preserve-v3')
  item.service.close()
  const db = new DatabaseSync(item.path)
  removeRetentionFixture(db)
  db.exec(
    'DROP TABLE memory_pending; DROP TABLE memory_cleanup; DROP TABLE memory_previews; DROP TABLE memory_suppressions; DROP TABLE memory_index; DROP TABLE memory_recipients; DROP TABLE memory_permissions; DROP TABLE memory_dependencies; DROP TABLE memory_commands; DROP TABLE memory_versions; DROP TABLE memory_objects; DROP TABLE provider_capability_evidence; DROP TABLE protocol_results; DROP TABLE tool_operations; DROP TABLE protocol_segments; DROP TABLE timeline_sources; DROP TABLE history_recipient_grants; DROP TABLE history_permissions; PRAGMA user_version=3'
  )
  db.exec('CREATE TABLE history_recipient_grants(collision TEXT)')
  db.close()
  expect(() => new SqliteStore(item.path)).toThrow()
  const after = new DatabaseSync(item.path)
  expect(
    (after.prepare('PRAGMA user_version').get() as { user_version: number }).user_version
  ).toBe(3)
  expect(
    after.prepare("SELECT name FROM sqlite_master WHERE name='history_permissions'").get()
  ).toBeUndefined()
  expect(after.prepare('SELECT content FROM timeline_messages ORDER BY sequence').all()).toEqual([
    { content: 'preserve-v3' },
    { content: 'reply' }
  ])
  after.close()
})
it('sanitizes malformed new IPC outputs and rejects renderer authorization conclusions', () => {
  const item = fixture()
  const handlers = new Map<string, (event: unknown, input: unknown) => unknown>()
  const unregister = registerTimelineIpc(
    {
      handle: (channel, handler) => {
        handlers.set(channel, handler)
      },
      removeHandler: (channel) => {
        handlers.delete(channel)
      }
    },
    item.service
  )
  expect(
    handlers.get('timeline:permissions')!(null, {
      protocolVersion: 1,
      assistantId: item.assistantId,
      approved: true
    })
  ).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } })
  const spy = vi.spyOn(item.service, 'queryTimeline').mockReturnValue({
    ok: true,
    data: { assistantId: item.assistantId, messages: [], nextCursor: null, secret: 'NEVER_CROSS' }
  } as never)
  expect(
    handlers.get('timeline:query')!(null, { protocolVersion: 1, assistantId: item.assistantId })
  ).toMatchObject({ ok: false, error: { code: 'INTERNAL_ERROR' } })
  spy.mockRestore()
  unregister()
  expect(handlers.size).toBe(0)
})

it('does not send any normal history before explicit recipient permission', async () => {
  const item = fixture()
  await item.send('old-marker')
  expect((await item.send('next')).ok).toBe(true)
  expect(item.transport.mock.calls.at(-1)![0].messages.slice(1)).toEqual([
    { role: 'user', content: 'next' }
  ])
})
