import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { afterEach, expect, it } from 'vitest'
import { AssistantService } from '../../src/main/assistant/assistant-service.js'
import { ProviderService } from '../../src/main/provider/provider-service.js'
import type {
  TransportRequest,
  TransportResult
} from '../../src/main/provider/chat-completions-transport.js'

const cleanup: (() => void)[] = []
afterEach(() =>
  cleanup
    .splice(0)
    .reverse()
    .forEach((fn) => fn())
)
const protector = {
  isEncryptionAvailable: () => true,
  encryptString: (s: string) => Buffer.from(s),
  decryptString: (b: Buffer) => b.toString()
}
function fixture(
  transport: (request: TransportRequest) => Promise<TransportResult>,
  scope: 'global' | 'assistant' = 'global'
) {
  const root = mkdtempSync(join(tmpdir(), 'mashiro-review017-'))
  cleanup.push(() => rmSync(root, { recursive: true, force: true }))
  const path = join(root, 'state.sqlite')
  const assistants = AssistantService.open(path)
  const made = assistants.create({
    protocolVersion: 1,
    displayName: '独立合成',
    expectedStateRevision: 0
  })
  if (!made.ok) throw Error('assistant fixture')
  const assistantId = made.data.assistants[0]!.id
  assistants.close()
  let service = ProviderService.open(path, join(root, 'credentials'), protector, transport)
  cleanup.push(() => service.close())
  const connection = service.saveConnection({
    protocolVersion: 1,
    displayName: '独立合成',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    enabled: true
  })
  if (!connection.ok) throw Error('connection fixture')
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
  const permissions = service.permissions({ protocolVersion: 1, assistantId })
  if (!permissions.ok) throw Error('permissions fixture')
  service.setPermissions({
    protocolVersion: 1,
    assistantId,
    connectionId,
    endpointFingerprint: permissions.data.endpointFingerprint,
    expectedVersion: permissions.data.version,
    readHistory: true,
    sendHistory: true
  })
  service.memory.setPermissions({
    protocolVersion: 1,
    assistantId,
    scope,
    expectedVersion: 0,
    read: true,
    write: true,
    writeInferences: false,
    receive: true
  })
  const mutation = {
    action: 'remember' as const,
    targetId: null,
    expectedVersion: null,
    kind: 'user' as const,
    scope,
    title: '独立合成',
    markdown: '独立内容',
    nature: 'user-statement' as const,
    event: null
  }
  const memory = service.memory.mutate({
    protocolVersion: 1,
    assistantId,
    commandId: randomUUID(),
    mutation
  })
  if (!memory.ok) throw Error('memory fixture')
  const requestId = randomUUID()
  const request = {
    protocolVersion: 1,
    assistantId,
    requestId,
    mode: 'normal',
    context: { kind: 'none' },
    tools: 'clock-and-memory',
    text: '搜索独立合成',
    stream: true
  }
  const query = () =>
    service.memory.round({
      protocolVersion: 1,
      assistantId,
      requestId,
      mode: 'normal',
      section: 'provided'
    })
  return {
    get service() {
      return service
    },
    request,
    query,
    assistantId,
    mutation,
    memoryId: memory.data.objectId,
    reopen() {
      service.close()
      service = ProviderService.open(path, join(root, 'credentials'), protector, transport)
    }
  }
}
const search: TransportResult = {
  status: 'completed',
  text: '',
  usage: null,
  finishReason: 'tool_calls',
  toolCalls: [
    {
      id: 'review-search',
      type: 'function',
      function: {
        name: 'search_memory',
        arguments: JSON.stringify({ query: '独立合成', limit: 1 })
      }
    }
  ]
}

it('keeps dispatch uncertain when cancellation has no response; survives production reopen without transport', async () => {
  let calls = 0
  const f = fixture(async () =>
    ++calls === 1 ? search : { status: 'cancelled', text: '', usage: null }
  )
  await f.service.startChat(f.request, () => undefined)
  expect(calls).toBe(2)
  const expected = {
    ok: true,
    data: {
      entries: [
        { objectId: f.memoryId, evidence: 'DISPATCH_STARTED', record: { markdown: '独立内容' } }
      ]
    }
  }
  expect(f.query()).toMatchObject(expected)
  f.reopen()
  expect(f.query()).toMatchObject(expected)
  expect(calls).toBe(2)
})

it('preserves observed streaming evidence when transport throws after a real delta', async () => {
  let calls = 0
  const f = fixture(async (request) => {
    if (++calls === 1) return search
    request.onDelta?.('已收到的部分文本')
    throw Error('synthetic stream failure after delta')
  })
  await f.service.startChat(f.request, () => undefined)
  expect(calls).toBe(2)
  expect(f.query()).toMatchObject({
    ok: true,
    data: { entries: [{ evidence: 'RESPONSE_OBSERVED' }] }
  })
  f.reopen()
  expect(f.query()).toMatchObject({
    ok: true,
    data: { entries: [{ evidence: 'RESPONSE_OBSERVED' }] }
  })
  expect(calls).toBe(2)
})

it('old provided version cannot revive through correction, navigation, reopen and permission revocation', async () => {
  let calls = 0
  const f = fixture(async () =>
    ++calls === 1 ? search : { status: 'completed', text: '合成回答', usage: null }
  )
  await f.service.startChat(f.request, () => undefined)
  expect(
    f.service.memory.mutate({
      protocolVersion: 1,
      assistantId: f.assistantId,
      commandId: randomUUID(),
      mutation: {
        ...f.mutation,
        action: 'correct',
        targetId: f.memoryId,
        expectedVersion: 1,
        markdown: '新版本独立内容'
      }
    }).ok
  ).toBe(true)
  f.reopen()
  const result = f.query()
  expect(result).toMatchObject({
    ok: true,
    data: {
      entries: [{ objectVersion: 1, availability: 'obsolete', record: null, canInspect: true }]
    }
  })
  expect(JSON.stringify(result)).not.toContain('独立内容')
  expect(
    f.service.memory.setPermissions({
      protocolVersion: 1,
      assistantId: f.assistantId,
      scope: 'global',
      expectedVersion: 1,
      read: false,
      write: true,
      writeInferences: false,
      receive: false
    }).ok
  ).toBe(true)
  expect(f.query()).toMatchObject({
    ok: true,
    data: { entries: [{ record: null, canInspect: false, availability: 'unavailable' }] }
  })
  expect(calls).toBe(2)
})

it.each(['withdraw-information', 'purge-assistant'] as const)(
  'rejects surviving evidence after real %s confirmation',
  async (intent) => {
    let calls = 0
    const f = fixture(
      async () => (++calls === 1 ? search : { status: 'completed', text: '合成回答', usage: null }),
      'assistant'
    )
    await f.service.startChat(f.request, () => undefined)
    expect(f.query()).toMatchObject({
      ok: true,
      data: { entries: [{ record: { markdown: '独立内容' } }] }
    })
    const preview = await f.service.retention.preview({
      protocolVersion: 1,
      assistantId: f.assistantId,
      intent,
      target:
        intent === 'purge-assistant'
          ? { type: 'assistant', replacementAssistantId: null }
          : { type: 'timeline' }
    })
    expect(preview).toMatchObject({ ok: true, data: { blockers: [] } })
    if (!preview.ok) throw Error('retention preview')
    expect(
      (
        await f.service.retention.confirm({
          protocolVersion: 1,
          assistantId: f.assistantId,
          commandId: randomUUID(),
          previewId: preview.data.id,
          nonce: preview.data.nonce,
          accept: true
        })
      ).ok
    ).toBe(true)
    expect(f.query()).toMatchObject({ ok: false, error: { code: 'PERMISSION_DENIED' } })
    if (intent === 'purge-assistant')
      expect(
        f.service.memory.inspect({ protocolVersion: 1, assistantId: f.assistantId, id: f.memoryId })
      ).toMatchObject({ ok: false, error: { code: 'PERMISSION_DENIED' } })
    f.reopen()
    expect(f.query()).toMatchObject({ ok: false })
    expect(JSON.stringify(f.query())).not.toContain('独立内容')
    expect(calls).toBe(2)
  }
)
