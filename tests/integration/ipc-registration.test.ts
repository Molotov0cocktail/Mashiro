import { describe, expect, it, vi } from 'vitest'
import { registerAssistantIpc } from '../../src/main/ipc/register-assistant-ipc.js'
import { assistantResultSchema, type AssistantResult } from '../../src/shared/assistant-contract.js'
import { assistantChannels } from '../../src/shared/assistant-channels.js'
import type { AssistantService } from '../../src/main/assistant/assistant-service.js'

const emptySuccess: AssistantResult = {
  ok: true,
  data: {
    assistants: [],
    currentAssistantId: null,
    primaryAssistantId: null,
    stateRevision: 0
  }
}

function createIpcHarness(service: AssistantService) {
  const listeners = new Map<string, (_event: unknown, input: unknown) => AssistantResult>()
  const ipcMain = {
    handle: vi.fn(
      (channel: string, listener: (_event: unknown, input: unknown) => AssistantResult): void => {
        listeners.set(channel, listener)
      }
    ),
    removeHandler: vi.fn((channel: string) => listeners.delete(channel))
  }
  const unregister = registerAssistantIpc(ipcMain, service)
  return { listeners, ipcMain, unregister }
}

describe('assistant IPC registration', () => {
  it('validates and forwards normal results for exactly the six narrow handlers', () => {
    const service = {
      list: vi.fn().mockReturnValue(emptySuccess),
      create: vi.fn().mockReturnValue(emptySuccess),
      switch: vi.fn().mockReturnValue(emptySuccess),
      rename: vi.fn().mockReturnValue(emptySuccess),
      setPrimary: vi.fn().mockReturnValue(emptySuccess),
      archive: vi.fn().mockReturnValue(emptySuccess)
    } as unknown as AssistantService
    const { listeners, ipcMain, unregister } = createIpcHarness(service)

    expect([...listeners.keys()].sort()).toEqual(Object.values(assistantChannels).sort())
    const input = { protocolVersion: 1 }
    for (const channel of Object.values(assistantChannels)) {
      expect(listeners.get(channel)?.({}, input)).toEqual(emptySuccess)
    }
    expect(service.list).toHaveBeenCalledWith(input)
    expect(service.create).toHaveBeenCalledWith(input)
    expect(service.switch).toHaveBeenCalledWith(input)
    expect(service.rename).toHaveBeenCalledWith(input)
    expect(service.setPrimary).toHaveBeenCalledWith(input)
    expect(service.archive).toHaveBeenCalledWith(input)

    unregister()
    expect(ipcMain.removeHandler.mock.calls.map(([channel]) => channel).sort()).toEqual(
      Object.values(assistantChannels).sort()
    )
  })

  it('replaces malformed success and error results with fresh redacted internal errors', () => {
    const malformedSuccess = {
      ok: true,
      data: { internalPath: 'D:\\Mashiro\\node_modules\\secret.js' }
    }
    const malformedError = {
      ok: false,
      error: {
        code: 'SQLITE_ERROR',
        message: 'SELECT secret FROM assistants at file:///D:/Mashiro/out/main/index.js',
        correlationId: 'not-a-uuid',
        retryable: false,
        stack: 'at repository (D:\\Mashiro\\src\\repository.ts:1:1)'
      }
    }
    const service = {
      list: vi.fn().mockReturnValue(emptySuccess),
      create: vi.fn().mockReturnValue(malformedSuccess),
      switch: vi.fn().mockReturnValue(emptySuccess),
      rename: vi.fn().mockReturnValue(malformedError),
      setPrimary: vi.fn().mockReturnValue(emptySuccess),
      archive: vi.fn().mockImplementation(() => {
        throw new Error('D:\\Mashiro\\node_modules\\sqlite stack')
      })
    } as unknown as AssistantService
    const { listeners } = createIpcHarness(service)

    const results = [
      listeners.get(assistantChannels.create)?.({}, { protocolVersion: 1 }),
      listeners.get(assistantChannels.rename)?.({}, { protocolVersion: 1 }),
      listeners.get(assistantChannels.archive)?.({}, { protocolVersion: 1 })
    ]
    for (const result of results) {
      expect(assistantResultSchema.safeParse(result).success).toBe(true)
      expect(result).toMatchObject({
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Assistant service failed',
          retryable: false
        }
      })
      expect(JSON.stringify(result)).not.toMatch(
        /D:\\|file:\/\/\/|node_modules|SQL|SQLite|stack|secret/iu
      )
    }
    const correlationIds = results.map((result) =>
      result && !result.ok ? result.error.correlationId : undefined
    )
    expect(correlationIds.every((value) => /^[0-9a-f-]{36}$/u.test(value ?? ''))).toBe(true)
    expect(new Set(correlationIds).size).toBe(3)
  })
})
