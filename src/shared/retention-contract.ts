import { z } from 'zod'

const uuid = z.string().uuid()
const version = z.number().int().nonnegative()
const base = { protocolVersion: z.literal(1), assistantId: uuid }
export const retentionZoneSchema = z.enum(['persistent', 'staging', 'trash'])
export const retentionTargetSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('memories'),
    objects: z
      .array(z.strictObject({ id: uuid, version }))
      .min(1)
      .max(4096)
  }),
  z.strictObject({ type: z.literal('message'), messageId: uuid }),
  z.strictObject({ type: z.literal('range'), firstMessageId: uuid, lastMessageId: uuid }),
  z.strictObject({ type: z.literal('timeline') }),
  z.strictObject({ type: z.literal('assistant'), replacementAssistantId: uuid.nullable() })
])
export const retentionOverviewInputSchema = z.strictObject(base)
export const retentionMoveInputSchema = z.strictObject({
  ...base,
  commandId: uuid,
  id: uuid,
  expectedVersion: version,
  zone: retentionZoneSchema,
  expectedEpoch: version
})
export const retentionPreviewInputSchema = z.strictObject({
  ...base,
  intent: z.enum([
    'delete-representation',
    'withdraw-information',
    'recycle-original',
    'restore-original',
    'empty-trash',
    'purge-assistant'
  ]),
  target: retentionTargetSchema
})
export const retentionConfirmInputSchema = z.strictObject({
  ...base,
  commandId: uuid,
  previewId: uuid,
  nonce: uuid,
  accept: z.boolean()
})
export const retentionJobsInputSchema = z.strictObject({
  protocolVersion: z.literal(1),
  assistantId: uuid.optional(),
  cursor: version.optional()
})
export const retentionRetryInputSchema = z.strictObject({
  protocolVersion: z.literal(1),
  assistantId: uuid.optional(),
  jobId: uuid
})
export const retentionChangedSchema = z.strictObject({
  epoch: version,
  assistantIds: z.array(uuid),
  memoryIds: z.array(uuid),
  requestIds: z.array(uuid),
  reason: z.enum(['move', 'cleanup', 'purge', 'job-status'])
})
export const retentionReceiptSchema = z.strictObject({
  commandId: uuid,
  epoch: version,
  jobId: uuid.nullable(),
  state: z.enum(['MOVED', 'CANCELLED', 'CLEANUP_PENDING', 'COMPLETED']),
  objectVersion: version.nullable()
})
export const retentionJobSchema = z.strictObject({
  id: uuid,
  state: z.enum(['CLEANUP_PENDING', 'CLEANING', 'FAILED_RETRYABLE', 'COMPLETED']),
  total: version,
  completed: version,
  error: z.enum(['FILE_CHANGED', 'UNSAFE_PATH', 'STORAGE_UNAVAILABLE']).nullable(),
  createdAt: z.iso.datetime(),
  assistantId: uuid
})
export const retentionPreviewSchema = z.strictObject({
  id: uuid,
  nonce: uuid,
  epoch: version,
  intent: retentionPreviewInputSchema.shape.intent,
  rounds: z
    .array(
      z.strictObject({
        assistantId: uuid,
        requestId: uuid,
        createdAt: z.iso.datetime({ offset: true }).nullable(),
        summary: z.string().max(120).nullable()
      })
    )
    .max(4096),
  memories: z
    .array(
      z.strictObject({
        id: uuid,
        version,
        ownerAssistantId: uuid,
        kind: z.enum(['user', 'relationship', 'continuity', 'event']),
        scope: z.enum(['global', 'assistant']),
        title: z.string().max(160).nullable()
      })
    )
    .max(4096),
  memoryIds: z.array(uuid).max(4096),
  requestIds: z.array(uuid).max(4096),
  retainedMemoryIds: z.array(uuid).max(4096),
  itemImpact: z
    .strictObject({
      items: z.array(z.strictObject({ id: uuid, version })).max(4096),
      proposals: z.array(z.strictObject({ id: uuid, version, delete: z.boolean() })).max(4096)
    })
    .optional(),
  files: version,
  expandedToRounds: z.boolean(),
  irreversible: z.boolean(),
  replacementAssistantId: uuid.nullable(),
  blockers: z.array(z.string().max(300)).max(20),
  warning: z.string().max(1000)
})
const error = z.strictObject({
  code: z.enum([
    'INVALID_INPUT',
    'NOT_FOUND',
    'STALE_PREVIEW',
    'PERMISSION_DENIED',
    'DEPENDENCY_BLOCKED',
    'NOT_RECOVERABLE',
    'CONFLICT',
    'STORAGE_UNAVAILABLE'
  ]),
  message: z.string().max(300)
})
const result = <T extends z.ZodType>(data: T) =>
  z.discriminatedUnion('ok', [
    z.strictObject({ ok: z.literal(true), data }),
    z.strictObject({ ok: z.literal(false), error })
  ])
export const retentionOverviewResultSchema = result(
  z.strictObject({
    epoch: version,
    zones: z
      .array(
        z.strictObject({ zone: retentionZoneSchema, objects: version, acceptedBytes: version })
      )
      .length(3),
    managedFileBytes: version,
    databaseBytes: version,
    automaticPolicy: z.literal('UNCONFIGURED')
  })
)
export const retentionPreviewResultSchema = result(retentionPreviewSchema)
export const retentionReceiptResultSchema = result(retentionReceiptSchema)
export const retentionJobsResultSchema = result(
  z.strictObject({ jobs: z.array(retentionJobSchema).max(100), nextCursor: version.nullable() })
)
export type RetentionPreview = z.infer<typeof retentionPreviewSchema>
export type RetentionReceipt = z.infer<typeof retentionReceiptSchema>
export type RetentionChanged = z.infer<typeof retentionChangedSchema>
export type RetentionJob = z.infer<typeof retentionJobSchema>
export type RetentionIntent = z.infer<typeof retentionPreviewInputSchema>
export interface RetentionApi {
  overview(
    input: z.infer<typeof retentionOverviewInputSchema>
  ): Promise<z.infer<typeof retentionOverviewResultSchema>>
  move(
    input: z.infer<typeof retentionMoveInputSchema>
  ): Promise<z.infer<typeof retentionReceiptResultSchema>>
  preview(input: RetentionIntent): Promise<z.infer<typeof retentionPreviewResultSchema>>
  confirm(
    input: z.infer<typeof retentionConfirmInputSchema>
  ): Promise<z.infer<typeof retentionReceiptResultSchema>>
  jobs(
    input: z.infer<typeof retentionJobsInputSchema>
  ): Promise<z.infer<typeof retentionJobsResultSchema>>
  retry(
    input: z.infer<typeof retentionRetryInputSchema>
  ): Promise<z.infer<typeof retentionReceiptResultSchema>>
  onChanged(listener: (event: RetentionChanged) => void): () => void
}
