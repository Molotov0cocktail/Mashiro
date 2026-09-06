import type { ZodType } from 'zod'
import { itemChannels } from '../../shared/item-channels.js'
import {
  itemQueryResultSchema,
  itemInspectResultSchema,
  itemMutationResultSchema,
  itemPreviewResultSchema,
  itemPermissionsResultSchema
} from '../../shared/item-contract.js'
import type { ItemService } from '../item/item-service.js'
interface IpcMainLike {
  handle(channel: string, listener: (event: unknown, input: unknown) => unknown): void
  removeHandler(channel: string): void
}
export function registerItemIpc(ipc: IpcMainLike, service: ItemService): () => void {
  const methods = {
    query: itemQueryResultSchema,
    inspect: itemInspectResultSchema,
    mutate: itemMutationResultSchema,
    proposalAction: itemMutationResultSchema,
    operation: itemMutationResultSchema,
    preview: itemPreviewResultSchema,
    confirm: itemMutationResultSchema,
    permissions: itemPermissionsResultSchema,
    setPermissions: itemPermissionsResultSchema
  } satisfies Record<keyof typeof itemChannels, ZodType>
  for (const name of Object.keys(methods) as (keyof typeof methods)[])
    ipc.handle(itemChannels[name], (_event, input) => {
      try {
        const result = methods[name].safeParse(service[name](input))
        if (result.success) return result.data
      } catch {
        /* No trusted error details cross IPC. */
      }
      return { ok: false, error: { code: 'STORAGE_UNAVAILABLE', message: '事项服务暂不可用' } }
    })
  return () => {
    for (const channel of Object.values(itemChannels)) ipc.removeHandler(channel)
  }
}
