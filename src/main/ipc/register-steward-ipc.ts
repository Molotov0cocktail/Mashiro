import type { ZodType } from 'zod'
import { stewardChannels } from '../../shared/steward-channels.js'
import {
  stewardSnapshotResultSchema,
  stewardPendingResultSchema,
  stewardBranchResultSchema,
  stewardChangedSchema,
  type StewardChanged
} from '../../shared/steward-contract.js'
import type { StewardService } from '../background/steward-service.js'
interface IpcMainLike {
  handle(channel: string, listener: (event: unknown, input: unknown) => unknown): void
  removeHandler(channel: string): void
}
export function registerStewardIpc(
  ipc: IpcMainLike,
  service: StewardService,
  trusted: (event: unknown) => boolean
): () => void {
  const methods = {
    query: stewardSnapshotResultSchema,
    configure: stewardSnapshotResultSchema,
    run: stewardSnapshotResultSchema,
    control: stewardSnapshotResultSchema,
    pending: stewardPendingResultSchema,
    branch: stewardBranchResultSchema,
    organize: stewardSnapshotResultSchema,
    resolveConflict: stewardSnapshotResultSchema
  } satisfies Record<string, ZodType>
  for (const method of Object.keys(methods) as (keyof typeof methods)[])
    ipc.handle(stewardChannels[method], (event, input) => {
      if (!trusted(event))
        return { ok: false, error: { code: 'PERMISSION_DENIED', message: '仓储调用来源无效' } }
      try {
        const parsed = methods[method].safeParse(service[method](input))
        if (parsed.success) return parsed.data
      } catch {
        /* No body, path or credentials in errors. */
      }
      return {
        ok: false,
        error: { code: 'STORAGE_UNAVAILABLE', message: '仓储状态暂不可用；请核查原作业' }
      }
    })
  return () => {
    for (const method of Object.keys(methods) as (keyof typeof methods)[])
      ipc.removeHandler(stewardChannels[method])
  }
}
export function emitStewardChanged(
  send: (channel: string, event: StewardChanged) => void,
  event: StewardChanged
): void {
  send(stewardChannels.changed, stewardChangedSchema.parse(event))
}
