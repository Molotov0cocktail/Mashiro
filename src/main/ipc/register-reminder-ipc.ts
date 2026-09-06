import type { ZodType } from 'zod'
import { reminderChannels, reminderChangedChannel } from '../../shared/reminder-channels.js'
import {
  reminderQueryResultSchema,
  reminderMutationResultSchema,
  reminderRuntimeResultSchema,
  reminderPreviewResultSchema,
  reminderChangedSchema,
  type ReminderChanged
} from '../../shared/reminder-contract.js'
import type { ReminderService } from '../reminder/reminder-service.js'
interface IpcMainLike {
  handle(channel: string, listener: (event: unknown, input: unknown) => unknown): void
  removeHandler(channel: string): void
}
export function registerReminderIpc(
  ipc: IpcMainLike,
  service: ReminderService,
  trusted: (event: unknown) => boolean
): () => void {
  const methods = {
    query: reminderQueryResultSchema,
    mutate: reminderMutationResultSchema,
    operation: reminderMutationResultSchema,
    runtime: reminderRuntimeResultSchema,
    configure: reminderRuntimeResultSchema,
    preview: reminderPreviewResultSchema,
    confirm: reminderMutationResultSchema
  } satisfies Record<keyof typeof reminderChannels, ZodType>
  for (const name of Object.keys(methods) as (keyof typeof methods)[]) {
    ipc.handle(reminderChannels[name], (event, input) => {
      if (!trusted(event))
        return { ok: false, error: { code: 'PERMISSION_DENIED', message: '提醒调用来源无效' } }
      try {
        const result = methods[name].safeParse(service[name](input))
        if (result.success) return result.data
      } catch {
        /* Private storage and native details never cross IPC. */
      }
      return {
        ok: false,
        error: { code: 'STORAGE_UNAVAILABLE', message: '提醒状态暂不可用，请核查原操作' }
      }
    })
  }
  return () => {
    for (const channel of Object.values(reminderChannels)) ipc.removeHandler(channel)
  }
}
export function emitReminderChanged(
  send: (channel: string, event: ReminderChanged) => void,
  value: ReminderChanged
): void {
  send(reminderChangedChannel, reminderChangedSchema.parse(value))
}
