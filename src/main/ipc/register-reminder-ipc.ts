import type { ZodType } from 'zod'
import {
  reminderChannels,
  reminderChangedChannel,
  reminderNavigationChannels
} from '../../shared/reminder-channels.js'
import {
  reminderQueryResultSchema,
  reminderMutationResultSchema,
  reminderRuntimeResultSchema,
  reminderPreviewResultSchema,
  reminderChangedSchema,
  reminderPendingNavigationResultSchema,
  reminderAckNavigationResultSchema,
  type ReminderChanged
} from '../../shared/reminder-contract.js'
import type { ReminderService } from '../reminder/reminder-service.js'
import type { ReminderNavigationBroker } from '../reminder/reminder-navigation.js'
interface IpcMainLike {
  handle(channel: string, listener: (event: unknown, input: unknown) => unknown): void
  removeHandler(channel: string): void
}
export function registerReminderIpc(
  ipc: IpcMainLike,
  service: ReminderService,
  navigation: ReminderNavigationBroker,
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
  const navigationMethods = {
    pending: reminderPendingNavigationResultSchema,
    ack: reminderAckNavigationResultSchema
  } as const
  for (const name of Object.keys(navigationMethods) as (keyof typeof navigationMethods)[]) {
    ipc.handle(reminderNavigationChannels[name], (event, input) => {
      if (!trusted(event))
        return { ok: false, error: { code: 'PERMISSION_DENIED', message: '提醒导航来源无效' } }
      try {
        const value =
          name === 'pending' ? navigation.pendingNavigation(input) : navigation.ackNavigation(input)
        const result = navigationMethods[name].safeParse(value)
        if (result.success) return result.data
      } catch {
        /* Navigation state and target details never cross IPC on failure. */
      }
      return {
        ok: false,
        error: { code: 'STORAGE_UNAVAILABLE', message: '提醒导航状态暂不可用，请重试' }
      }
    })
  }
  return () => {
    for (const channel of [
      ...Object.values(reminderChannels),
      ...Object.values(reminderNavigationChannels)
    ])
      ipc.removeHandler(channel)
  }
}
export function emitReminderChanged(
  send: (channel: string, event: ReminderChanged) => void,
  value: ReminderChanged
): void {
  send(reminderChangedChannel, reminderChangedSchema.parse(value))
}
