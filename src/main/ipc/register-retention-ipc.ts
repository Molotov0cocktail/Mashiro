import type { ZodType } from 'zod'
import { retentionChannels, retentionChangedChannel } from '../../shared/retention-channels.js'
import {
  retentionChangedSchema,
  retentionJobsResultSchema,
  retentionOverviewResultSchema,
  retentionPreviewResultSchema,
  retentionReceiptResultSchema
} from '../../shared/retention-contract.js'
import type { RetentionService } from '../retention/retention-service.js'
interface IpcMainLike {
  handle(channel: string, listener: (event: unknown, input: unknown) => unknown): void
  removeHandler(channel: string): void
}
export function registerRetentionIpc(
  ipc: IpcMainLike,
  service: RetentionService,
  broadcast: (channel: string, event: unknown) => void = () => undefined,
  trustedSender: (event: unknown) => boolean = () => false
): () => void {
  const methods = {
    overview: retentionOverviewResultSchema,
    move: retentionReceiptResultSchema,
    preview: retentionPreviewResultSchema,
    confirm: retentionReceiptResultSchema,
    jobs: retentionJobsResultSchema,
    retry: retentionReceiptResultSchema
  } satisfies Record<keyof typeof retentionChannels, ZodType>
  for (const method of Object.keys(methods) as (keyof typeof methods)[])
    ipc.handle(retentionChannels[method], async (event, input) => {
      if (!trustedSender(event))
        return {
          ok: false,
          error: { code: 'PERMISSION_DENIED', message: '仅允许当前本地应用窗口管理数据' }
        }
      try {
        const result = methods[method].safeParse(await service[method](input))
        if (result.success) return result.data
      } catch {
        /* Never expose SQL, paths or prose through errors. */
      }
      return { ok: false, error: { code: 'STORAGE_UNAVAILABLE', message: '治理服务暂不可用' } }
    })
  const unsubscribe = service.onChanged((event) => {
    const parsed = retentionChangedSchema.safeParse(event)
    if (parsed.success) broadcast(retentionChangedChannel, parsed.data)
  })
  return () => {
    unsubscribe()
    for (const channel of Object.values(retentionChannels)) ipc.removeHandler(channel)
  }
}
