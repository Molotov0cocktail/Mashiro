import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AssistantService } from '../../src/main/assistant/assistant-service.js'
import { ProviderService } from '../../src/main/provider/provider-service.js'
import type {
  TransportRequest,
  TransportResult
} from '../../src/main/provider/chat-completions-transport.js'
import type { ChatMode } from '../../src/shared/timeline-contract.js'
import { registerTimelineIpc } from '../../src/main/ipc/register-timeline-ipc.js'
import { registerAssistantIpc } from '../../src/main/ipc/register-assistant-ipc.js'

const roots: string[] = []
const services: ProviderService[] = []
const protector = {
  isEncryptionAvailable: () => true,
  encryptString: (value: string) => Buffer.from(Buffer.from(value).map((byte) => byte ^ 0xa5)),
  decryptString: (value: Buffer) => Buffer.from(value.map((byte) => byte ^ 0xa5)).toString()
}
function fixture(transport: (request: TransportRequest) => Promise<TransportResult>) {
  const root = mkdtempSync(join(tmpdir(), 'mashiro-timeline-'))
  roots.push(root)
  const path = join(root, 'mashiro.sqlite')
  const vault = join(root, 'credentials')
  const assistants = AssistantService.open(path)
  const first = assistants.create({
    protocolVersion: 1,
    displayName: 'A',
    expectedStateRevision: 0
  })
  if (!first.ok) throw new Error('fixture')
  const second = assistants.create({
    protocolVersion: 1,
    displayName: 'B',
    expectedStateRevision: 1
  })
  if (!second.ok) throw new Error('fixture')
  const ids = second.data.assistants.map((assistant) => assistant.id)
  assistants.close()
  const open = () => {
    const service = ProviderService.open(path, vault, protector, transport)
    services.push(service)
    return service
  }
  const service = open()
  const connection = service.saveConnection({
    protocolVersion: 1,
    displayName: 'Synthetic',
    baseUrl: 'https://example.com/v1',
    enabled: true
  })
  if (!connection.ok) throw new Error('fixture')
  const connectionId = connection.data.connections[0]!.id
  service.setCredential({
    protocolVersion: 1,
    connectionId,
    apiKey: 'synthetic-key',
    persistence: 'persistent'
  })
  for (const assistantId of ids)
    service.bindAssistant({
      protocolVersion: 1,
      assistantId,
      connectionId,
      model: 'model',
      expectedVersion: null
    })
  return { root, path, vault, service, ids, connectionId, open }
}
function send(
  service: ProviderService,
  assistantId: string,
  text: string,
  mode: ChatMode = 'normal',
  stream = false
) {
  return service.startChat(
    { protocolVersion: 1, assistantId, requestId: crypto.randomUUID(), text, mode, stream },
    () => undefined
  )
}
function read(service: ProviderService, assistantId: string, mode: ChatMode = 'normal') {
  const result = service.readTimeline({ protocolVersion: 1, assistantId, mode })
  if (!result.ok) throw new Error(result.error.code)
  return result.data
}
afterEach(() => {
  for (const service of services.splice(0)) service.close()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('persistent timeline trusted boundary', () => {
  it('commits normal user and pending atomically before send, restores IDs without automatic calls', async () => {
    let path = ''
    const transport = vi.fn(async (): Promise<TransportResult> => {
      const database = new DatabaseSync(path)
      expect(
        database
          .prepare('SELECT role, content, status FROM timeline_messages ORDER BY sequence')
          .all()
      ).toEqual([
        { role: 'user', content: 'normal saved', status: 'completed' },
        { role: 'assistant', content: '', status: 'pending' }
      ])
      database.close()
      return { status: 'completed', text: 'normal reply', usage: null }
    })
    const item = fixture(transport)
    path = item.path
    expect((await send(item.service, item.ids[0]!, 'normal saved')).ok).toBe(true)
    const before = read(item.service, item.ids[0]!)
    item.service.close()
    const next = item.open()
    expect(read(next, item.ids[0]!)).toEqual(before)
    expect(transport).toHaveBeenCalledTimes(1)
  })

  it('keeps temporary mode isolated, explicitly saves once, and does not auto-save subsequent turns', async () => {
    const requests: TransportRequest[] = []
    const item = fixture(async (request) => {
      requests.push(request)
      return { status: 'completed', text: 'reply-' + requests.length, usage: null }
    })
    const id = item.ids[0]!
    await send(item.service, id, 'normal-only')
    await send(item.service, id, 'temporary-saved', 'temporary')
    expect(requests[1]!.messages).toEqual([{ role: 'user', content: 'temporary-saved' }])
    expect(read(item.service, id).messages).toHaveLength(2)
    const input = { protocolVersion: 1, assistantId: id }
    expect(item.service.saveTemporary(input).ok).toBe(true)
    expect(item.service.saveTemporary(input).ok).toBe(true)
    expect(read(item.service, id).messages).toHaveLength(4)
    expect(read(item.service, id, 'temporary').messages.every((message) => message.saved)).toBe(
      true
    )
    await send(item.service, id, 'UNSAVED_TEMPORARY_MARKER', 'temporary')
    expect(read(item.service, id).messages).toHaveLength(4)
    expect(read(item.service, item.ids[1]!).messages).toEqual([])
    expect(requests).toHaveLength(3)
    item.service.close()
    const next = item.open()
    expect(read(next, id, 'temporary').messages).toEqual([])
    expect(read(next, id).messages).toHaveLength(4)
    const disk = readdirSync(item.root)
      .filter((name) => name.startsWith('mashiro.sqlite'))
      .map((name) => readFileSync(join(item.root, name)))
    expect(disk.some((bytes) => bytes.includes(Buffer.from('UNSAVED_TEMPORARY_MARKER')))).toBe(
      false
    )
  })

  it('rolls back an entire explicit save and retains unsaved memory for a successful retry', async () => {
    const item = fixture(async () => ({
      status: 'cancelled',
      text: 'partial cancelled',
      usage: null
    }))
    const id = item.ids[0]!
    await send(item.service, id, 'keep on failure', 'temporary')
    const database = new DatabaseSync(item.path)
    database.exec(
      "CREATE TRIGGER injected_save_failure BEFORE INSERT ON timeline_messages WHEN NEW.role = 'assistant' BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END"
    )
    const input = { protocolVersion: 1, assistantId: id }
    const failure = item.service.saveTemporary(input)
    expect(failure.ok ? '' : failure.error.code).toBe('STORAGE_UNAVAILABLE')
    expect(read(item.service, id).messages).toEqual([])
    expect(read(item.service, id, 'temporary').messages.every((message) => !message.saved)).toBe(
      true
    )
    database.exec('DROP TRIGGER injected_save_failure')
    database.close()
    expect(item.service.saveTemporary(input).ok).toBe(true)
    expect(read(item.service, id).messages[1]).toMatchObject({
      status: 'cancelled',
      content: 'partial cancelled'
    })
    expect(item.service.saveTemporary(input).ok).toBe(true)
    expect(read(item.service, id).messages).toHaveLength(2)
  })

  it('never calls transport if the normal pre-send transaction fails', async () => {
    const transport = vi.fn(async (): Promise<TransportResult> => ({
      status: 'completed',
      text: 'must not run',
      usage: null
    }))
    const item = fixture(transport)
    const database = new DatabaseSync(item.path)
    database.exec(
      "CREATE TRIGGER injected_start_failure BEFORE INSERT ON timeline_messages WHEN NEW.role = 'assistant' BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END"
    )
    const result = await send(item.service, item.ids[0]!, 'never send')
    expect(result.ok ? '' : result.error.code).toBe('STORAGE_UNAVAILABLE')
    expect(transport).not.toHaveBeenCalled()
    expect(read(item.service, item.ids[0]!).messages).toEqual([])
    database.close()
  })

  it('preserves failed/partial states and excludes them from future normal context', async () => {
    const requests: TransportRequest[] = []
    const states = ['failed', 'cancelled', 'interrupted', 'completed'] as const
    const item = fixture(async (request) => {
      requests.push(request)
      return {
        status: states[requests.length - 1]!,
        text: 'partial-' + requests.length,
        usage: null,
        error: 'temporary'
      }
    })
    const id = item.ids[0]!
    for (let index = 0; index < states.length; index++)
      await send(item.service, id, 'turn-' + index)
    expect(
      read(item.service, id)
        .messages.filter((message) => message.role === 'assistant')
        .map((message) => message.status)
    ).toEqual(states)
    expect(requests.map((request) => request.messages.length)).toEqual([1, 1, 1, 1])
    expect(read(item.service, id).messages[1]!.content).toBe('partial-1')
  })

  it('retains streamed partial on normal close and blocks temporary saving while active', async () => {
    let release!: (result: TransportResult) => void
    const transport = vi.fn((request: TransportRequest) => {
      request.onDelta?.('received before close')
      return new Promise<TransportResult>((resolve) => {
        release = resolve
      })
    })
    const item = fixture(transport)
    const id = item.ids[0]!
    const running = send(item.service, id, 'close request', 'normal', true)
    expect(item.service.saveTemporary({ protocolVersion: 1, assistantId: id }).ok).toBe(false)
    item.service.close()
    const next = item.open()
    expect(read(next, id).messages[1]).toMatchObject({
      status: 'interrupted',
      content: 'received before close'
    })
    release({ status: 'completed', text: 'late must not overwrite', usage: null })
    await running
    expect(read(next, id).messages[1]!.content).toBe('received before close')
    expect(transport).toHaveBeenCalledTimes(1)
  })

  it('reports final persistence failure honestly and recovers the pending row without resend', async () => {
    const transport = vi.fn(async (): Promise<TransportResult> => ({
      status: 'completed',
      text: 'received answer',
      usage: null
    }))
    const item = fixture(transport)
    const database = new DatabaseSync(item.path)
    database.exec(
      "CREATE TRIGGER injected_finish_failure BEFORE UPDATE ON timeline_messages BEGIN SELECT RAISE(ABORT, 'synthetic final failure'); END"
    )
    const result = await send(item.service, item.ids[0]!, 'write fails after transport')
    expect(result.ok ? '' : result.error.code).toBe('STORAGE_UNAVAILABLE')
    expect(JSON.stringify(result)).not.toMatch(/synthetic final|SQLite|received answer/)
    expect(read(item.service, item.ids[0]!).messages[1]!.status).toBe('pending')
    database.exec('DROP TRIGGER injected_finish_failure')
    database.close()
    item.service.close()
    const next = item.open()
    expect(read(next, item.ids[0]!).messages[1]!.status).toBe('interrupted')
    expect(transport).toHaveBeenCalledTimes(1)
  })

  it('cancels on recipient revocation and refuses further sends while disabled', async () => {
    let release!: (result: TransportResult) => void
    let signal!: AbortSignal
    const transport = vi.fn((request: TransportRequest) => {
      signal = request.signal!
      request.onDelta?.('before revocation')
      return new Promise<TransportResult>((resolve) => {
        release = resolve
      })
    })
    const item = fixture(transport)
    const id = item.ids[0]!
    const running = send(item.service, id, 'revocation', 'normal', true)
    const listed = item.service.list({ protocolVersion: 1 })
    if (!listed.ok) throw new Error('fixture')
    const connection = listed.data.connections[0]!
    expect(
      item.service.saveConnection({
        protocolVersion: 1,
        connectionId: connection.id,
        displayName: connection.displayName,
        baseUrl: connection.baseUrl,
        enabled: false,
        expectedVersion: connection.version
      }).ok
    ).toBe(true)
    expect(signal.aborted).toBe(true)
    release({ status: 'completed', text: 'late response', usage: null })
    const final = await running
    expect(final.ok && final.data.status).toBe('cancelled')
    expect(read(item.service, id).messages[1]!.status).toBe('cancelled')
    const refused = await send(item.service, id, 'disabled')
    expect(refused.ok ? '' : refused.error.code).toBe('CONNECTION_DISABLED')
    expect(transport).toHaveBeenCalledTimes(1)
  })

  it('bounds adversarial stream deltas and stores failure instead of completed output', async () => {
    const item = fixture(async (request) => {
      request.onDelta?.('x'.repeat(120001))
      return { status: 'completed', text: 'fake success', usage: null }
    })
    const result = await send(item.service, item.ids[0]!, 'bounded stream', 'normal', true)
    expect(result.ok ? '' : result.error.code).toBe('LIMIT')
    const response = read(item.service, item.ids[0]!).messages[1]!
    expect(response.status).toBe('failed')
    expect(response.content).toHaveLength(120000)
  })

  it('immediately cancels the captured request when its assistant is archived through IPC', async () => {
    let release!: (result: TransportResult) => void
    let signal!: AbortSignal
    const item = fixture((request) => {
      signal = request.signal!
      return new Promise((resolve) => {
        release = resolve
      })
    })
    const assistants = AssistantService.open(item.path)
    const before = assistants.list({ protocolVersion: 1 })
    if (!before.ok) throw new Error('fixture')
    const target = before.data.assistants.find(
      (assistant) => assistant.id !== before.data.primaryAssistantId
    )!
    const running = send(item.service, target.id, 'archive during request')
    const handlers = new Map<string, (event: unknown, input: unknown) => unknown>()
    const remove = registerAssistantIpc(
      {
        handle: (name, handler) => {
          handlers.set(name, handler)
        },
        removeHandler: (name) => {
          handlers.delete(name)
        }
      },
      assistants,
      () => item.service.cancelArchivedRequests()
    )
    expect(
      handlers.get('assistant:archive')!(null, {
        protocolVersion: 1,
        assistantId: target.id,
        expectedAssistantVersion: target.version,
        expectedStateRevision: before.data.stateRevision
      })
    ).toMatchObject({ ok: true })
    expect(signal.aborted).toBe(true)
    release({ status: 'completed', text: 'late archived output', usage: null })
    expect((await running).ok).toBe(true)
    expect(read(item.service, target.id).messages[1]!.status).toBe('cancelled')
    remove()
    assistants.close()
  })

  it('uses at most 16 complete current-assistant pairs with a 64000-character budget', async () => {
    const requests: TransportRequest[] = []
    const item = fixture(async (request) => {
      requests.push(request)
      return { status: 'completed', text: 'r'.repeat(2000), usage: null }
    })
    const id = item.ids[0]!
    await send(item.service, item.ids[1]!, 'OTHER_ASSISTANT')
    await send(item.service, id, 'UNSAVED_TEMP', 'temporary')
    for (let index = 0; index < 20; index++)
      await send(item.service, id, ('normal-' + index).padEnd(2000, 'x'))
    const request = requests.at(-1)!
    expect(request.messages.length).toBe(31)
    expect(
      request.messages.reduce((sum, message) => sum + message.content.length, 0)
    ).toBeLessThanOrEqual(64000)
    expect(request.messages.map((message) => message.content).join('')).not.toMatch(
      /OTHER_ASSISTANT|UNSAVED_TEMP|normal-0x/
    )
    expect(read(item.service, id).messages).toHaveLength(40)
  })

  it('routes overlapping assistants to captured identities and rejects forged timeline inputs', async () => {
    const releases: ((result: TransportResult) => void)[] = []
    const item = fixture(
      () =>
        new Promise((resolve) => {
          releases.push(resolve)
        })
    )
    const first = send(item.service, item.ids[0]!, 'A')
    const second = send(item.service, item.ids[1]!, 'B')
    releases[1]!({ status: 'completed', text: 'B reply', usage: null })
    releases[0]!({ status: 'completed', text: 'A reply', usage: null })
    await Promise.all([first, second])
    expect(read(item.service, item.ids[0]!).messages[1]!.content).toBe('A reply')
    expect(read(item.service, item.ids[1]!).messages[1]!.content).toBe('B reply')
    expect(
      item.service.readTimeline({
        protocolVersion: 1,
        assistantId: item.ids[0],
        mode: 'normal',
        authorized: true
      }).ok
    ).toBe(false)
    expect(
      item.service.saveTemporary({ protocolVersion: 1, assistantId: item.ids[0], messages: [] }).ok
    ).toBe(false)
    const handlers = new Map<string, (event: unknown, input: unknown) => unknown>()
    const remove = registerTimelineIpc(
      {
        handle: (name, handler) => {
          handlers.set(name, handler)
        },
        removeHandler: (name) => {
          handlers.delete(name)
        }
      },
      item.service
    )
    expect(handlers.size).toBe(2)
    expect(
      handlers.get('timeline:read')!(null, {
        protocolVersion: 1,
        assistantId: item.ids[0],
        mode: 'normal',
        sql: 'anything'
      })
    ).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } })
    remove()
    expect(handlers.size).toBe(0)
  })
})
