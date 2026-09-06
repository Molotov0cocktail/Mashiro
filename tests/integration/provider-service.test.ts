import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AssistantService } from '../../src/main/assistant/assistant-service.js'
import type { CredentialProtector } from '../../src/main/provider/credential-vault.js'
import { ProviderService } from '../../src/main/provider/provider-service.js'
import type {
  TransportRequest,
  TransportResult
} from '../../src/main/provider/chat-completions-transport.js'

const roots: string[] = []
const protector: CredentialProtector = {
  isEncryptionAvailable: () => true,
  encryptString: (value) => Buffer.from(Buffer.from(value, 'utf8').map((byte) => byte ^ 0xa5)),
  decryptString: (value) => Buffer.from(value.map((byte) => byte ^ 0xa5)).toString('utf8')
}
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'mashiro-provider-service-'))
  roots.push(root)
  const databasePath = join(root, 'mashiro.sqlite')
  const credentialDirectory = join(root, 'credentials')
  const assistants = AssistantService.open(databasePath)
  const created = assistants.create({
    protocolVersion: 1,
    displayName: 'Alpha',
    expectedStateRevision: 0
  })
  if (!created.ok) throw new Error('assistant fixture failed')
  const assistantId = created.data.assistants[0]!.id
  assistants.close()
  return { root, databasePath, credentialDirectory, assistantId }
}
function configure(
  service: ProviderService,
  assistantId: string,
  persistence: 'temporary' | 'persistent' = 'temporary',
  key = 'test-key-value'
): string {
  const saved = service.saveConnection({
    protocolVersion: 1,
    displayName: 'BigModel',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    enabled: true
  })
  if (!saved.ok) throw new Error('connection fixture failed')
  const connectionId = saved.data.connections[0]!.id
  const credential = service.setCredential({
    protocolVersion: 1,
    connectionId,
    apiKey: key,
    persistence
  })
  if (!credential.ok) throw new Error('credential fixture failed')
  const binding = service.bindAssistant({
    protocolVersion: 1,
    assistantId,
    connectionId,
    model: 'GLM-5.3-FLASH',
    expectedVersion: null
  })
  if (!binding.ok) throw new Error('binding fixture failed')
  return connectionId
}
afterEach(() => {
  vi.restoreAllMocks()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('ProviderService', () => {
  it('persists connection and binding but clears temporary key and chat on restart', async () => {
    const item = fixture()
    const requests: TransportRequest[] = []
    const transport = vi.fn(async (request: TransportRequest): Promise<TransportResult> => {
      requests.push(request)
      return {
        status: 'completed',
        text: 'reply-' + requests.length,
        usage: { promptTokens: 2, completionTokens: 3, totalTokens: 5 }
      }
    })
    const first = ProviderService.open(
      item.databasePath,
      item.credentialDirectory,
      protector,
      transport
    )
    const connectionId = configure(first, item.assistantId)
    const one = await first.startChat(
      {
        protocolVersion: 1,
        requestId: crypto.randomUUID(),
        assistantId: item.assistantId,
        text: 'first',
        stream: false
      },
      () => undefined
    )
    const two = await first.startChat(
      {
        protocolVersion: 1,
        requestId: crypto.randomUUID(),
        assistantId: item.assistantId,
        text: 'second',
        stream: false
      },
      () => undefined
    )
    expect(one.ok && one.data.usage?.totalTokens).toBe(5)
    expect(two.ok).toBe(true)
    expect(requests[1]!.messages.map((message) => message.content)).toEqual([
      'first',
      'reply-1',
      'second'
    ])
    expect(transport).toHaveBeenCalledTimes(2)
    first.close()

    const second = ProviderService.open(
      item.databasePath,
      item.credentialDirectory,
      protector,
      transport
    )
    const snapshot = second.list({ protocolVersion: 1 })
    expect(snapshot.ok && snapshot.data.connections[0]?.id).toBe(connectionId)
    expect(snapshot.ok && snapshot.data.bindings[0]?.assistantId).toBe(item.assistantId)
    expect(snapshot.ok && snapshot.data.connections[0]?.credentialPersistence).toBe('none')
    const missing = await second.startChat(
      {
        protocolVersion: 1,
        requestId: crypto.randomUUID(),
        assistantId: item.assistantId,
        text: 'after restart',
        stream: false
      },
      () => undefined
    )
    expect(missing.ok ? '' : missing.error.code).toBe('CREDENTIAL_MISSING')
    expect(transport).toHaveBeenCalledTimes(2)
    second.close()
  })

  it('stores only protected persistent bytes and restores the persistent key after a temporary override', async () => {
    const item = fixture()
    let seenKey = ''
    const transport = vi.fn(async (request: TransportRequest): Promise<TransportResult> => {
      seenKey = request.apiKey
      return { status: 'completed', text: 'ok', usage: null }
    })
    const first = ProviderService.open(
      item.databasePath,
      item.credentialDirectory,
      protector,
      transport
    )
    const connectionId = configure(first, item.assistantId, 'persistent', 'persistent-secret')
    const file = readdirSync(item.credentialDirectory)[0]!
    expect(readFileSync(join(item.credentialDirectory, file), 'utf8')).not.toContain(
      'persistent-secret'
    )
    const temporary = first.setCredential({
      protocolVersion: 1,
      connectionId,
      apiKey: 'temporary-secret',
      persistence: 'temporary'
    })
    expect(temporary.ok && temporary.data.connections[0]?.credentialPersistence).toBe('temporary')
    first.close()

    const second = ProviderService.open(
      item.databasePath,
      item.credentialDirectory,
      protector,
      transport
    )
    const snapshot = second.list({ protocolVersion: 1 })
    expect(snapshot.ok && snapshot.data.connections[0]?.credentialPersistence).toBe('persistent')
    await second.startChat(
      {
        protocolVersion: 1,
        requestId: crypto.randomUUID(),
        assistantId: item.assistantId,
        text: 'synthetic',
        stream: false
      },
      () => undefined
    )
    expect(seenKey).toBe('persistent-secret')
    second.close()
  })

  it('refuses persistent saving when credential protection is unavailable', () => {
    const item = fixture()
    const unavailable = { ...protector, isEncryptionAvailable: () => false }
    const service = ProviderService.open(
      item.databasePath,
      item.credentialDirectory,
      unavailable,
      async () => ({ status: 'completed', text: '', usage: null })
    )
    const saved = service.saveConnection({
      protocolVersion: 1,
      displayName: 'Safe',
      baseUrl: 'https://example.com/v1',
      enabled: true
    })
    if (!saved.ok) throw new Error('connection fixture failed')
    const result = service.setCredential({
      protocolVersion: 1,
      connectionId: saved.data.connections[0]!.id,
      apiKey: 'must-never-be-written',
      persistence: 'persistent'
    })
    expect(result.ok ? '' : result.error.code).toBe('CREDENTIAL_PROTECTION_UNAVAILABLE')
    expect(readdirSync(item.credentialDirectory)).toEqual([])
    const snapshot = service.list({ protocolVersion: 1 })
    expect(snapshot.ok && snapshot.data.connections[0]?.hasCredential).toBe(false)
    service.close()
  })

  it('cancels exactly the matching in-flight request and never retries it', async () => {
    const item = fixture()
    const transport = vi.fn(
      (request: TransportRequest) =>
        new Promise<TransportResult>((resolve) => {
          request.signal?.addEventListener(
            'abort',
            () => resolve({ status: 'cancelled', text: 'partial', usage: null }),
            { once: true }
          )
        })
    )
    const service = ProviderService.open(
      item.databasePath,
      item.credentialDirectory,
      protector,
      transport
    )
    configure(service, item.assistantId)
    const requestId = crypto.randomUUID()
    const running = service.startChat(
      {
        protocolVersion: 1,
        requestId,
        assistantId: item.assistantId,
        text: 'cancel me',
        stream: true
      },
      () => undefined
    )
    await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(1))
    const cancelled = service.cancelChat({
      protocolVersion: 1,
      requestId,
      assistantId: item.assistantId
    })
    expect(cancelled.ok && cancelled.data.status).toBe('cancelled')
    const final = await running
    expect(final.ok && final.data.status).toBe('cancelled')
    expect(transport).toHaveBeenCalledTimes(1)
    service.close()
  })

  it('keeps request ids unique and cancels by the execution segment connection', async () => {
    const item = fixture()
    const assistants = AssistantService.open(item.databasePath)
    const listed = assistants.list({ protocolVersion: 1 })
    if (!listed.ok) throw new Error('assistant list failed')
    const secondCreated = assistants.create({
      protocolVersion: 1,
      displayName: 'Beta',
      expectedStateRevision: listed.data.stateRevision
    })
    if (!secondCreated.ok) throw new Error('second assistant failed')
    const secondId = secondCreated.data.assistants.find(
      (assistant) => assistant.id !== item.assistantId
    )!.id
    assistants.close()

    const transport = vi.fn(
      (request: TransportRequest) =>
        new Promise<TransportResult>((resolve) => {
          request.signal?.addEventListener(
            'abort',
            () => resolve({ status: 'cancelled', text: '', usage: null }),
            { once: true }
          )
        })
    )
    const service = ProviderService.open(
      item.databasePath,
      item.credentialDirectory,
      protector,
      transport
    )
    const firstConnectionId = configure(service, item.assistantId)
    const secondConnection = service.saveConnection({
      protocolVersion: 1,
      displayName: 'Second',
      baseUrl: 'https://example.com/v1',
      enabled: true
    })
    if (!secondConnection.ok) throw new Error('second connection failed')
    const secondConnectionId = secondConnection.data.connections.find(
      (connection) => connection.id !== firstConnectionId
    )!.id
    service.setCredential({
      protocolVersion: 1,
      connectionId: secondConnectionId,
      apiKey: 'second-key',
      persistence: 'temporary'
    })
    service.bindAssistant({
      protocolVersion: 1,
      assistantId: secondId,
      connectionId: secondConnectionId,
      model: 'model-two',
      expectedVersion: null
    })

    const requestId = crypto.randomUUID()
    const running = service.startChat(
      {
        protocolVersion: 1,
        requestId,
        assistantId: item.assistantId,
        text: 'running',
        stream: true
      },
      () => undefined
    )
    await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(1))
    const duplicate = await service.startChat(
      {
        protocolVersion: 1,
        requestId,
        assistantId: secondId,
        text: 'duplicate id',
        stream: true
      },
      () => undefined
    )
    expect(duplicate.ok ? '' : duplicate.error.code).toBe('REQUEST_IN_PROGRESS')

    const rebound = service.bindAssistant({
      protocolVersion: 1,
      assistantId: item.assistantId,
      connectionId: secondConnectionId,
      model: 'model-two',
      expectedVersion: 1
    })
    expect(rebound.ok).toBe(true)
    service.deleteCredential({ protocolVersion: 1, connectionId: firstConnectionId })
    const final = await running
    expect(final.ok && final.data.status).toBe('cancelled')
    expect(transport).toHaveBeenCalledTimes(1)
    service.close()
  })

  it('rejects an overlong in-memory session without silently trimming or calling again', async () => {
    const item = fixture()
    const transport = vi.fn(async (): Promise<TransportResult> => ({
      status: 'completed',
      text: '',
      usage: null
    }))
    const service = ProviderService.open(
      item.databasePath,
      item.credentialDirectory,
      protector,
      transport
    )
    configure(service, item.assistantId)
    for (let index = 0; index < 32; index += 1) {
      const result = await service.startChat(
        {
          protocolVersion: 1,
          requestId: crypto.randomUUID(),
          assistantId: item.assistantId,
          text: 'message-' + index,
          stream: false
        },
        () => undefined
      )
      expect(result.ok).toBe(true)
    }
    const limited = await service.startChat(
      {
        protocolVersion: 1,
        requestId: crypto.randomUUID(),
        assistantId: item.assistantId,
        text: 'one too many',
        stream: false
      },
      () => undefined
    )
    expect(limited.ok ? '' : limited.error.code).toBe('LIMIT')
    expect(transport).toHaveBeenCalledTimes(32)
    service.close()
  })

  it('validates oversized transport output before state mutation and supports explicit clear', async () => {
    const item = fixture()
    let call = 0
    const seenMessages: string[][] = []
    const transport = vi.fn(async (request: TransportRequest): Promise<TransportResult> => {
      call += 1
      seenMessages.push(request.messages.map((message) => message.content))
      return call === 1
        ? { status: 'completed', text: 'x'.repeat(120001), usage: null }
        : { status: 'completed', text: 'ok', usage: null }
    })
    const service = ProviderService.open(
      item.databasePath,
      item.credentialDirectory,
      protector,
      transport
    )
    configure(service, item.assistantId)
    const events: string[] = []
    const first = await service.startChat(
      {
        protocolVersion: 1,
        requestId: crypto.randomUUID(),
        assistantId: item.assistantId,
        text: 'oversized',
        stream: false
      },
      (event) => events.push(event.type)
    )
    expect(first.ok ? '' : first.error.code).toBe('LIMIT')
    expect(events).toEqual(['failed'])

    const second = await service.startChat(
      {
        protocolVersion: 1,
        requestId: crypto.randomUUID(),
        assistantId: item.assistantId,
        text: 'fresh',
        stream: false
      },
      () => undefined
    )
    expect(second.ok).toBe(true)
    expect(seenMessages[1]).toEqual(['fresh'])
    const cleared = service.clearChat({
      protocolVersion: 1,
      assistantId: item.assistantId
    })
    expect(cleared.ok).toBe(true)
    await service.startChat(
      {
        protocolVersion: 1,
        requestId: crypto.randomUUID(),
        assistantId: item.assistantId,
        text: 'after clear',
        stream: false
      },
      () => undefined
    )
    expect(seenMessages[2]).toEqual(['after clear'])
    service.close()
  })
})
