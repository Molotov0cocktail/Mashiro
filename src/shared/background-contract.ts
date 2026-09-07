import { z } from 'zod'

const id = z.string().uuid()
const version = z.number().int().positive()
const envelope = { protocolVersion: z.literal(1), assistantId: id }
const timestamp = z.iso.datetime({ offset: true })
export const backgroundBudgetSchema = z.strictObject({
  // A saved UTC calendar-day window. Configuration edits never reset consumption.
  window: z.literal('utc-day'),
  calls: z.number().int().min(1).max(1000),
  inputCharacters: z.number().int().min(1).max(10000000)
})
export const backgroundSettingsSchema = z.strictObject({
  enabled: z.boolean(),
  connectionId: id.nullable(),
  model: z.string().trim().min(1).max(160).nullable(),
  allowOwnCompletedRounds: z.boolean(),
  budget: backgroundBudgetSchema.nullable()
})
export const backgroundConfigurationSchema = backgroundSettingsSchema.extend({
  assistantId: id,
  recipientFingerprint: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable(),
  recipientAuthorized: z.boolean(),
  version: z.number().int().nonnegative(),
  role: z.literal('assistant'),
  feature: z.literal('chapters')
})
export const backgroundUsageSchema = z.strictObject({
  windowId: z.string().max(20),
  calls: z.number().int().nonnegative(),
  inputCharacters: z.number().int().nonnegative(),
  knownPromptTokens: z.number().int().nonnegative(),
  knownCompletionTokens: z.number().int().nonnegative(),
  knownTotalTokens: z.number().int().nonnegative(),
  unknownAttempts: z.number().int().nonnegative()
})
export const backgroundJobStateSchema = z.enum([
  'QUEUED',
  'RUNNING',
  'BUDGET_PAUSED',
  'CONFIGURATION_BLOCKED',
  'PERMISSION_BLOCKED',
  'FAILED_CONFIRMED',
  'REMOTE_UNKNOWN',
  'CANCELLED',
  'STALE',
  'COMPLETED'
])
export const backgroundJobSchema = z.strictObject({
  id,
  version,
  assistantId: id,
  requestIds: z.array(id).min(1).max(16),
  configurationVersion: version,
  state: backgroundJobStateSchema,
  attempts: z.number().int().nonnegative(),
  createdAt: timestamp,
  updatedAt: timestamp,
  reason: z.string().max(200),
  chapterId: id.nullable(),
  receipt: z.strictObject({ commandId: id, memoryId: id, memoryVersion: version }).nullable()
})
export const backgroundTopicSchema = z.strictObject({
  id,
  version,
  text: z.string().min(1).max(500),
  nature: z.literal('model-suggestion'),
  state: z.enum(['OPEN', 'RESOLVED', 'DISMISSED'])
})
export const backgroundChapterSchema = z.strictObject({
  id,
  version,
  assistantId: id,
  jobId: id,
  title: z.string().min(1).max(160),
  requestIds: z.array(id).min(1).max(16),
  createdAt: timestamp,
  memoryId: id,
  memoryVersion: version,
  bodyHash: z.string().regex(/^[a-f0-9]{64}$/),
  state: z.enum(['AVAILABLE', 'UNAVAILABLE']),
  topics: z.array(backgroundTopicSchema).max(16)
})
export const backgroundQueryInputSchema = z.strictObject({
  ...envelope,
  cursor: z.number().int().nonnegative().default(0)
})
export const backgroundConfigureInputSchema = z.strictObject({
  ...envelope,
  expectedVersion: z.number().int().nonnegative(),
  settings: backgroundSettingsSchema,
  grantSelectedRecipient: z.boolean().default(false)
})
export const backgroundRunInputSchema = z.strictObject(envelope)
export const backgroundControlInputSchema = z.strictObject({
  ...envelope,
  jobId: id,
  expectedVersion: version,
  commandId: id,
  action: z.enum(['cancel', 'retry', 'retry-unknown', 'inspect'])
})
export const backgroundChapterInputSchema = z.strictObject({
  ...envelope,
  chapterId: id,
  expectedVersion: version
})
export const backgroundTopicInputSchema = z.strictObject({
  ...envelope,
  chapterId: id,
  expectedChapterVersion: version,
  topicId: id,
  expectedVersion: version,
  state: z.enum(['OPEN', 'RESOLVED', 'DISMISSED'])
})
export const backgroundChangedSchema = z.strictObject({ assistantId: id })
export const backgroundSnapshotSchema = z.strictObject({
  configuration: backgroundConfigurationSchema,
  usage: backgroundUsageSchema,
  nextCursor: z.number().int().nonnegative().nullable(),
  jobs: z.array(backgroundJobSchema).max(100),
  chapters: z.array(backgroundChapterSchema).max(100)
})
export const backgroundErrorSchema = z.strictObject({
  code: z.enum([
    'INVALID_INPUT',
    'NOT_FOUND',
    'STALE_WRITE',
    'PERMISSION_DENIED',
    'CONFIGURATION',
    'CONFLICT',
    'STORAGE_UNAVAILABLE'
  ]),
  message: z.string().max(200)
})
const result = <T extends z.ZodType>(data: T) =>
  z.discriminatedUnion('ok', [
    z.strictObject({ ok: z.literal(true), data }),
    z.strictObject({ ok: z.literal(false), error: backgroundErrorSchema })
  ])
export const backgroundSnapshotResultSchema = result(backgroundSnapshotSchema)
export const backgroundChapterResultSchema = result(
  z.strictObject({ chapter: backgroundChapterSchema, markdown: z.string().max(24000) })
)
export type BackgroundConfiguration = z.infer<typeof backgroundConfigurationSchema>
export type BackgroundJob = z.infer<typeof backgroundJobSchema>
export type BackgroundChapter = z.infer<typeof backgroundChapterSchema>
export type BackgroundUsage = z.infer<typeof backgroundUsageSchema>
export type BackgroundSnapshot = z.infer<typeof backgroundSnapshotSchema>
export type BackgroundChanged = z.infer<typeof backgroundChangedSchema>
export interface BackgroundApi {
  query(
    input: z.input<typeof backgroundQueryInputSchema>
  ): Promise<z.infer<typeof backgroundSnapshotResultSchema>>
  configure(
    input: z.input<typeof backgroundConfigureInputSchema>
  ): Promise<z.infer<typeof backgroundSnapshotResultSchema>>
  run(
    input: z.input<typeof backgroundRunInputSchema>
  ): Promise<z.infer<typeof backgroundSnapshotResultSchema>>
  control(
    input: z.input<typeof backgroundControlInputSchema>
  ): Promise<z.infer<typeof backgroundSnapshotResultSchema>>
  chapter(
    input: z.input<typeof backgroundChapterInputSchema>
  ): Promise<z.infer<typeof backgroundChapterResultSchema>>
  topic(
    input: z.input<typeof backgroundTopicInputSchema>
  ): Promise<z.infer<typeof backgroundSnapshotResultSchema>>
  onChanged(listener: (event: BackgroundChanged) => void): () => void
}
