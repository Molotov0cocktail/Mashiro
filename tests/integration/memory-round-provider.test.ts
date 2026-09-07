import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { afterEach, expect, it, vi } from 'vitest'
import { AssistantService } from '../../src/main/assistant/assistant-service.js'
import { ProviderService } from '../../src/main/provider/provider-service.js'
import type {
  TransportRequest,
  TransportResult
} from '../../src/main/provider/chat-completions-transport.js'
import { migrateMemoryRound } from '../../src/main/memory/memory-round-schema.js'

const cleanups: (() => void)[] = []
afterEach(() =>
  cleanups
    .splice(0)
    .reverse()
    .forEach((fn) => fn())
)
function setup(transport: (request: TransportRequest) => Promise<TransportResult>) {
  const root = mkdtempSync(join(tmpdir(), 'mashiro-round-provider-017-'))
  cleanups.push(() => rmSync(root, { recursive: true, force: true }))
  const path = join(root, 'state.sqlite')
  const assistants = AssistantService.open(path)
  const created = assistants.create({
    protocolVersion: 1,
    displayName: '合成',
    expectedStateRevision: 0
  })
  if (!created.ok) throw Error('fixture')
  const assistantId = created.data.assistants[0]!.id
  assistants.close()
  const service = ProviderService.open(
    path,
    join(root, 'credentials'),
    {
      isEncryptionAvailable: () => true,
      encryptString: (s) => Buffer.from(s),
      decryptString: (b) => b.toString()
    },
    transport
  )
  cleanups.push(() => service.close())
  const db = new DatabaseSync(path)
  cleanups.push(() => db.close())
  migrateMemoryRound(db)
  const connection = service.saveConnection({
    protocolVersion: 1,
    displayName: '合成端点',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    enabled: true
  })
  if (!connection.ok) throw Error('fixture')
  const connectionId = connection.data.connections[0]!.id
  service.setCredential({
    protocolVersion: 1,
    connectionId,
    apiKey: 'synthetic-only',
    persistence: 'temporary'
  })
  service.bindAssistant({
    protocolVersion: 1,
    assistantId,
    connectionId,
    model: 'glm-5.3-flash',
    expectedVersion: null
  })
  const p = service.permissions({ protocolVersion: 1, assistantId })
  if (!p.ok) throw Error('fixture')
  service.setPermissions({
    protocolVersion: 1,
    assistantId,
    connectionId,
    endpointFingerprint: p.data.endpointFingerprint,
    expectedVersion: p.data.version,
    readHistory: true,
    sendHistory: true
  })
  service.memory.setPermissions({
    protocolVersion: 1,
    assistantId,
    scope: 'global',
    expectedVersion: 0,
    read: true,
    write: true,
    writeInferences: false,
    receive: true
  })
  const memory = service.memory.mutate({
    protocolVersion: 1,
    assistantId,
    commandId: randomUUID(),
    mutation: {
      action: 'remember',
      targetId: null,
      expectedVersion: null,
      kind: 'user',
      scope: 'global',
      title: '合成派发记忆',
      markdown: '合成派发秘密',
      nature: 'user-statement',
      event: null
    }
  })
  if (!memory.ok) throw Error('fixture')
  const requestId = randomUUID()
  const request = {
    protocolVersion: 1,
    assistantId,
    requestId,
    mode: 'normal',
    context: { kind: 'none' },
    tools: 'clock-and-memory',
    text: '搜索合成派发',
    stream: false
  }
  const query = () =>
    service.memory.round({
      protocolVersion: 1,
      assistantId,
      requestId,
      mode: 'normal',
      section: 'provided'
    })
  return { service, db, request, query, assistantId, requestId, memoryId: memory.data.objectId }
}
const search: TransportResult = {
  status: 'completed',
  text: '',
  usage: null,
  finishReason: 'tool_calls',
  toolCalls: [
    {
      id: 'synthetic-search',
      type: 'function',
      function: {
        name: 'search_memory',
        arguments: JSON.stringify({ query: '合成派发', limit: 1 })
      }
    }
  ]
}
it.each(['complete', 'throw', 'partial'] as const)(
  'records actual transport evidence for %s and preserves it after the chain closes',
  async (outcome) => {
    let calls = 0
    const f = setup(async (request) => {
      calls++
      if (calls === 1) return search
      expect(
        request.messages.some((m) => m.role === 'tool' && m.content.includes('合成派发秘密'))
      ).toBe(true)
      if (outcome === 'throw') throw Error('synthetic transport failure')
      if (outcome === 'partial') {
        request.onDelta?.('部分')
        return { status: 'cancelled', text: '部分', usage: null }
      }
      return { status: 'completed', text: '合成回答', usage: null, finishReason: 'stop' }
    })
    await f.service.startChat({ ...f.request, stream: outcome === 'partial' }, () => undefined)
    expect(calls).toBe(2)
    expect(f.query()).toMatchObject({
      ok: true,
      data: {
        entries: [
          {
            objectId: f.memoryId,
            objectVersion: 1,
            evidence: outcome === 'throw' ? 'DISPATCH_STARTED' : 'RESPONSE_OBSERVED'
          }
        ]
      }
    })
    expect(f.db.prepare('SELECT count(*) AS n FROM memory_round_evidence').get()!.n).toBe(1)
  }
)
it.each(['cancel', 'revoke'] as const)(
  'never claims dispatch when %s happens after local search',
  async (action) => {
    let calls = 0
    const f = setup(async () => {
      calls++
      return search
    })
    const original = f.service.memory.search.bind(f.service.memory)
    vi.spyOn(f.service.memory, 'search').mockImplementation((...args) => {
      const records = original(...args)
      if (action === 'cancel')
        f.service.cancelChat({
          protocolVersion: 1,
          assistantId: f.assistantId,
          requestId: f.requestId
        })
      else
        f.db
          .prepare('UPDATE memory_permissions SET read_allowed=0 WHERE assistant_id=?')
          .run(f.assistantId)
      return records
    })
    await f.service.startChat(f.request, () => undefined)
    expect(calls).toBe(1)
    expect(f.query()).toMatchObject({
      ok: true,
      data: { entries: [{ evidence: 'PREPARED', dispatchedAt: null }] }
    })
  }
)
it('records memory included by actual prior protocol replay under the new request identity', async () => {
  let calls = 0
  const f = setup(async () => {
    calls++
    return calls === 1
      ? search
      : { status: 'completed', text: '合成回答', usage: null, finishReason: 'stop' }
  })
  expect((await f.service.startChat(f.request, () => undefined)).ok).toBe(true)
  const nextId = randomUUID()
  expect(
    (
      await f.service.startChat(
        { ...f.request, requestId: nextId, context: { kind: 'recent' } },
        () => undefined
      )
    ).ok
  ).toBe(true)
  expect(calls).toBe(3)
  expect(
    f.service.memory.round({
      protocolVersion: 1,
      assistantId: f.assistantId,
      requestId: nextId,
      mode: 'normal',
      section: 'provided'
    })
  ).toMatchObject({
    ok: true,
    data: { entries: [{ objectId: f.memoryId, evidence: 'RESPONSE_OBSERVED' }] }
  })
})
it('strict temporary performs no memory search and adds no evidence or normal messages', async () => {
  const f = setup(async () => ({
    status: 'completed',
    text: '合成临时回答',
    usage: null,
    finishReason: 'stop'
  }))
  const spy = vi.spyOn(f.service.memory, 'search')
  await f.service.startChat({ ...f.request, mode: 'temporary', tools: 'off' }, () => undefined)
  expect(spy).not.toHaveBeenCalled()
  expect(f.db.prepare('SELECT count(*) AS n FROM memory_round_evidence').get()!.n).toBe(0)
  expect(f.db.prepare('SELECT count(*) AS n FROM timeline_messages').get()!.n).toBe(0)
})
