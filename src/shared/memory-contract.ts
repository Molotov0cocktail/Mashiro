import { z } from 'zod'

const uuid = z.string().uuid()
const version = z.number().int().nonnegative()
const timestamp = z.iso.datetime({ offset: true })
export const memoryKindSchema = z.enum(['user', 'relationship', 'continuity', 'event'])
export const memoryScopeSchema = z.enum(['global', 'assistant'])
export const memoryNatureSchema = z.enum(['user-statement', 'faithful-summary', 'inference'])
export const memoryEventSchema = z.strictObject({
  status: z.enum([
    'intention',
    'planned',
    'arranged',
    'reported-happened',
    'completed',
    'cancelled',
    'unknown'
  ]),
  occurredAt: timestamp.nullable(),
  timeZone: z.string().min(1).max(100).nullable()
})
export const memorySourceSchema = z.strictObject({
  type: z.enum(['round', 'user-round', 'memory', 'manual']),
  id: uuid,
  assistantId: uuid,
  version
})
export const memoryRecordSchema = z.strictObject({
  id: uuid,
  objectVersion: version,
  kind: memoryKindSchema,
  scope: memoryScopeSchema,
  ownerAssistantId: uuid,
  title: z.string().min(1).max(160),
  markdown: z.string().max(16000),
  bodyTruncated: z.boolean().optional(),
  nature: memoryNatureSchema,
  event: memoryEventSchema.nullable(),
  state: z.enum(['active', 'pending', 'suppressed', 'integrity-blocked']),
  retention: z.enum(['persistent', 'staging', 'trash']),
  createdAt: timestamp,
  updatedAt: timestamp,
  sources: z.array(memorySourceSchema).max(64)
})
export const memoryWriteSchema = z.strictObject({
  action: z.enum(['remember', 'correct']),
  targetId: uuid.nullable(),
  expectedVersion: version.nullable(),
  kind: memoryKindSchema,
  scope: memoryScopeSchema,
  title: z.string().trim().min(1).max(160),
  markdown: z.string().trim().min(1).max(16000),
  nature: memoryNatureSchema,
  event: memoryEventSchema.nullable()
})
export const memoryCreateToolSchema = memoryWriteSchema.omit({
  action: true,
  targetId: true,
  expectedVersion: true
})
export const memoryCorrectToolSchema = memoryWriteSchema
  .omit({ action: true })
  .extend({ targetId: uuid, expectedVersion: z.number().int().positive() })
export const memoryRemovalSchema = z.strictObject({
  action: z.enum(['delete', 'withdraw', 'restore']),
  targetId: uuid,
  expectedVersion: version
})
export const memoryMutationSchema = z.union([memoryWriteSchema, memoryRemovalSchema])
export const memoryQueryInputSchema = z.strictObject({
  protocolVersion: z.literal(1),
  assistantId: uuid,
  query: z.string().max(200).default(''),
  scope: z.enum(['all', 'global', 'assistant']).default('all'),
  kind: z.enum(['all', 'user', 'relationship', 'continuity', 'event']).default('all'),
  includeTrash: z.boolean().default(false),
  cursor: version.optional(),
  limit: z.number().int().min(1).max(100).default(30)
})
export const memoryMutateInputSchema = z.strictObject({
  protocolVersion: z.literal(1),
  assistantId: uuid,
  commandId: uuid,
  mutation: memoryMutationSchema
})
export const memoryInspectInputSchema = z.strictObject({
  protocolVersion: z.literal(1),
  assistantId: uuid,
  id: uuid
})
export const memoryPermissionInputSchema = z.strictObject({
  protocolVersion: z.literal(1),
  assistantId: uuid,
  scope: memoryScopeSchema
})
export const memoryPermissionsSchema = z.strictObject({
  assistantId: uuid,
  scope: memoryScopeSchema,
  version,
  read: z.boolean(),
  write: z.boolean(),
  writeInferences: z.boolean(),
  receive: z.boolean(),
  endpointDisplay: z.string().max(2048).nullable(),
  endpointFingerprint: z.string().nullable()
})
export const memorySetPermissionsInputSchema = z.strictObject({
  protocolVersion: z.literal(1),
  assistantId: uuid,
  scope: memoryScopeSchema,
  expectedVersion: version,
  read: z.boolean(),
  write: z.boolean(),
  writeInferences: z.boolean(),
  receive: z.boolean()
})
export const memoryConfirmInputSchema = z.strictObject({
  protocolVersion: z.literal(1),
  assistantId: uuid,
  confirmationId: uuid,
  accept: z.boolean()
})
export const memoryReloadInputSchema = z.strictObject({
  protocolVersion: z.literal(1),
  assistantId: uuid,
  id: uuid,
  expectedVersion: version
})
export const memoryAcceptReloadInputSchema = z.strictObject({
  protocolVersion: z.literal(1),
  assistantId: uuid,
  previewId: uuid
})
export const memoryReceiptSchema = z.strictObject({
  operationId: uuid,
  objectId: uuid,
  objectVersion: version,
  state: z.enum(['SUCCEEDED', 'PENDING_CONFIRMATION', 'CANCELLED_BEFORE_DISPATCH']),
  summary: z.string().max(300),
  confirmationId: uuid.nullable(),
  impact: z
    .strictObject({
      sourceRounds: z.array(z.strictObject({ assistantId: uuid, requestId: uuid })).max(64),
      memoryIds: z.array(uuid).max(64),
      roundIds: z.array(uuid).max(64),
      totalMemories: version,
      totalRounds: version,
      truncated: z.boolean()
    })
    .optional()
})
export const memoryChangeSchema = z.strictObject({
  operationId: uuid,
  action: z.string().max(40),
  objectVersion: version,
  createdAt: timestamp,
  actor: z.enum(['user', 'assistant'])
})
const errorSchema = z.strictObject({
  code: z.enum([
    'INVALID_INPUT',
    'NOT_FOUND',
    'STALE_WRITE',
    'PERMISSION_DENIED',
    'INTEGRITY',
    'CONFLICT',
    'STORAGE_UNAVAILABLE'
  ]),
  message: z.string().max(200)
})
const result = <T extends z.ZodType>(data: T) =>
  z.discriminatedUnion('ok', [
    z.strictObject({ ok: z.literal(true), data }),
    z.strictObject({ ok: z.literal(false), error: errorSchema })
  ])
export const memoryQueryResultSchema = result(
  z.strictObject({ records: z.array(memoryRecordSchema).max(100), nextCursor: version.nullable() })
)
export const memoryMutationResultSchema = result(memoryReceiptSchema)
export const memoryPermissionsResultSchema = result(memoryPermissionsSchema)
export const memoryInspectResultSchema = result(
  z.strictObject({
    record: memoryRecordSchema,
    changes: z.array(memoryChangeSchema).max(100),
    receipts: z.array(memoryReceiptSchema).max(100),
    providedToRequests: z.array(uuid).max(100),
    cleanupPending: z.boolean(),
    organizationPending: z.boolean()
  })
)
export const memoryReloadResultSchema = result(
  z.strictObject({
    previewId: uuid,
    id: uuid,
    expectedVersion: version,
    currentMarkdown: z.string().max(16000).nullable(),
    candidateMarkdown: z.string().max(16000),
    warning: z.string().max(300)
  })
)
export type MemoryRecord = z.infer<typeof memoryRecordSchema>
export type MemoryMutation = z.infer<typeof memoryMutationSchema>
export type MemorySource = z.infer<typeof memorySourceSchema>
export type MemoryReceipt = z.infer<typeof memoryReceiptSchema>
export type MemoryPermissions = z.infer<typeof memoryPermissionsSchema>
export interface MemoryApi {
  query(
    input: z.input<typeof memoryQueryInputSchema>
  ): Promise<z.infer<typeof memoryQueryResultSchema>>
  mutate(
    input: z.infer<typeof memoryMutateInputSchema>
  ): Promise<z.infer<typeof memoryMutationResultSchema>>
  inspect(
    input: z.infer<typeof memoryInspectInputSchema>
  ): Promise<z.infer<typeof memoryInspectResultSchema>>
  permissions(
    input: z.infer<typeof memoryPermissionInputSchema>
  ): Promise<z.infer<typeof memoryPermissionsResultSchema>>
  setPermissions(
    input: z.infer<typeof memorySetPermissionsInputSchema>
  ): Promise<z.infer<typeof memoryPermissionsResultSchema>>
  confirm(
    input: z.infer<typeof memoryConfirmInputSchema>
  ): Promise<z.infer<typeof memoryMutationResultSchema>>
  previewReload(
    input: z.infer<typeof memoryReloadInputSchema>
  ): Promise<z.infer<typeof memoryReloadResultSchema>>
  acceptReload(
    input: z.infer<typeof memoryAcceptReloadInputSchema>
  ): Promise<z.infer<typeof memoryMutationResultSchema>>
}
