import { removeRetentionFixture } from './retention-legacy-fixture.js'
import { chatCompletions } from '../../src/main/provider/chat-completions-transport.js'
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { afterEach, describe, it, expect, vi } from 'vitest'
import { AssistantService } from '../../src/main/assistant/assistant-service.js'
import { ProviderService } from '../../src/main/provider/provider-service.js'
import type {
  TransportRequest,
  TransportResult
} from '../../src/main/provider/chat-completions-transport.js'
import { ToolRepository } from '../../src/main/provider/tool-repository.js'
import { TimelineRepository } from '../../src/main/provider/timeline-repository.js'
import { SqliteStore } from '../../src/main/data/sqlite.js'
const roots: string[] = []
const services: ProviderService[] = []
const protector = {
  isEncryptionAvailable: () => true,
  encryptString: (s: string) => Buffer.from(s),
  decryptString: (b: Buffer) => b.toString()
}
function setup(
  transport: (r: TransportRequest) => Promise<TransportResult>,
  clock = () => new Date('2026-09-06T01:02:03.000Z')
) {
  const root = mkdtempSync(join(tmpdir(), 'mashiro-tools-'))
  roots.push(root)
  const db = join(root, 'test.sqlite'),
    credentials = join(root, 'credentials')
  const assistants = AssistantService.open(db)
  const created = assistants.create({
    protocolVersion: 1,
    displayName: '合成',
    expectedStateRevision: 0
  })
  if (!created.ok) throw Error('fixture')
  const assistantId = created.data.assistants[0]!.id
  assistants.close()
  const service = ProviderService.open(db, credentials, protector, transport, { clock })
  services.push(service)
  const saved = service.saveConnection({
    protocolVersion: 1,
    displayName: '合成端点',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    enabled: true
  })
  if (!saved.ok) throw Error('fixture')
  const connectionId = saved.data.connections[0]!.id
  service.setCredential({
    protocolVersion: 1,
    connectionId,
    apiKey: 'synthetic-only',
    persistence: 'persistent'
  })
  service.bindAssistant({
    protocolVersion: 1,
    assistantId,
    connectionId,
    model: 'GLM-5.3-FLASH',
    expectedVersion: null
  })
  const request = (extra: Record<string, unknown> = {}) => ({
    protocolVersion: 1,
    requestId: randomUUID(),
    assistantId,
    text: '现在几点',
    stream: false,
    mode: 'normal',
    context: { kind: 'none' },
    tools: 'clock',
    ...extra
  })
  return { service, assistantId, connectionId, request, db, credentials }
}
afterEach(() => {
  for (const s of services.splice(0)) s.close()
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true })
})
const clockCall = {
  id: 'clock-1',
  type: 'function' as const,
  function: { name: 'get_current_time' as const, arguments: '{}' }
}
function grant(f: ReturnType<typeof setup>, read = true, send = true) {
  const p = f.service.permissions({ protocolVersion: 1, assistantId: f.assistantId })
  if (!p.ok) throw Error('permissions')
  return f.service.setPermissions({
    protocolVersion: 1,
    assistantId: f.assistantId,
    connectionId: p.data.connectionId,
    endpointFingerprint: p.data.endpointFingerprint,
    expectedVersion: p.data.version,
    readHistory: read,
    sendHistory: send
  })
}
function seed(f: ReturnType<typeof setup>, content = '合成主题 %_ 讨论') {
  const store = new SqliteStore(f.db),
    requestId = randomUUID(),
    timeline = new TimelineRepository(store)
  timeline.insert(
    f.assistantId,
    (['user', 'assistant'] as const).map((role) => ({
      id: randomUUID(),
      requestId,
      role,
      content: role === 'user' ? content : '合成回答',
      status: 'completed' as const,
      createdAt: '2026-09-05T01:00:00.000Z',
      saved: true
    }))
  )
  store.close()
  return requestId
}
describe('007 actual trusted tool conversation', () => {
  it('reports a history cap only when another match or excerpt truncation exists', () => {
    const f = setup(async () => ({ status: 'completed', text: '', usage: null }))
    seed(f, 'one needle')
    const store = new SqliteStore(f.db),
      repository = new TimelineRepository(store)
    expect(repository.searchHistory(f.assistantId, 'needle', 1).truncated).toBe(false)
    seed(f, 'two needle')
    expect(repository.searchHistory(f.assistantId, 'needle', 1).truncated).toBe(true)
    store.close()
  })

  it('validates all calls before executing any, including a malformed second call', async () => {
    const clock = vi.fn(() => new Date())
    const f = setup(
      async () => ({
        status: 'completed',
        text: '',
        usage: null,
        finishReason: 'tool_calls',
        toolCalls: [
          clockCall,
          {
            id: 'bad',
            type: 'function',
            function: {
              name: 'search_conversation_history',
              arguments: '{"query":"x","limit":1,"confirmed":true}'
            }
          }
        ]
      }),
      clock
    )
    expect(await f.service.startChat(f.request(), () => {})).toMatchObject({
      ok: false,
      error: { code: 'PROTOCOL' }
    })
    expect(clock).not.toHaveBeenCalled()
    expect(
      f.service.tools({ protocolVersion: 1, assistantId: f.assistantId, mode: 'normal' })
    ).toMatchObject({ ok: true, data: { operations: [] } })
  })
  it('never accepts another assistant request as selected source or citation navigation', async () => {
    const transport = vi.fn(async (): Promise<TransportResult> => ({
      status: 'completed',
      text: '',
      usage: null
    }))
    const f = setup(transport)
    const assistants = AssistantService.open(f.db)
    const list = assistants.list({ protocolVersion: 1 })
    if (!list.ok) throw Error('fixture')
    const second = assistants.create({
      protocolVersion: 1,
      displayName: '另一合成助手',
      expectedStateRevision: list.data.stateRevision
    })
    if (!second.ok) throw Error('fixture')
    const assistantId = second.data.assistants.find((a) => a.id !== f.assistantId)!.id
    assistants.close()
    const source = seed({ ...f, assistantId }, 'other assistant private')
    grant(f)
    expect(
      await f.service.startChat(
        f.request({
          tools: 'clock-and-history',
          context: { kind: 'selected', requestIds: [source] }
        }),
        () => {}
      )
    ).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } })
    expect(
      f.service.queryTimeline({ protocolVersion: 1, assistantId: f.assistantId, requestId: source })
    ).toMatchObject({ ok: true, data: { messages: [] } })
    expect(transport).not.toHaveBeenCalled()
  })

  it('actual non-stream transport does not duplicate intermediate or final visible content', async () => {
    let calls = 0
    const f = setup((request) =>
      chatCompletions(request, {
        fetch: async () => {
          const message =
            ++calls === 1
              ? { content: '先查询。', reasoning_content: 'secret', tool_calls: [clockCall] }
              : { content: '查询完成。' }
          return new Response(
            JSON.stringify({
              choices: [{ index: 0, message, finish_reason: calls === 1 ? 'tool_calls' : 'stop' }]
            }),
            { headers: { 'content-type': 'application/json' } }
          )
        }
      })
    )
    const result = await f.service.startChat(f.request(), () => {})
    expect(result).toMatchObject({
      ok: true,
      data: { text: '先查询。查询完成。', status: 'completed' }
    })
    expect(calls).toBe(2)
  })

  it('migrates v4 atomically and leaves legacy data untouched on a v5 DDL collision', () => {
    const f = setup(async () => ({ status: 'completed', text: '', usage: null }))
    seed(f)
    f.service.close()
    const legacy = new DatabaseSync(f.db)
    const before = legacy.prepare('SELECT * FROM timeline_messages').all()
    removeRetentionFixture(legacy)
    legacy.exec(
      'DROP TABLE memory_pending; DROP TABLE memory_cleanup; DROP TABLE memory_previews; DROP TABLE memory_suppressions; DROP TABLE memory_index; DROP TABLE memory_recipients; DROP TABLE memory_permissions; DROP TABLE memory_dependencies; DROP TABLE memory_commands; DROP TABLE memory_versions; DROP TABLE memory_objects; DROP TABLE provider_capability_evidence; DROP TABLE protocol_results; DROP TABLE tool_operations; DROP TABLE protocol_segments; DROP TABLE timeline_sources; PRAGMA user_version=4; CREATE TABLE tool_operations(collision TEXT)'
    )
    legacy.close()
    expect(() => new SqliteStore(f.db)).toThrow()
    const checked = new DatabaseSync(f.db)
    expect(checked.prepare('PRAGMA user_version').get()).toEqual({ user_version: 4 })
    expect(
      checked.prepare("SELECT name FROM sqlite_master WHERE name='protocol_segments'").get()
    ).toBeUndefined()
    expect(checked.prepare('SELECT * FROM timeline_messages').all()).toEqual(before)
    checked.exec('DROP TABLE tool_operations')
    checked.close()
    const upgraded = new SqliteStore(f.db)
    expect(upgraded.database.prepare('PRAGMA user_version').get()).toEqual({ user_version: 19 })
    expect(upgraded.database.prepare('SELECT * FROM timeline_messages').all()).toEqual(before)
    upgraded.close()
  })
  it('bounds global temporary segment and operation maps with explicit refusal and safe per-assistant clear', () => {
    const repo = new ToolRepository()
    const segment = {
      id: randomUUID(),
      assistantId: randomUUID(),
      requestId: randomUUID(),
      endpointFingerprint: 'test',
      model: 'model',
      adapterVersion: 'test',
      messages: [],
      createdAt: new Date().toISOString()
    }
    for (let index = 0; index < 64; index++)
      repo.create({ ...segment, id: randomUUID(), requestId: randomUUID() })
    expect(() => repo.create({ ...segment, id: randomUUID() })).toThrow()
    repo.clear(segment.assistantId)
    repo.create(segment)
    for (let index = 0; index < 768; index++) repo.prepare(segment, randomUUID(), clockCall)
    expect(() => repo.prepare(segment, randomUUID(), clockCall)).toThrow()
    repo.clear(segment.assistantId)
    expect(repo.read(segment.assistantId)).toEqual([])
  })
  it('requires source context when selecting a derived tool turn and rejects cross-model replay', async () => {
    const requests: TransportRequest[] = []
    const f = setup(async (request) => {
      requests.push(request)
      return requests.length === 1
        ? {
            status: 'completed',
            text: '',
            usage: null,
            toolCalls: [clockCall],
            finishReason: 'tool_calls'
          }
        : {
            status: 'completed',
            text: 'derived answer',
            usage: null,
            toolCalls: [],
            finishReason: 'stop'
          }
    })
    const source = seed(f, 'PRIVATE_SELECTED_SOURCE')
    grant(f)
    const toolReq = f.request({ context: { kind: 'selected', requestIds: [source] } })
    await f.service.startChat(toolReq, () => {})
    expect(
      await f.service.startChat(
        f.request({ context: { kind: 'selected', requestIds: [toolReq.requestId] } }),
        () => {}
      )
    ).toMatchObject({ ok: false, error: { code: 'PERMISSION_DENIED' } })
    const rebinding = f.service.bindAssistant({
      protocolVersion: 1,
      assistantId: f.assistantId,
      connectionId: f.connectionId,
      model: 'different-model',
      expectedVersion: 1
    })
    expect(rebinding.ok).toBe(true)
    expect(
      await f.service.startChat(
        f.request({
          tools: 'off',
          context: { kind: 'selected', requestIds: [source, toolReq.requestId] }
        }),
        () => {}
      )
    ).toMatchObject({ ok: false, error: { code: 'CONFIGURATION' } })
    expect(requests).toHaveLength(2)
  })

  it.each(['normal', 'temporary'])(
    'keeps a two-round reasoning sequence byte-exact in %s and resets only next user turn',
    async (mode) => {
      const requests: TransportRequest[] = []
      const transport = vi.fn(async (r: TransportRequest): Promise<TransportResult> => {
        requests.push(structuredClone({ ...r, signal: undefined, onDelta: undefined }))
        const index = requests.length
        return index <= 2
          ? {
              status: 'completed',
              text: '',
              usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
              toolCalls: [{ ...clockCall, id: 'clock-' + index }],
              reasoning: '原序😀 ' + index,
              finishReason: 'tool_calls'
            }
          : {
              status: 'completed',
              text: '回答',
              usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
              toolCalls: [],
              reasoning: '最终',
              finishReason: 'stop'
            }
      })
      const f = setup(transport),
        req = f.request({ mode })
      const result = await f.service.startChat(req, () => {})
      expect(result.ok && result.data.usage?.totalTokens).toBe(9)
      expect(f.service.operations.usage({ protocolVersion: 1 })).toMatchObject({
        ok: true,
        data: {
          summary: { calls: 3, known: { totalTokens: 9 }, complete: true },
          attempts: [
            { persistent: mode === 'normal' },
            { persistent: mode === 'normal' },
            { persistent: mode === 'normal' }
          ]
        }
      })
      expect(
        requests[2]!.messages.filter((m) => m.role === 'assistant').map((m) => m.reasoning_content)
      ).toEqual(['原序😀 1', '原序😀 2'])
      if (mode === 'normal') grant(f)
      await f.service.startChat(f.request({ mode, context: { kind: 'recent' } }), () => {})
      expect(requests[3]!.messages.some((m) => m.reasoning_content !== undefined)).toBe(false)
      expect(requests[3]!.messages.filter((m) => m.role === 'tool')).toHaveLength(2)
      expect(
        requests[3]!.messages.filter((m) => m.tool_calls?.length).flatMap((m) => m.tool_calls!)
      ).toHaveLength(2)
      const store = new SqliteStore(f.db)
      expect(
        (
          store.database.prepare('SELECT count(*) AS n FROM protocol_segments').get() as {
            n: number
          }
        ).n
      ).toBe(mode === 'normal' ? 2 : 0)
      expect(
        (store.database.prepare('SELECT count(*) AS n FROM tool_operations').get() as { n: number })
          .n
      ).toBe(mode === 'normal' ? 2 : 0)
      store.close()
    }
  )
  it('temporary success/save/clear/restart never copies protocol or reads normal history', async () => {
    let call = 0
    const f = setup(async () =>
      ++call === 1
        ? {
            status: 'completed',
            text: '',
            usage: null,
            toolCalls: [clockCall],
            reasoning: 'temporary-hidden',
            finishReason: 'tool_calls'
          }
        : {
            status: 'completed',
            text: 'visible-only',
            usage: null,
            toolCalls: [],
            finishReason: 'stop'
          }
    )
    seed(f)
    const spy = vi.spyOn(TimelineRepository.prototype, 'context')
    await f.service.startChat(f.request({ mode: 'temporary' }), () => {})
    expect(spy).not.toHaveBeenCalled()
    f.service.saveTemporary({ protocolVersion: 1, assistantId: f.assistantId })
    const db = new SqliteStore(f.db)
    for (const table of [
      'protocol_segments',
      'tool_operations',
      'protocol_results',
      'timeline_sources'
    ])
      expect(
        (db.database.prepare('SELECT count(*) AS n FROM ' + table).get() as { n: number }).n
      ).toBe(0)
    expect(
      JSON.stringify(db.database.prepare('SELECT content FROM timeline_messages').all())
    ).not.toContain('temporary-hidden')
    db.close()
    f.service.clearChat({ protocolVersion: 1, assistantId: f.assistantId })
    expect(
      f.service.tools({ protocolVersion: 1, assistantId: f.assistantId, mode: 'temporary' })
    ).toMatchObject({ ok: true, data: { operations: [] } })
    spy.mockRestore()
  })
  it('history search preserves leading and trailing spaces as literal data', async () => {
    let calls = 0,
      returned = ''
    const f = setup(async (request) => {
      if (++calls === 1)
        return {
          status: 'completed',
          text: '',
          usage: null,
          toolCalls: [
            {
              id: 'h',
              type: 'function',
              function: {
                name: 'search_conversation_history',
                arguments: '{"query":" needle ","limit":10}'
              }
            }
          ],
          finishReason: 'tool_calls'
        }
      returned = request.messages.at(-1)!.content
      return { status: 'completed', text: '完成', usage: null, toolCalls: [], finishReason: 'stop' }
    })
    const yes = seed(f, '包含 needle 完整空格'),
      no = seed(f, 'needle')
    grant(f)
    await f.service.startChat(
      f.request({ tools: 'clock-and-history', context: { kind: 'recent' } }),
      () => {}
    )
    expect(JSON.parse(returned).matches.map((m: { requestId: string }) => m.requestId)).toEqual([
      yes
    ])
    expect(returned).not.toContain(no)
  })
  it('history tool requires scope and both grants, searches literal selected content and exposes exact origin', async () => {
    const requests: TransportRequest[] = []
    const f = setup(async (r) => {
      requests.push(r)
      return requests.length % 2 === 1
        ? {
            status: 'completed',
            text: '',
            usage: null,
            toolCalls: [
              {
                id: 'history',
                type: 'function',
                function: {
                  name: 'search_conversation_history',
                  arguments: '{"query":"%_","limit":10}'
                }
              }
            ],
            reasoning: 'private',
            finishReason: 'tool_calls'
          }
        : {
            status: 'completed',
            text: '引用讨论',
            usage: null,
            finishReason: 'stop',
            toolCalls: []
          }
    })
    const selected = seed(f),
      other = seed(f, '另一个主题')
    const denied = await f.service.startChat(
      f.request({
        tools: 'clock-and-history',
        context: { kind: 'selected', requestIds: [selected] }
      }),
      () => {}
    )
    expect(denied).toMatchObject({ ok: false, error: { code: 'PERMISSION_DENIED' } })
    expect(requests).toHaveLength(0)
    grant(f)
    const req = f.request({
      tools: 'clock-and-history',
      context: { kind: 'selected', requestIds: [selected] }
    })
    expect((await f.service.startChat(req, () => {})).ok).toBe(true)
    const sent = JSON.parse(requests[1]!.messages.find((m) => m.role === 'tool')!.content)
    expect(sent.matches.map((m: { requestId: string }) => m.requestId)).toEqual([selected])
    expect(JSON.stringify(sent)).not.toContain(other)
    const origin = f.service.queryTimeline({
      protocolVersion: 1,
      assistantId: f.assistantId,
      requestId: selected
    })
    expect(origin.ok && origin.data.messages).toHaveLength(2)
    expect(
      f.service.queryTimeline({
        protocolVersion: 1,
        assistantId: f.assistantId,
        requestId: selected,
        query: 'x'
      })
    ).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } })
    const derivedOnly = await f.service.startChat(
      f.request({ tools: 'off', context: { kind: 'selected', requestIds: [req.requestId] } }),
      () => {}
    )
    expect(derivedOnly).toMatchObject({ ok: false, error: { code: 'PERMISSION_DENIED' } })
    grant(f, false, false)
    expect(
      f.service.tools({ protocolVersion: 1, assistantId: f.assistantId, mode: 'normal' })
    ).toMatchObject({ ok: true, data: { operations: [{ state: 'SUCCEEDED', citations: [] }] } })
  })
  it.each(['PREPARED', 'DISPATCHING', 'SUCCEEDED'])(
    'cancellation at operation %s prevents continuation and retains actual result state',
    async (state) => {
      const clock = vi.fn(() => new Date('2026-09-06T01:02:03.000Z'))
      const transport = vi.fn(async (): Promise<TransportResult> => ({
        status: 'completed',
        text: '',
        usage: null,
        toolCalls: [clockCall],
        finishReason: 'tool_calls'
      }))
      const f = setup(transport, clock),
        req = f.request()
      await f.service.startChat(req, (event) => {
        if (event.type === 'operation' && event.operation.state === state)
          f.service.cancelChat({
            protocolVersion: 1,
            assistantId: f.assistantId,
            requestId: req.requestId
          })
      })
      expect(transport).toHaveBeenCalledTimes(1)
      expect(clock).toHaveBeenCalledTimes(state === 'SUCCEEDED' ? 1 : 0)
      const ops = f.service.tools({
        protocolVersion: 1,
        assistantId: f.assistantId,
        mode: 'normal'
      })
      expect(ops.ok && ops.data.operations[0]!.state).toBe(
        state === 'SUCCEEDED'
          ? 'SUCCEEDED'
          : state === 'PREPARED'
            ? 'CANCELLED_BEFORE_DISPATCH'
            : 'CONFIRMED_NOT_APPLIED'
      )
    }
  )
  it('withdrawal inside the actual clock read retains success metadata but no result body or next request', async () => {
    const transport = vi.fn(async (): Promise<TransportResult> => ({
      status: 'completed',
      text: '',
      usage: null,
      toolCalls: [clockCall],
      finishReason: 'tool_calls'
    }))
    const f: ReturnType<typeof setup> = setup(transport, () => {
      f.service.deleteCredential({ protocolVersion: 1, connectionId: f.connectionId })
      return new Date()
    })
    const result = await f.service.startChat(f.request(), () => {})
    expect(result).toMatchObject({ ok: true, data: { status: 'cancelled' } })
    expect(transport).toHaveBeenCalledTimes(1)
    expect(
      f.service.tools({ protocolVersion: 1, assistantId: f.assistantId, mode: 'normal' })
    ).toMatchObject({ ok: true, data: { operations: [{ state: 'SUCCEEDED' }] } })
    const store = new SqliteStore(f.db)
    expect(store.database.prepare('SELECT * FROM protocol_results').all()).toHaveLength(0)
    store.close()
  })
  it('a late malformed completion after revocation is cancellation and zero reads', async () => {
    let resolve!: (v: TransportResult) => void
    const clock = vi.fn(() => new Date())
    const f = setup(
      () =>
        new Promise((r) => {
          resolve = r
        }),
      clock
    )
    seed(f)
    grant(f)
    const pending = f.service.startChat(
      f.request({ tools: 'clock-and-history', context: { kind: 'recent' } }),
      () => {}
    )
    grant(f, false, false)
    resolve({ status: 'completed', text: null, usage: null } as unknown as TransportResult)
    expect(await pending).toMatchObject({ ok: true, data: { status: 'cancelled' } })
    expect(clock).not.toHaveBeenCalled()
  })
  it('duplicate operation identity reuses success, rejects parameter conflicts, and recovers uncertain dispatch without replay', () => {
    const f = setup(async () => ({ status: 'completed', text: '', usage: null }))
    const store = new SqliteStore(f.db),
      repo = new ToolRepository(store)
    const segment = {
      id: randomUUID(),
      assistantId: f.assistantId,
      requestId: randomUUID(),
      endpointFingerprint: 'synthetic',
      model: 'model',
      adapterVersion: 'test',
      messages: [],
      createdAt: new Date().toISOString()
    }
    repo.create(segment)
    const modelRequestId = randomUUID(),
      one = repo.prepare(segment, modelRequestId, clockCall)
    repo.update({ ...one, state: 'DISPATCHING' })
    repo.update({ ...one, state: 'SUCCEEDED' }, '{"utc":"synthetic"}')
    expect(repo.prepare(segment, modelRequestId, clockCall).operationId).toBe(one.operationId)
    expect(() =>
      repo.prepare(segment, modelRequestId, {
        ...clockCall,
        function: { ...clockCall.function, arguments: '{ }' }
      })
    ).toThrow()
    expect(() => repo.update({ ...one, state: 'RESULT_UNKNOWN' })).toThrow()
    const prepared = repo.prepare(segment, randomUUID(), clockCall)
    const dispatched = repo.prepare(segment, randomUUID(), clockCall)
    repo.update({ ...dispatched, state: 'DISPATCHING' })
    repo.recover()
    const ops = repo.read(f.assistantId)
    expect(ops.find((o) => o.operationId === prepared.operationId)!.state).toBe(
      'CONFIRMED_NOT_APPLIED'
    )
    expect(ops.find((o) => o.operationId === dispatched.operationId)!.state).toBe('RESULT_UNKNOWN')
    expect(ops.find((o) => o.operationId === one.operationId)!.state).toBe('SUCCEEDED')
    store.close()
  })

  it('reads injected real clock exactly once then continues with exact private reasoning', async () => {
    const requests: TransportRequest[] = []
    const clock = vi.fn(() => new Date('2026-09-06T01:02:03.000Z'))
    const transport = vi.fn(async (r: TransportRequest): Promise<TransportResult> => {
      requests.push(structuredClone({ ...r, signal: undefined, onDelta: undefined }))
      return requests.length === 1
        ? {
            status: 'completed',
            text: '',
            usage: null,
            toolCalls: [clockCall],
            reasoning: 'private-reasoning',
            finishReason: 'tool_calls'
          }
        : {
            status: 'completed',
            text: '现在是01:02:03 UTC',
            usage: null,
            toolCalls: [],
            reasoning: 'private-final',
            finishReason: 'stop'
          }
    })
    const f = setup(transport, clock),
      events: unknown[] = []
    const req = f.request()
    const result = await f.service.startChat(req, (e) => events.push(e))
    expect(result.ok).toBe(true)
    expect(clock).toHaveBeenCalledTimes(1)
    expect(transport).toHaveBeenCalledTimes(2)
    expect(requests[1]!.messages[2]).toMatchObject({
      role: 'assistant',
      reasoning_content: 'private-reasoning',
      tool_calls: [clockCall]
    })
    expect(JSON.parse(requests[1]!.messages[3]!.content).utc).toBe('2026-09-06T01:02:03.000Z')
    expect(JSON.stringify(events)).not.toContain('private-reasoning')
    const ops = f.service.tools({ protocolVersion: 1, assistantId: f.assistantId, mode: 'normal' })
    expect(ops.ok && ops.data.operations[0]!.state).toBe('SUCCEEDED')
  })
})
