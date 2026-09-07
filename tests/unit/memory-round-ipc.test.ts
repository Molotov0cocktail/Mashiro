import { expect, it } from 'vitest'
import { registerMemoryIpc } from '../../src/main/ipc/register-memory-ipc.js'
import type { MemoryService } from '../../src/main/memory/memory-service.js'
import { memoryChannels } from '../../src/shared/memory-channels.js'
import { assistantChannels } from '../../src/shared/assistant-channels.js'

it('validates round DTOs on trusted IPC output and removes the new domain handler', () => {
  const handlers = new Map<string, (event: unknown, input: unknown) => unknown>()
  const service = {
    round: () => ({ ok: true, data: { entries: [], secretPath: 'synthetic-secret-path' } })
  } as unknown as MemoryService
  const dispose = registerMemoryIpc(
    {
      handle: (channel, handler) => {
        handlers.set(channel, handler)
      },
      removeHandler: (channel) => {
        handlers.delete(channel)
      }
    },
    service
  )
  expect(Object.keys(assistantChannels)).toHaveLength(6)
  expect(handlers.get(memoryChannels.round)!(null, {})).toEqual({
    ok: false,
    error: { code: 'STORAGE_UNAVAILABLE', message: '记忆服务暂不可用' }
  })
  dispose()
  expect(handlers.size).toBe(0)
})
