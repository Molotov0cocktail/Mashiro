import { randomUUID } from 'node:crypto'
import type { ZodType } from 'zod'
import {
  archiveInputSchema,
  createInputSchema,
  listInputSchema,
  renameInputSchema,
  setPrimaryInputSchema,
  switchInputSchema,
  type AssistantResult,
  type AssistantSnapshot,
  type ErrorCode
} from '../../shared/assistant-contract.js'
import { AssistantRepository, DomainError } from './assistant-repository.js'
import { SqliteStore } from '../data/sqlite.js'
import { StorageInconsistentError } from '../data/schema.js'

class InvalidAssistantInputError extends Error {}

function normalizeDisplayName(value: string): string {
  if ([...value].some((character) => character.codePointAt(0)! <= 0x1f)) {
    throw new InvalidAssistantInputError('Assistant names cannot contain control characters')
  }
  const normalized = value.trim().normalize('NFC')
  const length = [...normalized].length
  if (length < 1 || length > 80) {
    throw new InvalidAssistantInputError('Assistant names must contain 1 to 80 characters')
  }
  return normalized
}

function failure(code: ErrorCode, message: string): AssistantResult {
  return {
    ok: false,
    error: {
      code,
      message,
      correlationId: randomUUID(),
      retryable: false
    }
  }
}

function domainMessage(code: DomainError['code']): string {
  switch (code) {
    case 'NOT_FOUND':
      return 'Assistant not found'
    case 'STALE_WRITE':
      return 'The assistant state changed; refresh and try again'
    case 'ASSISTANT_ARCHIVED':
      return 'Archived assistants cannot be changed'
    case 'PRIMARY_ARCHIVE_FORBIDDEN':
      return 'Choose another primary assistant before archiving this one'
    case 'STORAGE_INCONSISTENT':
      return 'Assistant storage is inconsistent'
  }
}

export class AssistantService {
  private constructor(
    private readonly store: SqliteStore,
    private readonly repository: AssistantRepository
  ) {}

  static open(databasePath: string): AssistantService {
    const store = new SqliteStore(databasePath)
    return new AssistantService(store, new AssistantRepository(store))
  }

  list(input: unknown): AssistantResult {
    return this.handle(listInputSchema, input, () => this.repository.snapshot())
  }

  create(input: unknown): AssistantResult {
    return this.handle(createInputSchema, input, (value) =>
      this.repository.create(normalizeDisplayName(value.displayName), value.expectedStateRevision)
    )
  }

  switch(input: unknown): AssistantResult {
    return this.handle(switchInputSchema, input, (value) =>
      this.repository.switch(value.assistantId, value.expectedStateRevision, value.restoreArchived)
    )
  }

  rename(input: unknown): AssistantResult {
    return this.handle(renameInputSchema, input, (value) =>
      this.repository.rename(
        value.assistantId,
        normalizeDisplayName(value.displayName),
        value.expectedAssistantVersion,
        value.expectedStateRevision
      )
    )
  }

  setPrimary(input: unknown): AssistantResult {
    return this.handle(setPrimaryInputSchema, input, (value) =>
      this.repository.setPrimary(
        value.assistantId,
        value.expectedAssistantVersion,
        value.expectedStateRevision
      )
    )
  }

  archive(input: unknown): AssistantResult {
    return this.handle(archiveInputSchema, input, (value) =>
      this.repository.archive(
        value.assistantId,
        value.expectedAssistantVersion,
        value.expectedStateRevision
      )
    )
  }

  close(): void {
    this.store.close()
  }

  private handle<T>(
    schema: ZodType<T>,
    input: unknown,
    operation: (value: T) => AssistantSnapshot
  ): AssistantResult {
    const parsed = schema.safeParse(input)
    if (!parsed.success) {
      return failure('INVALID_INPUT', 'Invalid assistant request')
    }
    try {
      return { ok: true, data: operation(parsed.data) }
    } catch (error) {
      if (error instanceof InvalidAssistantInputError) {
        return failure('INVALID_INPUT', error.message)
      }
      if (error instanceof DomainError) {
        return failure(error.code, domainMessage(error.code))
      }
      if (error instanceof StorageInconsistentError) {
        return failure('STORAGE_INCONSISTENT', 'Assistant storage is inconsistent')
      }
      return failure('STORAGE_UNAVAILABLE', 'Assistant storage is unavailable')
    }
  }
}
