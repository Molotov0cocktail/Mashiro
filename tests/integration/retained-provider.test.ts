import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { afterEach, expect, it, vi } from 'vitest'
import { AssistantService } from '../../src/main/assistant/assistant-service.js'
import { ProviderService } from '../../src/main/provider/provider-service.js'
import { SqliteStore } from '../../src/main/data/sqlite.js'
import type {
  TransportRequest,
  TransportResult
} from '../../src/main/provider/chat-completions-transport.js'

const cleanup: (() => void)[] = []
afterEach(() => {
  for (const action of cleanup.splice(0).reverse()) action()
})
const protector = {
  isEncryptionAvailable: () => true,
  encryptString: (s: string) => Buffer.from(s),
  decryptString: (b: Buffer) => b.toString()
}
const answer = (text = '合成回答', reasoning = '隐藏协议推理'): TransportResult => ({
  status: 'completed',
  text,
  reasoning,
  finishReason: 'stop',
  usage: null
})
function setup(transport: (request: TransportRequest) => Promise<TransportResult>) {
  const root = mkdtempSync(join(tmpdir(), 'mashiro-retained-'))
  cleanup.push(() => rmSync(root, { recursive: true, force: true }))
  const path = join(root, 'state.sqlite'),
    credentials = join(root, 'credentials')
  const assistants = AssistantService.open(path)
  const created = assistants.create({
    protocolVersion: 1,
    displayName: '合成助手',
    expectedStateRevision: 0
  })
  if (!created.ok) throw Error('fixture')
  const assistantId = created.data.assistants[0]!.id
  assistants.close()
  let service = ProviderService.open(path, credentials, protector, transport)
  cleanup.push(() => service.close())
  const connection = service.saveConnection({
    protocolVersion: 1,
    displayName: '合成 DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    enabled: true
  })
  if (!connection.ok) throw Error('fixture')
  const connectionId = connection.data.connections[0]!.id
  expect(
    service.setCredential({
      protocolVersion: 1,
      connectionId,
      apiKey: 'synthetic-only',
      persistence: 'persistent'
    }).ok
  ).toBe(true)
  expect(
    service.bindAssistant({
      protocolVersion: 1,
      assistantId,
      connectionId,
      model: 'deepseek-v4-flash',
      expectedVersion: null
    }).ok
  ).toBe(true)
  const permissions = service.permissions({ protocolVersion: 1, assistantId })
  if (!permissions.ok) throw Error('fixture')
  expect(
    service.setPermissions({
      protocolVersion: 1,
      assistantId,
      connectionId,
      endpointFingerprint: permissions.data.endpointFingerprint,
      expectedVersion: permissions.data.version,
      readHistory: true,
      sendHistory: true
    }).ok
  ).toBe(true)
  const request = (extra: Record<string, unknown> = {}) => ({
    protocolVersion: 1,
    requestId: randomUUID(),
    assistantId,
    text: '合成问题',
    stream: false,
    mode: 'normal',
    context: { kind: 'none' },
    tools: 'off',
    ...extra
  })
  return {
    get service() {
      return service
    },
    path,
    assistantId,
    connectionId,
    request,
    restart() {
      service.close()
      service = ProviderService.open(path, credentials, protector, transport)
    }
  }
}

it('persists plain reasoning and replays it after restart when tools are enabled, including final no-tool assistant turns', async () => {
  const transport = vi.fn(async (): Promise<TransportResult> => answer())
  const f = setup(transport)
  const first = f.request()
  expect((await f.service.startChat(first, () => {})).ok).toBe(true)
  f.restart()
  const second = f.request({
    tools: 'clock',
    context: { kind: 'selected', requestIds: [first.requestId] }
  })
  expect((await f.service.startChat(second, () => {})).ok).toBe(true)
  expect(transport.mock.calls).toHaveLength(2)
  const store = new SqliteStore(f.path)
  try {
    const rows = store.database
      .prepare('SELECT mode,status,messages_json FROM protocol_segments ORDER BY rowid')
      .all()
    expect(rows).toHaveLength(2)
    expect(rows.every((r) => r.mode === 'retained-thinking' && r.status === 'closed')).toBe(true)
    expect(
      JSON.parse(String(rows[1]!.messages_json)).filter(
        (m: { role: string }) => m.role === 'assistant'
      )
    ).toEqual([
      { role: 'assistant', content: '合成回答', reasoning_content: '隐藏协议推理' },
      { role: 'assistant', content: '合成回答', reasoning_content: '隐藏协议推理' }
    ])
    expect(
      store.database
        .prepare("SELECT content FROM timeline_messages WHERE role='assistant'")
        .all()
        .map((r) => r.content)
    ).toEqual(['合成回答', '合成回答'])
  } finally {
    store.close()
  }
})

it('keeps every real tool reasoning and result together and strips reasoning only from tools-off outbound copies', async () => {
  const sent: TransportRequest[] = []
  const f = setup(async (request) => {
    sent.push(structuredClone({ ...request, signal: undefined, onDelta: undefined }))
    return sent.length === 1
      ? {
          status: 'completed',
          text: '',
          reasoning: '真实工具推理',
          finishReason: 'tool_calls',
          usage: null,
          toolCalls: [
            {
              id: 'clock-one',
              type: 'function',
              function: { name: 'get_current_time', arguments: '{}' }
            }
          ]
        }
      : answer()
  })
  const first = f.request({ tools: 'clock' })
  expect((await f.service.startChat(first, () => {})).ok).toBe(true)
  expect(sent).toHaveLength(2)
  expect(
    sent[1]!.messages.some((m) => m.role === 'assistant' && m.reasoning_content === '真实工具推理')
  ).toBe(true)
  expect(sent[1]!.messages.some((m) => m.role === 'tool' && m.tool_call_id === 'clock-one')).toBe(
    true
  )
  expect(
    (
      await f.service.startChat(
        f.request({ context: { kind: 'selected', requestIds: [first.requestId] } }),
        () => {}
      )
    ).ok
  ).toBe(true)
  expect(sent[2]!.messages.every((m) => m.reasoning_content === undefined)).toBe(true)
  const store = new SqliteStore(f.path)
  try {
    expect(
      String(
        store.database
          .prepare('SELECT messages_json FROM protocol_segments WHERE request_id=?')
          .get(first.requestId)!.messages_json
      )
    ).toContain('真实工具推理')
  } finally {
    store.close()
  }
})

it('rejects missing legacy reasoning and retained budget overflow before another network request', async () => {
  const transport = vi.fn(async (): Promise<TransportResult> => answer())
  const f = setup(transport),
    first = f.request()
  expect((await f.service.startChat(first, () => {})).ok).toBe(true)
  const store = new SqliteStore(f.path)
  try {
    const row = store.database
      .prepare('SELECT messages_json FROM protocol_segments WHERE request_id=?')
      .get(first.requestId)!
    const messages = JSON.parse(String(row.messages_json))
    messages.at(-1).reasoning_content = 'x'.repeat(120000)
    store.database
      .prepare('UPDATE protocol_segments SET messages_json=? WHERE request_id=?')
      .run(JSON.stringify(messages), first.requestId)
    expect(
      await f.service.startChat(
        f.request({ tools: 'clock', context: { kind: 'selected', requestIds: [first.requestId] } }),
        () => {}
      )
    ).toMatchObject({ ok: false, error: { code: 'LIMIT' } })
    store.database.prepare('DELETE FROM protocol_segments WHERE request_id=?').run(first.requestId)
    expect(
      await f.service.startChat(
        f.request({ tools: 'clock', context: { kind: 'selected', requestIds: [first.requestId] } }),
        () => {}
      )
    ).toMatchObject({ ok: false, error: { code: 'CONFIGURATION' } })
    expect(transport).toHaveBeenCalledTimes(1)
  } finally {
    store.close()
  }
})

it('executes explicit local item intent before the provider and supplies an honest local receipt without synthetic assistant reasoning', async () => {
  const sent: TransportRequest[] = []
  const f = setup(async (request) => {
    sent.push(request)
    return answer('已收到本地回执')
  })
  expect(
    f.service.items.setPermissions({
      protocolVersion: 1,
      assistantId: f.assistantId,
      expectedVersion: 0,
      read: true,
      write: true,
      propose: true,
      receive: true
    }).ok
  ).toBe(true)
  const request = f.request({ text: '创建任务：合成协议验收', tools: 'items' })
  expect((await f.service.startChat(request, () => {})).ok).toBe(true)
  expect(sent).toHaveLength(1)
  expect(
    sent[0]!.messages.some((m) => m.role === 'system' && m.content.includes('实际本地回执'))
  ).toBe(true)
  expect(sent[0]!.messages.filter((m) => m.role === 'assistant' || m.role === 'tool')).toEqual([])
  const operations = f.service.tools({
    protocolVersion: 1,
    assistantId: f.assistantId,
    mode: 'normal'
  })
  expect(operations).toMatchObject({
    ok: true,
    data: { operations: [{ origin: 'local-user-intent', state: 'SUCCEEDED' }] }
  })
  const query = f.service.items.query({
    protocolVersion: 1,
    assistantId: f.assistantId,
    view: 'items'
  })
  expect(query).toMatchObject({
    ok: true,
    data: { items: [{ content: { title: '合成协议验收' } }] }
  })
})

it('temporary plain retained conversations never persist their protocol or timeline', async () => {
  const f = setup(async () => answer())
  expect((await f.service.startChat(f.request({ mode: 'temporary' }), () => {})).ok).toBe(true)
  const store = new SqliteStore(f.path)
  try {
    expect(store.database.prepare('SELECT count(*) n FROM protocol_segments').get()!.n).toBe(0)
    expect(store.database.prepare('SELECT count(*) n FROM timeline_messages').get()!.n).toBe(0)
  } finally {
    store.close()
  }
})

it('rejects an in-flight binding change before accepting late reasoning or dispatching a tool', async () => {
  let resolve!: (result: TransportResult) => void
  const transport = vi.fn(
    () =>
      new Promise<TransportResult>((done) => {
        resolve = done
      })
  )
  const f = setup(transport)
  const pending = f.service.startChat(f.request({ tools: 'clock' }), () => {})
  expect(transport).toHaveBeenCalledTimes(1)
  expect(
    f.service.bindAssistant({
      protocolVersion: 1,
      assistantId: f.assistantId,
      connectionId: f.connectionId,
      model: 'deepseek-v4-pro',
      expectedVersion: 1
    }).ok
  ).toBe(true)
  resolve({
    ...answer(),
    finishReason: 'tool_calls',
    toolCalls: [
      {
        id: 'late-clock',
        type: 'function',
        function: { name: 'get_current_time', arguments: '{}' }
      }
    ]
  })
  expect((await pending).ok).toBe(false)
  expect(
    f.service.tools({ protocolVersion: 1, assistantId: f.assistantId, mode: 'normal' })
  ).toMatchObject({ ok: true, data: { operations: [] } })
  const store = new SqliteStore(f.path)
  try {
    expect(store.database.prepare('SELECT status FROM protocol_segments').all()).toEqual([
      { status: 'interrupted' }
    ])
  } finally {
    store.close()
  }
})

it('refuses selected retained history after revocation without a new network call', async () => {
  const transport = vi.fn(async (): Promise<TransportResult> => answer()),
    f = setup(transport),
    first = f.request()
  expect((await f.service.startChat(first, () => {})).ok).toBe(true)
  const permissions = f.service.permissions({ protocolVersion: 1, assistantId: f.assistantId })
  if (!permissions.ok) throw Error('fixture')
  expect(
    f.service.setPermissions({
      protocolVersion: 1,
      assistantId: f.assistantId,
      connectionId: f.connectionId,
      endpointFingerprint: permissions.data.endpointFingerprint,
      expectedVersion: permissions.data.version,
      readHistory: true,
      sendHistory: false
    }).ok
  ).toBe(true)
  expect(
    (
      await f.service.startChat(
        f.request({ tools: 'clock', context: { kind: 'selected', requestIds: [first.requestId] } }),
        () => {}
      )
    ).ok
  ).toBe(false)
  expect(transport).toHaveBeenCalledTimes(1)
})

it('does not repeat a committed local item when the provider fails and the same request is retried', async () => {
  const transport = vi.fn(async (): Promise<TransportResult> => ({
    status: 'failed',
    text: '',
    usage: null,
    error: 'temporary'
  }))
  const f = setup(transport)
  expect(
    f.service.items.setPermissions({
      protocolVersion: 1,
      assistantId: f.assistantId,
      expectedVersion: 0,
      read: true,
      write: true,
      propose: true,
      receive: true
    }).ok
  ).toBe(true)
  const request = f.request({ tools: 'items', text: '新建任务：合成稳定回执' })
  expect((await f.service.startChat(request, () => {})).ok).toBe(false)
  expect((await f.service.startChat(request, () => {})).ok).toBe(false)
  expect(transport).toHaveBeenCalledTimes(1)
  expect(
    f.service.items.query({ protocolVersion: 1, assistantId: f.assistantId, view: 'items' })
  ).toMatchObject({
    ok: true,
    data: { formalCount: 1, items: [{ content: { title: '合成稳定回执' } }] }
  })
  expect(
    f.service.tools({ protocolVersion: 1, assistantId: f.assistantId, mode: 'normal' })
  ).toMatchObject({
    ok: true,
    data: { operations: [{ origin: 'local-user-intent', state: 'SUCCEEDED' }] }
  })
})

it('reports finite documented retained capability without promoting injected transport success to live evidence', async () => {
  const f = setup(async () => answer())
  expect((await f.service.startChat(f.request({ tools: 'clock' }), () => {})).ok).toBe(true)
  const capability = f.service.capabilities({ protocolVersion: 1, assistantId: f.assistantId })
  expect(capability).toMatchObject({
    ok: true,
    data: {
      mode: 'retained-thinking',
      adapterVersion: 'deepseek-v4-retained-v1',
      toolsAvailable: true
    }
  })
  if (!capability.ok) throw Error('fixture')
  expect(capability.data.evidence.find((e) => e.capability === 'preserved-thinking')?.level).toBe(
    'DOCUMENTED'
  )
  expect(capability.data.evidence.some((e) => e.level === 'LIVE_VERIFIED')).toBe(false)
})
