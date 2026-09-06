import { vi } from 'vitest'
import type { MemoryApi, MemoryPermissions } from '../../src/shared/memory-contract.js'

export function memoryPermission(
  scope: 'global' | 'assistant',
  values: Partial<MemoryPermissions> = {}
): MemoryPermissions {
  return {
    assistantId: '00000000-0000-4000-8000-000000000001',
    scope,
    version: 0,
    read: false,
    write: false,
    writeInferences: false,
    receive: false,
    endpointDisplay: 'https://example.com/v1',
    endpointFingerprint: 'sha256:synthetic',
    ...values
  }
}

export function memoryApi008Defaults(): MemoryApi {
  return {
    query: vi.fn(async () => ({ ok: true as const, data: { records: [], nextCursor: null } })),
    inspect: vi.fn(),
    mutate: vi.fn(),
    confirm: vi.fn(),
    previewReload: vi.fn(),
    acceptReload: vi.fn(),
    permissions: vi.fn(async (input) => ({
      ok: true as const,
      data: memoryPermission(input.scope, { assistantId: input.assistantId })
    })),
    setPermissions: vi.fn(async (input) => ({
      ok: true as const,
      data: memoryPermission(input.scope, {
        assistantId: input.assistantId,
        version: input.expectedVersion + 1,
        read: input.read,
        write: input.write,
        writeInferences: input.writeInferences,
        receive: input.receive
      })
    }))
  } as MemoryApi
}
