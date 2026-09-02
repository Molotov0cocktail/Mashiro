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

export type ErrorCode =
  | 'INVALID_INPUT'
  | 'NOT_FOUND'
  | 'STALE_WRITE'
  | 'ASSISTANT_ARCHIVED'
  | 'PRIMARY_ARCHIVE_FORBIDDEN'
  | 'STORAGE_UNAVAILABLE'
  | 'STORAGE_INCONSISTENT'
  | 'INTERNAL_ERROR'

export interface AssistantDto {
  id: string
  displayName: string
  isArchived: boolean
  createdAt: string
  updatedAt: string
  archivedAt: string | null
  version: number
}

export interface AssistantSnapshot {
  assistants: AssistantDto[]
  currentAssistantId: string | null
  primaryAssistantId: string | null
  stateRevision: number
}

export type AssistantResult =
  | { ok: true; data: AssistantSnapshot }
  | {
      ok: false
      error: {
        code: ErrorCode
        message: string
        correlationId: string
        retryable: false
      }
    }

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
