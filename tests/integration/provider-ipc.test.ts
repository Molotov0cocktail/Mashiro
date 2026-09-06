import { describe, expect, it, vi } from 'vitest'
import { registerProviderIpc } from '../../src/main/ipc/register-provider-ipc.js'
import type { ProviderService } from '../../src/main/provider/provider-service.js'
import { assistantChannels } from '../../src/shared/assistant-contract.js'
import { providerChannels } from '../../src/shared/provider-contract.js'

describe('provider IPC boundary', () => {
  it('adds narrow Provider channels without changing the six assistant channels', () => {
    expect(Object.values(assistantChannels)).toHaveLength(6)
    expect(Object.values(providerChannels).sort()).toEqual([
      'provider:bind-assistant',
      'provider:cancel-chat',
      'provider:clear-chat',
      'provider:delete-credential',
      'provider:event',
      'provider:list',
      'provider:save-connection',
      'provider:set-credential',
      'provider:start-chat'
    ])
  })

  it('replaces malformed trusted output with a sanitized stable error', async () => {
    const handlers = new Map<string, (event: unknown, input: unknown) => unknown>()
    const ipc = {
      handle: vi.fn((channel: string, handler: (event: unknown, input: unknown) => unknown) => {
        handlers.set(channel, handler)
      }),
      removeHandler: vi.fn()
    }
    const malformed = {
      list: () => ({ ok: true, data: { secret: 'must-not-cross' } }),
      saveConnection: vi.fn(),
      setCredential: vi.fn(),
      deleteCredential: vi.fn(),
      bindAssistant: vi.fn(),
      startChat: vi.fn(),
      cancelChat: vi.fn(),
      clearChat: vi.fn()
    } as unknown as ProviderService
    const unregister = registerProviderIpc(ipc, malformed)
    const result = await handlers.get(providerChannels.list)?.(
      { sender: { send: vi.fn() } },
      { protocolVersion: 1 }
    )
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: 'Provider service failed' }
    })
    expect(JSON.stringify(result)).not.toContain('secret')
    unregister()
    expect(ipc.removeHandler).toHaveBeenCalledTimes(8)
  })
})
