import { z } from 'zod'
import { providerStableErrorSchema } from './provider-contract.js'

export const chatModeSchema = z.enum(['normal', 'temporary'])
export const timelineReadInputSchema = z.strictObject({
  protocolVersion: z.literal(1),
  assistantId: z.string().uuid(),
  mode: chatModeSchema
})
export const timelineSaveInputSchema = z.strictObject({
  protocolVersion: z.literal(1),
  assistantId: z.string().uuid()
})
export const timelineMessageSchema = z.strictObject({
  id: z.string().uuid(),
  requestId: z.string().uuid(),
  role: z.enum(['user', 'assistant']),
  content: z.string().max(120000),
  status: z.enum(['pending', 'completed', 'failed', 'cancelled', 'interrupted']),
  createdAt: z.iso.datetime({ offset: true }),
  saved: z.boolean()
})
export const timelineSnapshotSchema = z.strictObject({
  assistantId: z.string().uuid(),
  mode: chatModeSchema,
  messages: z.array(timelineMessageSchema).max(100),
  hasMore: z.boolean()
})
export const timelineResultSchema = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true), data: timelineSnapshotSchema }),
  z.strictObject({ ok: z.literal(false), error: providerStableErrorSchema })
])
export type ChatMode = z.infer<typeof chatModeSchema>
export type TimelineMessage = z.infer<typeof timelineMessageSchema>
export type TimelineSnapshot = z.infer<typeof timelineSnapshotSchema>
export type TimelineResult = z.infer<typeof timelineResultSchema>

export const timelineQueryInputSchema = z.strictObject({
  protocolVersion: z.literal(1),
  assistantId: z.string().uuid(),
  query: z.string().max(200).default(''),
  before: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional()
})
export const timelinePageSchema = z.strictObject({
  assistantId: z.string().uuid(),
  messages: z.array(timelineMessageSchema).max(100),
  nextCursor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable()
})
export const timelinePageResultSchema = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true), data: timelinePageSchema }),
  z.strictObject({ ok: z.literal(false), error: providerStableErrorSchema })
])
export const historyPermissionsInputSchema = z.strictObject({
  protocolVersion: z.literal(1),
  assistantId: z.string().uuid()
})
export const historyPermissionsSchema = z.strictObject({
  assistantId: z.string().uuid(),
  connectionId: z.string().uuid().nullable(),
  endpointFingerprint: z.string().max(100).nullable(),
  endpointDisplay: z.string().max(2048).nullable(),
  readHistory: z.boolean(),
  sendHistory: z.boolean(),
  version: z.number().int().nonnegative()
})
export const setHistoryPermissionsInputSchema = z.strictObject({
  protocolVersion: z.literal(1),
  assistantId: z.string().uuid(),
  connectionId: z.string().uuid().nullable(),
  endpointFingerprint: z.string().max(100).nullable(),
  expectedVersion: z.number().int().nonnegative(),
  readHistory: z.boolean(),
  sendHistory: z.boolean()
})
export const historyPermissionsResultSchema = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true), data: historyPermissionsSchema }),
  z.strictObject({ ok: z.literal(false), error: providerStableErrorSchema })
])
export type TimelinePageResult = z.infer<typeof timelinePageResultSchema>
export type HistoryPermissions = z.infer<typeof historyPermissionsSchema>
export type HistoryPermissionsResult = z.infer<typeof historyPermissionsResultSchema>
export type TimelineQueryInput = z.input<typeof timelineQueryInputSchema>
export type SetHistoryPermissionsInput = z.infer<typeof setHistoryPermissionsInputSchema>

export interface TimelineApi {
  query(input: TimelineQueryInput): Promise<TimelinePageResult>
  permissions(
    input: z.infer<typeof historyPermissionsInputSchema>
  ): Promise<HistoryPermissionsResult>
  setPermissions(input: SetHistoryPermissionsInput): Promise<HistoryPermissionsResult>
  read(input: z.infer<typeof timelineReadInputSchema>): Promise<TimelineResult>
  saveTemporary(input: z.infer<typeof timelineSaveInputSchema>): Promise<TimelineResult>
}
