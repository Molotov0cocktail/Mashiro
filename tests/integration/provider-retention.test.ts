import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, expect, it, vi } from 'vitest'
import { SqliteStore } from '../../src/main/data/sqlite.js'
import { AssistantRepository } from '../../src/main/assistant/assistant-repository.js'
import { ProviderService } from '../../src/main/provider/provider-service.js'
import { TimelineRepository } from '../../src/main/provider/timeline-repository.js'
import { validateToolCalls } from '../../src/main/provider/tool-protocol.js'
import type {
  TransportRequest,
  TransportResult
} from '../../src/main/provider/chat-completions-transport.js'

const roots: string[] = [],
  closers: (() => void)[] = []
afterEach(() => {
  closers
    .splice(0)
    .reverse()
    .forEach((close) => close())
  roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }))
})
function fixture(transport: (request: TransportRequest) => Promise<TransportResult>) {
  const root = mkdtempSync(join(tmpdir(), 'mashiro-provider-retention-'))
  roots.push(root)
  const path = join(root, 'state.sqlite'),
    store = new SqliteStore(path)
  closers.push(() => store.close())
  const assistants = new AssistantRepository(store),
    a = assistants.create('A', 0).assistants[0]!.id,
    b = assistants.create('B', 1).assistants.find((a) => a.displayName === 'B')!.id
  const protector = {
    isEncryptionAvailable: () => true,
    encryptString: (s: string) => Buffer.from(s),
    decryptString: (b: Buffer) => b.toString()
  }
  const service = ProviderService.open(path, join(root, 'credentials'), protector, transport)
  closers.push(() => service.close())
  const connection = service.saveConnection({
    protocolVersion: 1,
    displayName: 'synthetic',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    enabled: true
  })
  if (!connection.ok) throw Error('connection')
  const connectionId = connection.data.connections[0]!.id
  service.setCredential({
    protocolVersion: 1,
    connectionId,
    apiKey: 'synthetic-only',
    persistence: 'temporary'
  })
  for (const assistantId of [a, b])
    service.bindAssistant({
      protocolVersion: 1,
      assistantId,
      connectionId,
      model: 'GLM-5.3-FLASH',
      expectedVersion: null
    })
  const request = (assistantId = a, extra: Record<string, unknown> = {}) => ({
    protocolVersion: 1,
    assistantId,
    requestId: randomUUID(),
    text: '合成请求',
    mode: 'normal',
    stream: false,
    tools: 'off',
    context: { kind: 'none' },
    ...extra
  })
  return { store, service, a, b, request, timeline: new TimelineRepository(store) }
}
it('refuses cross-assistant historical requestId before transport and refuses temporary save with zero partial persistent writes', async () => {
  const transport = vi.fn(async () => ({
      status: 'completed' as const,
      text: 'synthetic reply',
      usage: null
    })),
    f = fixture(transport),
    id = randomUUID()
  f.timeline.insert(f.a, [
    {
      id: randomUUID(),
      requestId: id,
      role: 'user',
      content: 'A-only',
      status: 'completed',
      createdAt: new Date().toISOString(),
      saved: true
    },
    {
      id: randomUUID(),
      requestId: id,
      role: 'assistant',
      content: 'A-reply',
      status: 'completed',
      createdAt: new Date().toISOString(),
      saved: true
    }
  ])
  expect(
    await f.service.startChat(f.request(f.b, { requestId: id }), () => undefined)
  ).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } })
  expect(transport).not.toHaveBeenCalled()
  expect(f.timeline.read(f.b).messages).toEqual([])
  expect(
    await f.service.startChat(f.request(f.b, { requestId: id, mode: 'temporary' }), () => undefined)
  ).toMatchObject({ ok: true })
  expect(f.service.saveTemporary({ protocolVersion: 1, assistantId: f.b })).toMatchObject({
    ok: false,
    error: { code: 'INVALID_INPUT' }
  })
  expect(f.timeline.read(f.b).messages).toEqual([])
  expect(f.timeline.read(f.a).messages).toHaveLength(2)
})
it('prepares a governance tool request but never treats a second model response as local confirmation', async () => {
  let calls = 0
  const f = fixture(async () =>
    ++calls === 1
      ? {
          status: 'completed',
          text: '',
          usage: null,
          finishReason: 'tool_calls',
          toolCalls: [
            {
              id: 'governance-request',
              type: 'function',
              function: {
                name: 'request_retention_cleanup',
                arguments: JSON.stringify({
                  intent: 'withdraw-information',
                  target: { type: 'timeline' }
                })
              }
            }
          ]
        }
      : {
          status: 'completed',
          text: '请在本地预览并确认',
          usage: null,
          finishReason: 'stop',
          toolCalls: []
        }
  )
  const permission = f.service.memory.setPermissions({
    protocolVersion: 1,
    assistantId: f.a,
    scope: 'assistant',
    expectedVersion: 0,
    read: true,
    write: true,
    writeInferences: false,
    receive: true
  })
  expect(permission.ok).toBe(true)
  const result = await f.service.startChat(
    f.request(f.a, { tools: 'clock-and-memory' }),
    () => undefined
  )
  expect(result).toMatchObject({ ok: true, data: { status: 'completed' } })
  expect(calls).toBe(2)
  expect(f.store.database.prepare('SELECT 1 FROM content_tombstones').get()).toBeUndefined()
  const operations = f.service.tools({ protocolVersion: 1, assistantId: f.a, mode: 'normal' })
  if (!operations.ok) throw Error('operations')
  expect(operations.data.operations[0]).toMatchObject({
    toolName: 'request_retention_cleanup',
    state: 'SUCCEEDED',
    retentionIntent: { intent: 'withdraw-information' },
    retentionPreview: { rounds: [{ summary: null }] }
  })
  expect(f.timeline.read(f.a).messages).toHaveLength(2)
  expect(() =>
    validateToolCalls([
      {
        id: 'malicious-confirm',
        type: 'function',
        function: {
          name: 'request_retention_cleanup',
          arguments: JSON.stringify({
            intent: 'withdraw-information',
            target: { type: 'timeline' },
            accept: true
          })
        }
      }
    ])
  ).toThrow()
})

it('continues the ordinary answer after a capacity-rejected memory write with a bounded tool receipt', async () => {
  const captured: TransportRequest[] = []
  const f = fixture(async (request) => {
    captured.push(request)
    if (captured.length === 1)
      return {
        status: 'completed',
        text: '',
        usage: null,
        finishReason: 'tool_calls',
        toolCalls: [
          {
            id: 'capacity-write',
            type: 'function',
            function: {
              name: 'write_memory',
              arguments: JSON.stringify({
                kind: 'user',
                scope: 'global',
                title: '容量测试',
                markdown: '容量超限内容',
                nature: 'user-statement',
                event: null
              })
            }
          }
        ]
      }
    return {
      status: 'completed',
      text: '记忆没有保存，但我仍然回答了当前问题。',
      usage: null,
      finishReason: 'stop',
      toolCalls: []
    }
  })
  expect(
    f.service.memory.setPermissions({
      protocolVersion: 1,
      assistantId: f.a,
      scope: 'global',
      expectedVersion: 0,
      read: true,
      write: true,
      writeInferences: false,
      receive: true
    })
  ).toMatchObject({ ok: true })
  const current = await f.service.retention.policy({ protocolVersion: 1, assistantId: f.a })
  if (!current.ok) throw Error('capacity policy fixture')
  const settings = {
    ...current.data.settings,
    persistentCapacity: { enabled: true, limitBytes: 1 }
  }
  const preview = await f.service.retention.previewPolicy({
    protocolVersion: 1,
    assistantId: f.a,
    expectedRevision: current.data.revision,
    settings
  })
  if (!preview.ok) throw Error('capacity preview fixture')
  expect(
    await f.service.retention.configurePolicy({
      protocolVersion: 1,
      assistantId: f.a,
      commandId: randomUUID(),
      expectedRevision: current.data.revision,
      previewId: preview.data.id,
      settings
    })
  ).toMatchObject({ ok: true })

  const requestId = randomUUID()
  const result = await f.service.startChat(
    f.request(f.a, {
      requestId,
      text: '请记住：容量超限内容，然后继续回答当前问题。',
      tools: 'clock-and-memory'
    }),
    () => undefined
  )
  expect(result).toMatchObject({
    ok: true,
    data: { status: 'completed', text: '记忆没有保存，但我仍然回答了当前问题。' }
  })
  expect(captured).toHaveLength(2)
  expect(JSON.stringify(captured[1]!.messages)).toContain('CAPACITY_EXCEEDED')
  expect(JSON.stringify(captured[1]!.messages)).toContain('普通回答可以继续')
  expect(f.store.database.prepare('SELECT count(*) AS total FROM memory_objects').get()).toEqual({
    total: 0
  })
  expect(
    f.service.tools({
      protocolVersion: 1,
      assistantId: f.a,
      requestId,
      mode: 'normal'
    })
  ).toMatchObject({
    ok: true,
    data: {
      operations: [
        {
          toolName: 'write_memory',
          state: 'CONFIRMED_NOT_APPLIED',
          summary: expect.stringContaining('容量已满')
        }
      ]
    }
  })
})
