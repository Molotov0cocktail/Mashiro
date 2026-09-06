import { vi } from 'vitest'
import type {
  ReminderApi,
  ReminderPreview,
  ReminderReceipt,
  ReminderRecord,
  ReminderRuntime
} from '../../src/shared/reminder-contract.js'
import { itemAssistantA, itemId } from './item-api-fixture.js'

export const reminderId = '00000000-0000-4000-8000-000000000501'
export const reminderCommandId = '00000000-0000-4000-8000-000000000502'
export const reminderConfirmationId = '00000000-0000-4000-8000-000000000503'

export function reminderRuntime(values: Partial<ReminderRuntime> = {}): ReminderRuntime {
  return {
    version: 0,
    policy: { mode: 'UNCONFIGURED' },
    loginStartup: false,
    loginStartupSupported: false,
    notificationSupported: true,
    runningInTray: true,
    ...values
  }
}

export function reminderRecord(values: Partial<ReminderRecord> = {}): ReminderRecord {
  return {
    id: reminderId,
    itemId,
    itemVersion: 2,
    version: 1,
    dueAt: '2026-09-12T09:30:00+08:00',
    timeZone: 'Asia/Shanghai',
    state: 'SCHEDULED',
    createdAt: '2026-09-07T01:00:00.000Z',
    updatedAt: '2026-09-07T01:00:00.000Z',
    ...values
  }
}

export function reminderReceipt(values: Partial<ReminderReceipt> = {}): ReminderReceipt {
  return {
    operationId: reminderCommandId,
    reminderId,
    reminderVersion: 1,
    state: 'SUCCEEDED',
    summary: '提醒已保存',
    ...values
  }
}

export function reminderPreview(values: Partial<ReminderPreview> = {}): ReminderPreview {
  return {
    confirmationId: reminderConfirmationId,
    commandId: reminderCommandId,
    itemId,
    itemVersion: 2,
    itemTitle: '周五交报告',
    mutation: {
      action: 'create',
      itemId,
      expectedItemVersion: 2,
      dueAt: '2026-09-12T09:30:00+08:00',
      timeZone: 'Asia/Shanghai'
    },
    state: 'PENDING',
    receipt: null,
    ...values
  }
}

export function reminderApi012Defaults(records: ReminderRecord[] = []): ReminderApi {
  const runtime = reminderRuntime()
  return {
    preview: vi.fn(async () => ({ ok: true as const, data: reminderPreview() })),
    confirm: vi.fn(async () => ({ ok: true as const, data: reminderReceipt() })),
    query: vi.fn(async () => ({ ok: true as const, data: { records, runtime } })),
    mutate: vi.fn(async (input) => ({
      ok: true as const,
      data: reminderReceipt({ operationId: input.commandId })
    })),
    operation: vi.fn(async (input) => ({
      ok: true as const,
      data: reminderReceipt({ operationId: input.commandId })
    })),
    runtime: vi.fn(async () => ({ ok: true as const, data: runtime })),
    configure: vi.fn(async (input) => ({
      ok: true as const,
      data: reminderRuntime({
        version: input.expectedVersion + 1,
        policy: input.policy,
        loginStartup: input.loginStartup
      })
    })),
    onChanged: vi.fn(() => () => undefined)
  }
}

export { itemAssistantA }
