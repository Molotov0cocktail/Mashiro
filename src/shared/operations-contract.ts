import { z } from 'zod'
import { dailyResultSchema } from './daily-contract.js'
const id = z.uuid(),
  count = z.number().int().nonnegative(),
  time = z.iso.datetime({ offset: true })
export const usageFeatureSchema = z.enum([
  'conversation',
  'tool-chain',
  'connection-test',
  'chapter',
  'shared-candidates',
  'steward',
  'observation',
  'daily-brief',
  'evening-review',
  'weekly-plan',
  'deadline-change'
])
export const operationOwnerSchema = z.strictObject({
  domain: z.enum(['daily', 'background', 'steward', 'item', 'reminder', 'provider']),
  id: z.string().max(200),
  assistantId: id.nullable()
})
export const usageTokensSchema = z.strictObject({
  promptTokens: count,
  completionTokens: count,
  totalTokens: count
})
export const usageAttemptSchema = z.strictObject({
  id,
  chainId: z.string().max(200),
  actor: z.enum(['assistant', 'steward', 'system']),
  assistantId: id.nullable(),
  connectionId: id.nullable(),
  recipientFingerprint: z.string().max(64).nullable(),
  model: z.string().max(160).nullable(),
  feature: usageFeatureSchema,
  startedAt: time,
  finishedAt: time.nullable(),
  state: z.enum(['SENDING', 'SETTLED', 'UNKNOWN']),
  inputCharacters: count,
  actual: usageTokensSchema.nullable(),
  unknownReason: z.string().max(200).nullable(),
  estimatedTokens: count.nullable(),
  estimationMethod: z.string().max(100).nullable(),
  persistent: z.boolean(),
  owner: operationOwnerSchema
})
export const operationRowSchema = z.strictObject({
  id: z.string().max(200),
  owner: operationOwnerSchema,
  feature: usageFeatureSchema.nullable(),
  state: z.string().max(60),
  severity: z.enum(['INFO', 'WARN', 'ERROR']),
  summary: z.string().max(300),
  firstAt: time,
  lastAt: time,
  count,
  current: z.boolean(),
  recoveredAt: time.nullable()
})
const filters = {
  actor: z.enum(['assistant', 'steward', 'system']).optional(),
  assistantId: id.optional(),
  feature: usageFeatureSchema.optional(),
  connectionId: id.optional(),
  model: z.string().max(160).optional(),
  from: time.optional(),
  to: time.optional()
}
export const operationsQueryInputSchema = z.strictObject({
  protocolVersion: z.literal(1),
  view: z.enum(['current', 'failures', 'history', 'business']),
  cursor: count.default(0),
  ...filters
})
export const operationsUsageInputSchema = z.strictObject({
  protocolVersion: z.literal(1),
  cursor: count.default(0),
  groupsCursor: count.default(0),
  ...filters
})
export const operationsQuerySchema = z.strictObject({
  view: z.enum(['current', 'failures', 'history', 'business']),
  rows: z.array(operationRowSchema).max(50),
  nextCursor: count.nullable()
})
export const usageGroupSchema = z.strictObject({
  actor: z.enum(['assistant', 'steward', 'system']),
  assistantId: id.nullable(),
  connectionId: id.nullable(),
  model: z.string().max(160).nullable(),
  feature: usageFeatureSchema,
  calls: count,
  known: usageTokensSchema,
  unknownRequests: count,
  sendingRequests: count,
  inputCharacters: count,
  complete: z.boolean()
})
export const operationsUsageSchema = z.strictObject({
  attempts: z.array(usageAttemptSchema).max(50),
  nextCursor: count.nullable(),
  groups: z.array(usageGroupSchema).max(50),
  groupsNextCursor: count.nullable(),
  filters: z.strictObject(filters),
  summary: z.strictObject({
    calls: count,
    known: usageTokensSchema,
    unknownRequests: count,
    sendingRequests: count,
    inputCharacters: count,
    complete: z.boolean(),
    historicalCoverage: z.string().max(300)
  })
})
export const operationsChangedSchema = z.strictObject({
  revision: count,
  owner: operationOwnerSchema.nullable()
})
export const operationsQueryResultSchema = dailyResultSchema(operationsQuerySchema)
export const operationsUsageResultSchema = dailyResultSchema(operationsUsageSchema)
export type UsageFeature = z.infer<typeof usageFeatureSchema>
export type UsageAttempt = z.infer<typeof usageAttemptSchema>
export type UsageGroup = z.infer<typeof usageGroupSchema>
export type OperationRow = z.infer<typeof operationRowSchema>
export type OperationOwner = z.infer<typeof operationOwnerSchema>
export type OperationsChanged = z.infer<typeof operationsChangedSchema>
export type OperationsUsage = z.infer<typeof operationsUsageSchema>
export type OperationsQuery = z.infer<typeof operationsQuerySchema>
export interface OperationsApi {
  query(
    input: z.input<typeof operationsQueryInputSchema>
  ): Promise<z.infer<typeof operationsQueryResultSchema>>
  usage(
    input: z.input<typeof operationsUsageInputSchema>
  ): Promise<z.infer<typeof operationsUsageResultSchema>>
  onChanged(listener: (event: OperationsChanged) => void): () => void
}
