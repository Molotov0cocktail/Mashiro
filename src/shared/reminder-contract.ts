import { z } from 'zod'

const id = z.string().uuid()
const version = z.number().int().positive()
const envelope = { protocolVersion: z.literal(1), assistantId: id }
const time = { dueAt: z.iso.datetime({ offset: true }), timeZone: z.string().min(1).max(100) }
export const reminderStateSchema = z.enum([
  'SCHEDULED',
  'RECOVERY_PENDING',
  'DISPATCHING',
  'DISPLAY_OBSERVED',
  'RESULT_UNKNOWN',
  'FAILED',
  'EXPIRED',
  'CANCELLED',
  'HANDLED'
])
export const reminderRecordSchema = z.strictObject({
  id,
  itemId: id,
  itemVersion: version,
  version,
  ...time,
  state: reminderStateSchema,
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true })
})
export const reminderMutationSchema = z.discriminatedUnion('action', [
  z.strictObject({
    action: z.literal('create'),
    itemId: id,
    expectedItemVersion: version,
    ...time
  }),
  z.strictObject({
    action: z.literal('reschedule'),
    id,
    expectedVersion: version,
    expectedItemVersion: version,
    ...time
  }),
  z.strictObject({ action: z.enum(['cancel', 'handle']), id, expectedVersion: version })
])
export const reminderPolicySchema = z.discriminatedUnion('mode', [
  z.strictObject({ mode: z.literal('UNCONFIGURED') }),
  z.strictObject({
    mode: z.literal('EXPLICIT'),
    catchUpMinutes: z.number().int().min(0).max(10080),
    merge: z.boolean()
  })
])
export const reminderRuntimeSchema = z.strictObject({
  version: z.number().int().nonnegative(),
  policy: reminderPolicySchema,
  loginStartup: z.boolean(),
  loginStartupSupported: z.boolean(),
  notificationSupported: z.boolean(),
  runningInTray: z.literal(true)
})
export const reminderReceiptSchema = z.strictObject({
  operationId: id,
  reminderId: id.nullable(),
  reminderVersion: z.number().int().nonnegative(),
  state: z.enum(['SUCCEEDED', 'RESULT_UNKNOWN', 'CONFIRMED_NOT_APPLIED']),
  summary: z.string().max(200)
})
export const reminderQueryInputSchema = z.strictObject({ ...envelope, itemId: id.optional() })
export const reminderMutateInputSchema = z.strictObject({
  ...envelope,
  commandId: id,
  mutation: reminderMutationSchema
})
export const reminderOperationInputSchema = z.strictObject({ ...envelope, commandId: id })
export const reminderRuntimeInputSchema = z.strictObject({ protocolVersion: z.literal(1) })
export const reminderConfigureInputSchema = z.strictObject({
  protocolVersion: z.literal(1),
  expectedVersion: z.number().int().nonnegative(),
  policy: reminderPolicySchema,
  loginStartup: z.boolean()
})
export const reminderPreviewSchema = z.strictObject({
  confirmationId: id,
  commandId: id,
  itemId: id,
  itemVersion: version,
  itemTitle: z.string().max(160),
  mutation: reminderMutationSchema,
  state: z.enum(['PENDING', 'ACCEPTED', 'REJECTED']),
  receipt: reminderReceiptSchema.nullable()
})
export const reminderConfirmInputSchema = z.strictObject({
  ...envelope,
  confirmationId: id,
  accept: z.boolean()
})
export const reminderPreviewInputSchema = z.strictObject({ ...envelope, confirmationId: id })
export const reminderPrepareToolSchema = z.strictObject({
  action: z.enum(['set', 'cancel']),
  dueAt: z.iso.datetime({ offset: true }).nullable(),
  timeZone: z.string().min(1).max(100).nullable()
})
export const reminderChangedSchema = z.strictObject({
  kind: z.enum(['changed', 'open-item', 'open-reminders']),
  itemId: id.nullable(),
  deliveryId: id.optional(),
  assistantId: id.optional(),
  assistantRevision: z.number().int().nonnegative().optional()
})
export const reminderErrorSchema = z.strictObject({
  code: z.enum([
    'INVALID_INPUT',
    'NOT_FOUND',
    'STALE_WRITE',
    'PERMISSION_DENIED',
    'CONFLICT',
    'STORAGE_UNAVAILABLE',
    'UNSUPPORTED'
  ]),
  message: z.string().max(200)
})
const result = <T extends z.ZodType>(data: T) =>
  z.discriminatedUnion('ok', [
    z.strictObject({ ok: z.literal(true), data }),
    z.strictObject({ ok: z.literal(false), error: reminderErrorSchema })
  ])
export const reminderNavigationDeliverySchema = z.discriminatedUnion('kind', [
  z.strictObject({
    deliveryId: id,
    assistantId: id,
    assistantRevision: z.number().int().nonnegative(),
    kind: z.literal('open-item'),
    itemId: id
  }),
  z.strictObject({
    deliveryId: id,
    assistantId: id,
    assistantRevision: z.number().int().nonnegative(),
    kind: z.literal('open-reminders'),
    itemId: z.null()
  })
])
export const reminderPendingNavigationInputSchema = z.strictObject({
  protocolVersion: z.literal(1),
  assistantId: id,
  assistantRevision: z.number().int().nonnegative()
})
export const reminderAckNavigationInputSchema = z.strictObject({
  protocolVersion: z.literal(1),
  assistantId: id,
  assistantRevision: z.number().int().nonnegative(),
  deliveryId: id
})
export const reminderPendingNavigationResultSchema = result(
  reminderNavigationDeliverySchema.nullable()
)
export const reminderAckNavigationResultSchema = result(
  z.strictObject({ deliveryId: id, acknowledged: z.boolean() })
)
export const reminderQueryResultSchema = result(
  z.strictObject({ records: z.array(reminderRecordSchema), runtime: reminderRuntimeSchema })
)
export const reminderPreviewResultSchema = result(reminderPreviewSchema)
export type ReminderPreview = z.infer<typeof reminderPreviewSchema>
export const reminderMutationResultSchema = result(reminderReceiptSchema)
export const reminderRuntimeResultSchema = result(reminderRuntimeSchema)
export type ReminderRecord = z.infer<typeof reminderRecordSchema>
export type ReminderMutation = z.infer<typeof reminderMutationSchema>
export type ReminderPolicy = z.infer<typeof reminderPolicySchema>
export type ReminderReceipt = z.infer<typeof reminderReceiptSchema>
export type ReminderRuntime = z.infer<typeof reminderRuntimeSchema>
export type ReminderChanged = z.infer<typeof reminderChangedSchema>
export type ReminderNavigationDelivery = z.infer<typeof reminderNavigationDeliverySchema>
export interface ReminderApi {
  preview(
    input: z.input<typeof reminderPreviewInputSchema>
  ): Promise<z.infer<typeof reminderPreviewResultSchema>>
  confirm(
    input: z.input<typeof reminderConfirmInputSchema>
  ): Promise<z.infer<typeof reminderMutationResultSchema>>
  query(
    input: z.input<typeof reminderQueryInputSchema>
  ): Promise<z.infer<typeof reminderQueryResultSchema>>
  mutate(
    input: z.input<typeof reminderMutateInputSchema>
  ): Promise<z.infer<typeof reminderMutationResultSchema>>
  operation(
    input: z.input<typeof reminderOperationInputSchema>
  ): Promise<z.infer<typeof reminderMutationResultSchema>>
  runtime(
    input: z.input<typeof reminderRuntimeInputSchema>
  ): Promise<z.infer<typeof reminderRuntimeResultSchema>>
  configure(
    input: z.input<typeof reminderConfigureInputSchema>
  ): Promise<z.infer<typeof reminderRuntimeResultSchema>>
  pendingNavigation(
    input: z.input<typeof reminderPendingNavigationInputSchema>
  ): Promise<z.infer<typeof reminderPendingNavigationResultSchema>>
  ackNavigation(
    input: z.input<typeof reminderAckNavigationInputSchema>
  ): Promise<z.infer<typeof reminderAckNavigationResultSchema>>
  onChanged(listener: (event: ReminderChanged) => void): () => void
}
