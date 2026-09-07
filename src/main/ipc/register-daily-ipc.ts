import { dailyChannels } from '../../shared/daily-channels.js'
import * as dto from '../../shared/daily-contract.js'
import type { DailyService } from '../background/daily-service.js'
interface Ipc {
  handle(channel: string, listener: (event: unknown, input: unknown) => unknown): void
  removeHandler(channel: string): void
}
export function registerDailyIpc(
  ipc: Ipc,
  service: DailyService,
  trusted: (event: unknown) => boolean
) {
  const methods = {
    configure: dto.dailyConfigurationResultSchema,
    query: dto.dailyQueryResultSchema,
    preview: dto.dailyPreviewResultSchema,
    inspect: dto.dailyDetailResultSchema,
    run: dto.dailyJobResultSchema,
    control: dto.dailyJobResultSchema,
    decide: dto.dailyReceiptResultSchema,
    ack: dto.dailyReceiptResultSchema
  }
  for (const method of Object.keys(methods) as (keyof typeof methods)[])
    ipc.handle(dailyChannels[method], (event, input) => {
      if (!trusted(event))
        return { ok: false, error: { code: 'PERMISSION_DENIED', message: '日常调用来源无效' } }
      try {
        const parsed = methods[method].safeParse(service[method](input))
        if (parsed.success) return parsed.data
      } catch {
        /* No source bodies or secrets in IPC errors. */
      }
      return {
        ok: false,
        error: { code: 'STORAGE_UNAVAILABLE', message: '日常状态暂不可用，请核查原操作' }
      }
    })
  return () => {
    for (const method of Object.keys(methods) as (keyof typeof methods)[])
      ipc.removeHandler(dailyChannels[method])
  }
}
export function emitDailyChanged(
  send: (channel: string, value: dto.DailyChanged) => void,
  value: dto.DailyChanged
) {
  send(dailyChannels.changed, dto.dailyChangedSchema.parse(value))
}
