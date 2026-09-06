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
export interface TimelineApi {
  read(input: z.infer<typeof timelineReadInputSchema>): Promise<TimelineResult>
  saveTemporary(input: z.infer<typeof timelineSaveInputSchema>): Promise<TimelineResult>
}
