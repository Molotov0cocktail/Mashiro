import { z } from 'zod'

export { assistantChannels } from './assistant-channels.js'

const protocolVersion = z.literal(1)
const stateRevision = z.number().int().nonnegative()
const assistantVersion = z.number().int().positive()
const assistantId = z.string().uuid()

export const listInputSchema = z.strictObject({ protocolVersion })
export const createInputSchema = z.strictObject({
  protocolVersion,
  displayName: z.string(),
  expectedStateRevision: stateRevision
})
export const switchInputSchema = z.strictObject({
  restoreArchived: z.boolean().optional(),
  protocolVersion,
  assistantId,
  expectedStateRevision: stateRevision
})
export const renameInputSchema = z.strictObject({
  protocolVersion,
  assistantId,
  displayName: z.string(),
  expectedAssistantVersion: assistantVersion,
  expectedStateRevision: stateRevision
})
export const setPrimaryInputSchema = z.strictObject({
  protocolVersion,
  assistantId,
  expectedAssistantVersion: assistantVersion,
  expectedStateRevision: stateRevision
})
export const archiveInputSchema = setPrimaryInputSchema

export const errorCodeSchema = z.enum([
  'INVALID_INPUT',
  'NOT_FOUND',
  'STALE_WRITE',
  'ASSISTANT_ARCHIVED',
  'PRIMARY_ARCHIVE_FORBIDDEN',
  'STORAGE_UNAVAILABLE',
  'STORAGE_INCONSISTENT',
  'INTERNAL_ERROR'
])

const assistantTimestamp = z.iso.datetime({ offset: true })

export const assistantDtoSchema = z.strictObject({
  id: assistantId,
  displayName: z.string(),
  isArchived: z.boolean(),
  createdAt: assistantTimestamp,
  updatedAt: assistantTimestamp,
  archivedAt: assistantTimestamp.nullable(),
  version: assistantVersion
})

export const assistantSnapshotSchema = z.strictObject({
  assistants: z.array(assistantDtoSchema),
  currentAssistantId: assistantId.nullable(),
  primaryAssistantId: assistantId.nullable(),
  stateRevision
})

export const assistantSuccessResultSchema = z.strictObject({
  ok: z.literal(true),
  data: assistantSnapshotSchema
})

export const assistantStableErrorSchema = z.strictObject({
  code: errorCodeSchema,
  message: z.string().min(1).max(160),
  correlationId: assistantId,
  retryable: z.literal(false)
})

export const assistantErrorResultSchema = z.strictObject({
  ok: z.literal(false),
  error: assistantStableErrorSchema
})

export const assistantResultSchema = z.discriminatedUnion('ok', [
  assistantSuccessResultSchema,
  assistantErrorResultSchema
])

export type ErrorCode = z.infer<typeof errorCodeSchema>
export type AssistantDto = z.infer<typeof assistantDtoSchema>
export type AssistantSnapshot = z.infer<typeof assistantSnapshotSchema>
export type AssistantResult = z.infer<typeof assistantResultSchema>

export type ListInput = z.infer<typeof listInputSchema>
export type CreateInput = z.infer<typeof createInputSchema>
export type SwitchInput = z.infer<typeof switchInputSchema>
export type RenameInput = z.infer<typeof renameInputSchema>
export type SetPrimaryInput = z.infer<typeof setPrimaryInputSchema>
export type ArchiveInput = z.infer<typeof archiveInputSchema>

export interface AssistantApi {
  list(input?: ListInput): Promise<AssistantResult>
  create(input: CreateInput): Promise<AssistantResult>
  switch(input: SwitchInput): Promise<AssistantResult>
  rename(input: RenameInput): Promise<AssistantResult>
  setPrimary(input: SetPrimaryInput): Promise<AssistantResult>
  archive(input: ArchiveInput): Promise<AssistantResult>
}
