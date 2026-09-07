import { backgroundChannels } from '../../shared/background-channels.js'
import {
  backgroundSnapshotResultSchema,
  backgroundChapterResultSchema,
  backgroundChangedSchema,
  type BackgroundChanged
} from '../../shared/background-contract.js'
import type { BackgroundService } from '../background/background-service.js'
interface IpcMainLike {
  handle(channel: string, listener: (event: unknown, input: unknown) => unknown): void
  removeHandler(channel: string): void
}
export function registerBackgroundIpc(
  ipc: IpcMainLike,
  service: BackgroundService,
  trusted: (event: unknown) => boolean
): () => void {
  const methods = ['query', 'configure', 'run', 'control', 'chapter', 'topic'] as const
  for (const method of methods)
    ipc.handle(backgroundChannels[method], (event, input) => {
      if (!trusted(event))
        return { ok: false, error: { code: 'PERMISSION_DENIED', message: '后台调用来源无效' } }
      try {
        const result = (
          method === 'chapter' ? backgroundChapterResultSchema : backgroundSnapshotResultSchema
        ).safeParse(service[method](input))
        if (result.success) return result.data
      } catch {
        /* Never expose local paths or source prose in errors. */
      }
      return {
        ok: false,
        error: { code: 'STORAGE_UNAVAILABLE', message: '后台状态暂不可用，请核查原作业' }
      }
    })
  return () => {
    for (const method of methods) ipc.removeHandler(backgroundChannels[method])
  }
}
export function emitBackgroundChanged(
  send: (channel: string, event: BackgroundChanged) => void,
  event: BackgroundChanged
): void {
  send(backgroundChannels.changed, backgroundChangedSchema.parse(event))
}
