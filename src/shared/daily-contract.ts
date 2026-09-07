import { z } from 'zod'
import { memorySourceSchema, memoryReceiptSchema } from './memory-contract.js'
import { itemProposalSchema } from './item-contract.js'

const id = z.uuid(),
  version = z.number().int().nonnegative(),
  timestamp = z.iso.datetime({ offset: true })
const base = { protocolVersion: z.literal(1), assistantId: id }
export const dailyFeatureSchema = z.enum([
  'observation',
  'daily-brief',
  'evening-review',
  'weekly-plan',
  'deadline-change'
])
export const dailyFailureSchema = z.strictObject({
  code: z.enum([
    'INVALID_INPUT',
    'NOT_FOUND',
    'STALE_WRITE',
    'PERMISSION_DENIED',
    'CONFIGURATION',
    'BUDGET_EXHAUSTED',
    'RESULT_UNKNOWN',
    'STORAGE_UNAVAILABLE'
  ]),
  message: z.string().max(300)
})
export const dailyBudgetSchema = z.strictObject({
  window: z.literal('utc-day'),
  calls: z.number().int().min(1).max(1000),
  inputCharacters: z.number().int().min(100).max(10000000),
  maxOutputTokens: z.number().int().min(256).max(4096)
})
export const dailyScopeSchema = z.strictObject({
  ownRounds: z.boolean(),
  chapters: z.boolean(),
  privateMemories: z.boolean(),
  globalMemories: z.boolean(),
  events: z.boolean(),
  items: z.boolean(),
  proposals: z.boolean(),
  maxSources: z.number().int().min(2).max(64),
  lookbackDays: z.number().int().min(1).max(366)
})
export const dailyScheduleSchema = z.strictObject({
  timeZone: z.string().min(1).max(100),
  localTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  weekday: z.number().int().min(0).max(6).nullable(),
  weekStartsOn: z.number().int().min(0).max(6).nullable(),
  fold: z.enum(['earlier', 'later']).nullable(),
  gap: z.enum(['skip', 'next-valid']).nullable()
})
export const dailyRecoverySchema = z.discriminatedUnion('mode', [
  z.strictObject({ mode: z.literal('UNCONFIGURED') }),
  z.strictObject({
    mode: z.literal('EXPLICIT'),
    catchUpMinutes: z.number().int().min(0).max(10080),
    merge: z.boolean(),
    expire: z.boolean()
  })
])
export const dailySettingsSchema = z.strictObject({
  enabled: z.boolean(),
  connectionId: id.nullable(),
  model: z.string().trim().min(1).max(160).nullable(),
  dataScope: dailyScopeSchema,
  budget: dailyBudgetSchema.nullable(),
  schedule: dailyScheduleSchema.nullable(),
  recovery: dailyRecoverySchema,
  allowSaveObservations: z.boolean(),
  allowProposals: z.boolean(),
  deadlineWindowHours: z.number().int().min(1).max(8760),
  changeFields: z.array(z.enum(['title', 'status', 'dueAt', 'description'])).max(4),
  mergeChanges: z.boolean().nullable()
})
export const dailyConfigurationSchema = dailySettingsSchema.extend({
  id,
  assistantId: id,
  feature: dailyFeatureSchema,
  version,
  recipientFingerprint: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable(),
  authorizedRecipient: z.boolean()
})
export const dailyPeriodSchema = z.strictObject({
  start: timestamp,
  end: timestamp,
  timeZone: z.string(),
  localLabel: z.string().max(100)
})
export const dailyPreviewSchema = z.strictObject({
  status: z.enum(['READY', 'NEEDS_DST_CHOICE', 'SKIPPED_GAP', 'UNCONFIGURED']),
  nextRun: timestamp.nullable(),
  localDateTime: z.string().max(40).nullable(),
  occurrence: z.string().max(200).nullable(),
  period: dailyPeriodSchema.nullable(),
  dst: z.enum(['ordinary', 'fold', 'gap']).nullable(),
  alternatives: z.array(timestamp).max(2),
  reason: z.string().max(200)
})
export const dailyStateSchema = z.enum([
  'WAITING_CONFIGURATION',
  'QUEUED',
  'RUNNING',
  'BUDGET_PAUSED',
  'RECOVERY_PENDING',
  'PARTIAL',
  'COMPLETED',
  'CANCELLED',
  'STALE',
  'FAILED',
  'REMOTE_UNKNOWN'
])
export const dailySlotSchema = z.strictObject({
  id,
  commandId: id,
  state: z.enum(['PENDING', 'COMPLETED', 'BLOCKED']),
  action: z.enum(['report', 'proposal']),
  objectId: id.nullable(),
  objectVersion: version.nullable(),
  reason: z.string().max(200)
})
export const dailyJobSchema = z.strictObject({
  id,
  version,
  feature: dailyFeatureSchema,
  authorityAssistantId: id,
  configurationId: id,
  configurationVersion: version,
  occurrence: z.string().max(200),
  period: dailyPeriodSchema,
  state: dailyStateSchema,
  reason: z.string().max(300),
  attempts: version,
  slots: z.array(dailySlotSchema).max(9),
  createdAt: timestamp,
  updatedAt: timestamp,
  reportId: id.nullable(),
  budget: z.strictObject({
    callsUsed: version,
    inputCharactersUsed: version,
    windowId: z.string().max(20)
  })
})
export const dailyRangeSchema = z.strictObject({
  included: version,
  available: version,
  limited: z.boolean(),
  description: z.string().max(300)
})
export const dailyReportSchema = z.strictObject({
  id,
  version,
  governanceVersion: version,
  assistantId: id,
  feature: dailyFeatureSchema,
  jobId: id,
  period: dailyPeriodSchema,
  state: z.enum(['ACTIVE', 'STALE', 'SUPPRESSED']),
  unread: z.boolean(),
  bodyAvailable: z.boolean(),
  createdAt: timestamp,
  connectionId: id,
  model: z.string().max(160),
  recipientFingerprint: z.string(),
  range: dailyRangeSchema,
  modelSkippedReason: z.string().max(200).nullable()
})
export const dailySectionSchema = z.strictObject({
  title: z.string().min(1).max(160),
  markdown: z.string().max(8000),
  nature: z.enum(['faithful-summary', 'inference']),
  sourceHandles: z.array(z.string().max(40)).max(64)
})
export const dailyEvidenceSchema = z.strictObject({
  handle: z.string().max(40),
  source: memorySourceSchema,
  title: z.string().max(160),
  eventStatus: z
    .enum([
      'intention',
      'planned',
      'arranged',
      'reported-happened',
      'completed',
      'cancelled',
      'unknown'
    ])
    .nullable(),
  occurredAt: timestamp.nullable(),
  timeZone: z.string().nullable()
})
export const dailyObservationSchema = z.strictObject({
  id,
  version,
  title: z.string().max(160),
  markdown: z.string().max(8000),
  nature: z.enum(['user-statement', 'faithful-summary', 'inference']),
  status: z.enum(['pending-verification', 'active', 'disputed', 'withdrawn', 'suppressed']),
  independentRoots: version,
  sourceHandles: z.array(z.string().max(40)).max(64),
  memoryId: id.nullable(),
  memoryVersion: version.nullable(),
  suppressionId: id.nullable()
})
export const dailyCheckpointSchema = z.strictObject({
  itemId: id,
  fromVersion: version.nullable(),
  toVersion: version,
  fields: z.array(z.string().max(30)).max(4),
  before: z.string().max(1000).nullable(),
  after: z.string().max(1000),
  consumed: z.boolean()
})
export const dailyDetailSchema = z.strictObject({
  report: dailyReportSchema,
  markdown: z.string().max(64000),
  sections: z.array(dailySectionSchema).max(8),
  observations: z.array(dailyObservationSchema).max(8),
  proposalLinks: z.array(itemProposalSchema).max(8),
  providedSources: z.array(dailyEvidenceSchema).max(50),
  citedSources: z.array(dailyEvidenceSchema).max(50),
  checkpoints: z.array(dailyCheckpointSchema).max(64),
  nextCursor: version.nullable()
})
export const dailyQueryInputSchema = z.strictObject({
  ...base,
  view: z.enum(['configurations', 'jobs', 'reports']),
  feature: dailyFeatureSchema.optional(),
  cursor: version.default(0)
})
export const dailyQuerySchema = z.strictObject({
  view: z.enum(['configurations', 'jobs', 'reports']),
  configurations: z.array(dailyConfigurationSchema).max(5),
  jobs: z.array(dailyJobSchema).max(50),
  reports: z.array(dailyReportSchema).max(50),
  nextCursor: version.nullable(),
  attention: z.strictObject({ unread: version, currentFailures: version })
})
export const dailyConfigureInputSchema = z.strictObject({
  ...base,
  feature: dailyFeatureSchema,
  expectedVersion: version,
  settings: dailySettingsSchema,
  grantSelectedRecipient: z.boolean()
})
export const dailyPreviewInputSchema = z.strictObject({
  ...base,
  feature: dailyFeatureSchema,
  schedule: dailyScheduleSchema,
  after: timestamp.optional()
})
export const dailyInspectInputSchema = z.strictObject({
  ...base,
  id,
  expectedVersion: version,
  governanceVersion: version,
  cursor: version.default(0)
})
export const dailyRunInputSchema = z.strictObject({
  ...base,
  feature: dailyFeatureSchema,
  commandId: id
})
export const dailyControlInputSchema = z.strictObject({
  ...base,
  id,
  expectedVersion: version,
  commandId: id,
  action: z.enum(['cancel', 'retry', 'retry-unknown', 'skip-recovery', 'run-recovery'])
})
export const dailyDecideInputSchema = z.strictObject({
  ...base,
  reportId: id,
  expectedReportVersion: version,
  governanceVersion: version,
  observationId: id,
  expectedVersion: version,
  commandId: id,
  action: z.enum(['accept', 'correct', 'reject', 'dispute', 'withdraw']),
  correction: z
    .strictObject({ title: z.string().min(1).max(160), markdown: z.string().min(1).max(8000) })
    .optional()
})
export const dailyAckInputSchema = z.strictObject({
  ...base,
  id,
  expectedVersion: version,
  commandId: id
})
export const dailyReceiptSchema = z.strictObject({
  commandId: id,
  state: z.enum(['SUCCEEDED', 'SUPPRESSED', 'RESULT_UNKNOWN']),
  objectId: id,
  objectVersion: version,
  memory: memoryReceiptSchema.nullable(),
  suppressionId: id.nullable(),
  summary: z.string().max(300)
})
export const dailyChangedSchema = z.strictObject({
  revision: version,
  assistantId: id.nullable(),
  feature: dailyFeatureSchema.nullable(),
  id: id.nullable(),
  version: version.nullable()
})
export function dailyResultSchema<T extends z.ZodType>(schema: T) {
  return z.discriminatedUnion('ok', [
    z.strictObject({ ok: z.literal(true), data: schema }),
    z.strictObject({ ok: z.literal(false), error: dailyFailureSchema })
  ])
}
export const dailyQueryResultSchema = dailyResultSchema(dailyQuerySchema)
export const dailyConfigurationResultSchema = dailyResultSchema(dailyConfigurationSchema)
export const dailyPreviewResultSchema = dailyResultSchema(dailyPreviewSchema)
export const dailyDetailResultSchema = dailyResultSchema(dailyDetailSchema)
export const dailyJobResultSchema = dailyResultSchema(dailyJobSchema)
export const dailyReceiptResultSchema = dailyResultSchema(dailyReceiptSchema)
export type DailyFeature = z.infer<typeof dailyFeatureSchema>
export type DailySettings = z.infer<typeof dailySettingsSchema>
export type DailyConfiguration = z.infer<typeof dailyConfigurationSchema>
export type DailySchedule = z.infer<typeof dailyScheduleSchema>
export type DailyPreview = z.infer<typeof dailyPreviewSchema>
export type DailyPeriod = z.infer<typeof dailyPeriodSchema>
export type DailyJob = z.infer<typeof dailyJobSchema>
export type DailyReport = z.infer<typeof dailyReportSchema>
export type DailyDetail = z.infer<typeof dailyDetailSchema>
export type DailyObservation = z.infer<typeof dailyObservationSchema>
export type DailyEvidence = z.infer<typeof dailyEvidenceSchema>
export type DailyCheckpoint = z.infer<typeof dailyCheckpointSchema>
export type DailyChanged = z.infer<typeof dailyChangedSchema>
export type DailyQuery = z.infer<typeof dailyQuerySchema>
export interface DailyApi {
  configure(
    input: z.input<typeof dailyConfigureInputSchema>
  ): Promise<z.infer<typeof dailyConfigurationResultSchema>>
  query(
    input: z.input<typeof dailyQueryInputSchema>
  ): Promise<z.infer<typeof dailyQueryResultSchema>>
  preview(
    input: z.input<typeof dailyPreviewInputSchema>
  ): Promise<z.infer<typeof dailyPreviewResultSchema>>
  inspect(
    input: z.input<typeof dailyInspectInputSchema>
  ): Promise<z.infer<typeof dailyDetailResultSchema>>
  run(input: z.input<typeof dailyRunInputSchema>): Promise<z.infer<typeof dailyJobResultSchema>>
  control(
    input: z.input<typeof dailyControlInputSchema>
  ): Promise<z.infer<typeof dailyJobResultSchema>>
  decide(
    input: z.input<typeof dailyDecideInputSchema>
  ): Promise<z.infer<typeof dailyReceiptResultSchema>>
  ack(input: z.input<typeof dailyAckInputSchema>): Promise<z.infer<typeof dailyReceiptResultSchema>>
  onChanged(listener: (event: DailyChanged) => void): () => void
}
