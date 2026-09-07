import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, expect, it, vi } from 'vitest'
import { SqliteStore } from '../../src/main/data/sqlite.js'
import { AssistantRepository } from '../../src/main/assistant/assistant-repository.js'
import { ProviderService } from '../../src/main/provider/provider-service.js'
import { TimelineRepository } from '../../src/main/provider/timeline-repository.js'

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
function audit(f: ReturnType<typeof fixture>) {
  const policy = (
    f.service.retention as unknown as {
      policyService: { invalidateAudit(): void; snapshot(): { audit: { state: string } } }
    }
  ).policyService
  const complete = () => vi.waitFor(() => expect(policy.snapshot().audit.state).toBe('COMPLETE'))
  return { policy, complete }
}
function seed(f: ReturnType<typeof fixture>) {
  expect(
    f.service.memory.mutate({
      protocolVersion: 1,
      assistantId: f.a,
      commandId: randomUUID(),
      mutation: {
        action: 'remember',
        targetId: null,
        expectedVersion: null,
        kind: 'continuity',
        scope: 'assistant',
        title: '审计合成对象',
        markdown: 'AAAA',
        nature: 'faithful-summary',
        event: null
      }
    })
  ).toMatchObject({ ok: true })
}
it('a pure completed retention audit preserves temporary conversation history', async () => {
  const f = fixture(async () => ({
    status: 'completed',
    text: 'KEEP_TEMPORARY_ANSWER',
    usage: null
  }))
  seed(f)
  const a = audit(f)
  await a.complete()
  await f.service.startChat(f.request(f.a, { mode: 'temporary' }), () => undefined)
  const input = { protocolVersion: 1, assistantId: f.a, mode: 'temporary' }
  const before = f.service.readTimeline(input)
  expect(JSON.stringify(before)).toContain('KEEP_TEMPORARY_ANSWER')
  a.policy.invalidateAudit()
  await a.complete()
  expect(f.service.readTimeline(input)).toEqual(before)
})
it.each(['normal', 'temporary'] as const)(
  'a pure completed audit does not cancel a pending %s response',
  async (mode) => {
    let captured: TransportRequest | undefined
    let resolveTransport!: (value: TransportResult) => void
    const f = fixture((request) => {
      captured = request
      return new Promise<TransportResult>((resolve) => {
        resolveTransport = resolve
      })
    })
    seed(f)
    const a = audit(f)
    await a.complete()
    const pending = f.service.startChat(f.request(f.a, { mode }), () => undefined)
    await vi.waitFor(() => expect(captured).toBeDefined())
    try {
      a.policy.invalidateAudit()
      await a.complete()
      expect(captured!.signal?.aborted).toBe(false)
    } finally {
      resolveTransport({ status: 'completed', text: 'KEEP_PENDING_ANSWER', usage: null })
      await pending
    }
    expect(
      JSON.stringify(f.service.readTimeline({ protocolVersion: 1, assistantId: f.a, mode }))
    ).toContain('KEEP_PENDING_ANSWER')
  }
)
it('a policy preview and configuration without moving objects preserves temporary history', async () => {
  const f = fixture(async () => ({ status: 'completed', text: 'KEEP_CONFIG_ANSWER', usage: null }))
  seed(f)
  await audit(f).complete()
  await f.service.startChat(f.request(f.a, { mode: 'temporary' }), () => undefined)
  const input = { protocolVersion: 1, assistantId: f.a, mode: 'temporary' }
  const before = f.service.readTimeline(input)
  expect(JSON.stringify(before)).toContain('KEEP_CONFIG_ANSWER')
  const current = await f.service.retention.policy({ protocolVersion: 1, assistantId: f.a })
  if (!current.ok) throw Error('POLICY_FIXTURE')
  const settings = {
    persistentCapacity: { enabled: true, limitBytes: 104857600 },
    stagingExpiry: { enabled: true, days: 91 }
  }
  const preview = await f.service.retention.previewPolicy({
    protocolVersion: 1,
    assistantId: f.a,
    expectedRevision: current.data.revision,
    settings
  })
  if (!preview.ok) throw Error('PREVIEW_FIXTURE')
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
  expect(f.service.readTimeline(input)).toEqual(before)
})
