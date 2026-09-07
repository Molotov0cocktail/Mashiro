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
it('expiry aborts in-flight Provider transport and a late successful result cannot restore its answer', async () => {
  let resolveTransport!: (value: TransportResult) => void
  let captured: TransportRequest | undefined
  const transport = vi.fn((request: TransportRequest) => {
    captured = request
    return new Promise<TransportResult>((resolve) => {
      resolveTransport = resolve
    })
  })
  const f = fixture(transport)
  const made = f.service.memory.mutate({
    protocolVersion: 1,
    assistantId: f.a,
    commandId: randomUUID(),
    mutation: {
      action: 'remember',
      targetId: null,
      expectedVersion: null,
      kind: 'continuity',
      scope: 'assistant',
      title: '到期对象',
      markdown: '合成可恢复正文',
      nature: 'faithful-summary',
      event: null
    }
  })
  if (!made.ok) throw Error('FIXTURE_MEMORY')
  expect(
    await f.service.retention.move({
      protocolVersion: 1,
      assistantId: f.a,
      commandId: randomUUID(),
      id: made.data.objectId,
      expectedVersion: 1,
      expectedEpoch: f.service.retention.epoch,
      zone: 'staging'
    })
  ).toMatchObject({ ok: true })
  f.store.database
    .prepare('UPDATE retention_policy_objects SET staging_entered_at=? WHERE object_id=?')
    .run('2025-01-01T00:00:00.000Z', made.data.objectId)
  const request = f.request()
  const pending = f.service.startChat(request, () => undefined)
  await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(1))
  expect(
    await f.service.retention.runPolicy({
      protocolVersion: 1,
      assistantId: f.a,
      expectedRevision: 1
    })
  ).toMatchObject({ ok: true })
  expect(captured!.signal?.aborted).toBe(true)
  resolveTransport({ status: 'completed', text: 'LATE_PRIVATE_ANSWER', usage: null })
  const result = await pending
  expect(JSON.stringify(result)).not.toContain('LATE_PRIVATE_ANSWER')
  expect(JSON.stringify(f.timeline.read(f.a))).not.toContain('LATE_PRIVATE_ANSWER')
  const row = f.store.database
    .prepare('SELECT record_json FROM memory_objects WHERE id=?')
    .get(made.data.objectId)!
  expect(JSON.parse(String(row.record_json))).toMatchObject({ retention: 'trash', state: 'active' })
})
