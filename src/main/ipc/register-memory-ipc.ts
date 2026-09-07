import type { ZodType } from 'zod'
import { memoryRoundResultSchema } from '../../shared/memory-round-contract.js'
import { memoryChannels } from '../../shared/memory-channels.js'
import {
  memoryQueryResultSchema,
  memoryMutationResultSchema,
  memoryInspectResultSchema,
  memoryPermissionsResultSchema,
  memoryReloadResultSchema
} from '../../shared/memory-contract.js'
import type { MemoryService } from '../memory/memory-service.js'
interface IpcMainLike {
  handle(channel: string, listener: (event: unknown, input: unknown) => unknown): void
  removeHandler(channel: string): void
}
export function registerMemoryIpc(ipc: IpcMainLike, service: MemoryService): () => void {
  const methods = {
    round: memoryRoundResultSchema,
    query: memoryQueryResultSchema,
    mutate: memoryMutationResultSchema,
    inspect: memoryInspectResultSchema,
    permissions: memoryPermissionsResultSchema,
    setPermissions: memoryPermissionsResultSchema,
    previewReload: memoryReloadResultSchema,
    acceptReload: memoryMutationResultSchema,
    confirm: memoryMutationResultSchema
  } satisfies Record<keyof typeof memoryChannels, ZodType>
  for (const name of Object.keys(methods) as (keyof typeof methods)[]) {
    ipc.handle(memoryChannels[name], (_event, input) => {
      try {
        const result = methods[name].safeParse(service[name](input))
        if (result.success) return result.data
      } catch {
        /* Content and filesystem errors never leave the trusted boundary. */
      }
      return { ok: false, error: { code: 'STORAGE_UNAVAILABLE', message: '记忆服务暂不可用' } }
    })
  }
  return () => {
    for (const channel of Object.values(memoryChannels)) ipc.removeHandler(channel)
  }
}
