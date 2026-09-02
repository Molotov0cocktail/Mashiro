import { describe, expect, it, vi } from 'vitest'
import { registerAssistantIpc } from '../../src/main/ipc/register-assistant-ipc.js'
import { assistantChannels } from '../../src/shared/assistant-channels.js'
import type { AssistantService } from '../../src/main/assistant/assistant-service.js'

describe('assistant IPC registration', () => {
  it('registers, forwards, and removes exactly the six narrow handlers', () => {
    const listeners = new Map<string, (_event: unknown, input: unknown) => unknown>()
    const ipcMain = {
      handle: vi.fn((channel: string, listener: (_event: unknown, input: unknown) => unknown) => {
        listeners.set(channel, listener)
      }),
      removeHandler: vi.fn((channel: string) => listeners.delete(channel))
    }
    const service = {
      list: vi.fn().mockReturnValue({ ok: true }),
      create: vi.fn().mockReturnValue({ ok: true }),
      switch: vi.fn().mockReturnValue({ ok: true }),
      rename: vi.fn().mockReturnValue({ ok: true }),
      setPrimary: vi.fn().mockReturnValue({ ok: true }),
      archive: vi.fn().mockReturnValue({ ok: true })
    } as unknown as AssistantService

    const unregister = registerAssistantIpc(ipcMain, service)
    expect([...listeners.keys()].sort()).toEqual(Object.values(assistantChannels).sort())
    const input = { protocolVersion: 1, unexpected: 'trusted-service-will-reject' }
    expect(listeners.get(assistantChannels.create)?.({}, input)).toEqual({ ok: true })
    expect(service.create).toHaveBeenCalledWith(input)

    unregister()
    expect(listeners.size).toBe(0)
    expect(ipcMain.removeHandler.mock.calls.map(([channel]) => channel).sort()).toEqual(
      Object.values(assistantChannels).sort()
    )
  })
})
