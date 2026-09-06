import { SqliteStore } from '../../../src/main/data/sqlite.js'

import { DatabaseSync } from 'node:sqlite'

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { AssistantService } from '../../../src/main/assistant/assistant-service.js'
import { ProviderService } from '../../../src/main/provider/provider-service.js'
import type {
  TransportRequest,
  TransportResult
} from '../../../src/main/provider/chat-completions-transport.js'
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
it('independent cancellation wins against invalid late transport usage', async () => {
  const item = fixture()
  await item.send('HISTORY')
  permission(item)
  let captured!: TransportRequest
  let release!: (result: TransportResult) => void
  item.transport.mockImplementationOnce(request => {
    captured = request
    request.onDelta?.('ACCEPTED_PARTIAL')
    return new Promise(resolve => { release = resolve })
  })
  const pending = item.service.startChat({ protocolVersion: 1, assistantId: item.assistantId, requestId: crypto.randomUUID(), mode: 'normal', text: 'REVOKE', stream: true }, () => {})
  expect(captured.messages.map(row => row.content)).toEqual(['HISTORY', 'reply', 'REVOKE'])
  expect(permission(item, true, false)).toMatchObject({ ok: true })
  expect(captured.signal?.aborted).toBe(true)
  captured.onDelta?.('LATE_BODY')
  release({ status: 'completed', text: 'LATE_BODY', usage: { promptTokens: -1, completionTokens: 1, totalTokens: 0 } })
  await pending
  expect(messages(item).at(-1)).toMatchObject({ status: 'cancelled', content: 'ACCEPTED_PARTIAL' })
})

it('independent persistent credential survives failed then successful populated v3 upgrade', async () => {
  const { readFileSync, readdirSync } = await import('node:fs')
  const item = fixture()
  expect(item.service.setCredential({ protocolVersion: 1, connectionId: item.connectionId, apiKey: 'SYNTHETIC_REVIEW', persistence: 'persistent' })).toMatchObject({ ok: true })
  await item.send('PRESERVED')
  const directory = join(item.path, '..', 'credentials')
  const credentialFile = join(directory, readdirSync(directory)[0]!)
  const before = readFileSync(credentialFile)
  item.service.close()
  const db = new DatabaseSync(item.path)
  db.exec('DROP TABLE history_recipient_grants; DROP TABLE history_permissions; PRAGMA user_version=3; CREATE TABLE history_recipient_grants(collision TEXT)')
  db.close()
  expect(() => new SqliteStore(item.path)).toThrow()
  expect(readFileSync(credentialFile)).toEqual(before)
  const inspect = new DatabaseSync(item.path)
  expect(inspect.prepare('PRAGMA user_version').get()).toMatchObject({ user_version: 3 })
  expect(inspect.prepare('SELECT content FROM timeline_messages ORDER BY sequence').all()).toEqual([{ content: 'PRESERVED' }, { content: 'reply' }])
  inspect.exec('DROP TABLE history_recipient_grants')
  inspect.close()
  const reopened = ProviderService.open(item.path, directory, { isEncryptionAvailable: () => true, encryptString: value => Buffer.from(value), decryptString: value => value.toString() }, item.transport)
  try {
    expect(readFileSync(credentialFile)).toEqual(before)
    expect(await reopened.startChat({ protocolVersion: 1, assistantId: item.assistantId, requestId: crypto.randomUUID(), mode: 'normal', text: 'AFTER_UPGRADE', stream: false }, () => {})).toMatchObject({ ok: true })
    expect(item.transport.mock.calls.at(-1)![0]).toMatchObject({ apiKey: 'SYNTHETIC_REVIEW', messages: [{ role: 'user', content: 'AFTER_UPGRADE' }] })
  } finally { reopened.close() }
})
