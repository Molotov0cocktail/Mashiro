import { z } from 'zod'
import {
  backgroundBudgetSchema,
  backgroundUsageSchema,
  backgroundErrorSchema
} from './background-contract.js'
import { memorySourceSchema, memoryRecordSchema } from './memory-contract.js'

const id = z.string().uuid()
const version = z.number().int().nonnegative()
const base = { protocolVersion: z.literal(1), assistantId: id }
const common = {
  enabled: z.boolean(),
  connectionId: id.nullable(),
  model: z.string().trim().min(1).max(160).nullable(),
  budget: backgroundBudgetSchema.nullable()
}
export const discoverySettingsSchema = z.strictObject({
  ...common,
  allowOwnCompletedRounds: z.boolean()
})
export const stewardSettingsSchema = z.strictObject({
  ...common,
  assistantIds: z.array(id).max(100),
  allowAcceptedMemories: z.boolean(),
  allowSharedCandidates: z.boolean(),
  allowWrite: z.boolean(),
  allowInferences: z.boolean()
})
const saved = {
  version,
  recipientFingerprint: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable()
}
export const discoveryConfigurationSchema = discoverySettingsSchema.extend({
  ...saved,
  assistantId: id,
  role: z.literal('assistant'),
  feature: z.literal('shared-candidates')
})
export const stewardConfigurationSchema = stewardSettingsSchema.extend({
  ...saved,
  role: z.literal('steward')
})
export const stewardStateSchema = z.enum([
  'QUEUED',
  'RUNNING',
  'BUDGET_PAUSED',
  'CONFIGURATION_BLOCKED',
  'PERMISSION_BLOCKED',
  'FAILED_CONFIRMED',
  'REMOTE_UNKNOWN',
  'CANCELLED',
  'STALE',
  'PARTIAL',
  'COMPLETED'
])
export const stewardSlotSchema = z.strictObject({
  id,
  commandId: id,
  state: z.enum(['PENDING', 'COMPLETED', 'STALE', 'BLOCKED']),
  action: z.enum(['remember', 'equivalent', 'conflict']),
  memoryId: id.nullable(),
  memoryVersion: version.nullable(),
  branchId: id.nullable(),
  conflictId: id.nullable(),
  providedSources: z.array(memorySourceSchema).max(64).optional(),
  citedSources: z.array(memorySourceSchema).max(64).optional(),
  reason: z.string().max(200)
})
export const stewardJobSchema = z.strictObject({
  id,
  version,
  role: z.enum(['assistant', 'steward']),
  authorityAssistantId: id,
  entryId: id,
  entryVersion: version,
  configurationVersion: version,
  state: stewardStateSchema,
  attempts: version,
  createdAt: z.string().max(40),
  updatedAt: z.string().max(40),
  reason: z.string().max(200),
  slots: z.array(stewardSlotSchema).max(8)
})
export const stewardPendingSchema = z.strictObject({
  id,
  version,
  entryKind: z.enum(['accepted-memory', 'shared-candidate']),
  authorityAssistantId: id,
  state: z.enum(['pending', 'completed', 'dismissed', 'stale']),
  title: z.string().max(160),
  nature: z.enum(['user-statement', 'faithful-summary', 'inference']),
  createdAt: z.string().max(40),
  sources: z.array(memorySourceSchema).max(64),
  available: z.boolean()
})
export const stewardBranchSchema = z.strictObject({
  id,
  version,
  title: z.string().min(1).max(160)
})
export const stewardConflictSchema = z.strictObject({
  id,
  version,
  state: z.enum(['OPEN', 'RESOLVED', 'STALE']),
  left: memorySourceSchema,
  right: memorySourceSchema,
  branchIds: z.array(id).max(2),
  resolution: memorySourceSchema.nullable()
})
export const stewardQueryInputSchema = z.strictObject({ ...base, cursor: version.default(0) })
export const stewardConfigureInputSchema = z.discriminatedUnion('role', [
  z.strictObject({
    ...base,
    role: z.literal('assistant'),
    expectedVersion: version,
    settings: discoverySettingsSchema,
    grantSelectedRecipient: z.boolean().default(false)
  }),
  z.strictObject({
    ...base,
    role: z.literal('steward'),
    expectedVersion: version,
    settings: stewardSettingsSchema,
    grantSelectedRecipient: z.boolean().default(false)
  })
])
export const stewardRunInputSchema = z.strictObject({
  ...base,
  role: z.enum(['assistant', 'steward'])
})
export const stewardControlInputSchema = z.strictObject({
  ...base,
  jobId: id,
  expectedVersion: version,
  commandId: id,
  action: z.enum(['cancel', 'retry', 'retry-unknown', 'inspect'])
})
export const stewardPendingInputSchema = z.strictObject({
  ...base,
  id,
  expectedVersion: version,
  action: z.enum(['inspect', 'dismiss']),
  commandId: id
})
export const stewardBranchInputSchema = z.strictObject({
  ...base,
  id,
  expectedVersion: version,
  cursor: version.default(0)
})
export const stewardOrganizeInputSchema = z.strictObject({
  ...base,
  commandId: id,
  branchId: id.nullable(),
  expectedVersion: version,
  title: z.string().trim().min(1).max(160),
  memoryId: id.nullable(),
  memoryVersion: version.nullable()
})
export const stewardResolveInputSchema = z.strictObject({
  ...base,
  commandId: id,
  conflictId: id,
  expectedVersion: version,
  resolutionMemoryId: id,
  resolutionMemoryVersion: version
})
export const stewardSnapshotSchema = z.strictObject({
  configuration: stewardConfigurationSchema,
  discovery: discoveryConfigurationSchema,
  usage: backgroundUsageSchema,
  discoveryUsage: backgroundUsageSchema,
  pending: z.array(stewardPendingSchema).max(100),
  jobs: z.array(stewardJobSchema).max(100),
  branches: z.array(stewardBranchSchema).max(100),
  conflicts: z.array(stewardConflictSchema).max(100),
  nextCursor: version.nullable()
})
const result = <T extends z.ZodType>(data: T) =>
  z.discriminatedUnion('ok', [
    z.strictObject({ ok: z.literal(true), data }),
    z.strictObject({ ok: z.literal(false), error: backgroundErrorSchema })
  ])
export const stewardSnapshotResultSchema = result(stewardSnapshotSchema)
export const stewardPendingResultSchema = result(
  z.strictObject({ entry: stewardPendingSchema, markdown: z.string().max(16000) })
)
export const stewardBranchResultSchema = result(
  z.strictObject({
    branch: stewardBranchSchema,
    members: z.array(memoryRecordSchema).max(100),
    conflicts: z.array(stewardConflictSchema).max(100),
    markdown: z.string().max(1600000),
    nextCursor: version.nullable()
  })
)
export const stewardChangedSchema = z.strictObject({ revision: version })
export type StewardConfiguration = z.infer<typeof stewardConfigurationSchema>
export type DiscoveryConfiguration = z.infer<typeof discoveryConfigurationSchema>
export type StewardJob = z.infer<typeof stewardJobSchema>
export type StewardPending = z.infer<typeof stewardPendingSchema>
export type StewardBranch = z.infer<typeof stewardBranchSchema>
export type StewardConflict = z.infer<typeof stewardConflictSchema>
export type StewardSnapshot = z.infer<typeof stewardSnapshotSchema>
export type StewardChanged = z.infer<typeof stewardChangedSchema>
export interface StewardApi {
  query(
    input: z.input<typeof stewardQueryInputSchema>
  ): Promise<z.infer<typeof stewardSnapshotResultSchema>>
  configure(
    input: z.input<typeof stewardConfigureInputSchema>
  ): Promise<z.infer<typeof stewardSnapshotResultSchema>>
  run(
    input: z.input<typeof stewardRunInputSchema>
  ): Promise<z.infer<typeof stewardSnapshotResultSchema>>
  control(
    input: z.input<typeof stewardControlInputSchema>
  ): Promise<z.infer<typeof stewardSnapshotResultSchema>>
  pending(
    input: z.input<typeof stewardPendingInputSchema>
  ): Promise<z.infer<typeof stewardPendingResultSchema>>
  branch(
    input: z.input<typeof stewardBranchInputSchema>
  ): Promise<z.infer<typeof stewardBranchResultSchema>>
  organize(
    input: z.input<typeof stewardOrganizeInputSchema>
  ): Promise<z.infer<typeof stewardSnapshotResultSchema>>
  resolveConflict(
    input: z.input<typeof stewardResolveInputSchema>
  ): Promise<z.infer<typeof stewardSnapshotResultSchema>>
  onChanged(listener: (event: StewardChanged) => void): () => void
}
