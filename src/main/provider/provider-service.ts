import { randomUUID } from 'node:crypto'
import type { ZodType } from 'zod'
import {
  bindAssistantInputSchema,
  cancelChatInputSchema,
  clearChatInputSchema,
  deleteCredentialInputSchema,
  providerChatResultSchema,
  providerListInputSchema,
  providerResultSchema,
  saveConnectionInputSchema,
  setCredentialInputSchema,
  startChatInputSchema,
  type ProviderChatResult,
  type ProviderEvent,
  type ProviderResult,
  type ProviderSnapshot
} from '../../shared/provider-contract.js'
import { SqliteStore } from '../data/sqlite.js'
import {
  chatCompletions,
  validateBaseUrl,
  type TransportRequest,
  type TransportResult
} from './chat-completions-transport.js'
import {
  CredentialProtectionUnavailableError,
  CredentialVault,
  type CredentialProtector
} from './credential-vault.js'
import { ProviderDomainError, ProviderRepository } from './provider-repository.js'

type ChatTransport = (request: TransportRequest) => Promise<TransportResult>
type ChatMessage = { role: 'user' | 'assistant'; content: string }

class InvalidProviderInputError extends Error {}
class ProviderRequestInProgressError extends Error {}

function normalize(value: string, maximum: number): string {
  if (
    [...value].some(
      (character) => character.codePointAt(0)! < 0x20 && !['\n', '\r', '\t'].includes(character)
    )
  ) {
    throw new InvalidProviderInputError()
  }
  const normalized = value.trim().normalize('NFC')
  if ([...normalized].length < 1 || [...normalized].length > maximum) {
    throw new InvalidProviderInputError()
  }
  return normalized
}

function failure(
  code: Parameters<typeof errorDetails>[0],
  message?: string
): Extract<ProviderResult, { ok: false }> {
  const details = errorDetails(code)
  return {
    ok: false,
    error: {
      code,
      message: message ?? details.message,
      correlationId: randomUUID(),
      retryable: details.retryable
    }
  }
}

function chatFailure(
  code: Parameters<typeof errorDetails>[0]
): Extract<ProviderChatResult, { ok: false }> {
  return failure(code) as Extract<ProviderChatResult, { ok: false }>
}

function errorDetails(
  code:
    | 'INVALID_INPUT'
    | 'NOT_FOUND'
    | 'STALE_WRITE'
    | 'ASSISTANT_ARCHIVED'
    | 'CONNECTION_DISABLED'
    | 'CREDENTIAL_MISSING'
    | 'CREDENTIAL_PROTECTION_UNAVAILABLE'
    | 'REQUEST_IN_PROGRESS'
    | 'AUTHENTICATION'
    | 'QUOTA'
    | 'CONFIGURATION'
    | 'TEMPORARY'
    | 'PROTOCOL'
    | 'TIMEOUT'
    | 'LIMIT'
    | 'CANCELLED'
    | 'STORAGE_UNAVAILABLE'
    | 'INTERNAL_ERROR'
): { message: string; retryable: boolean } {
  const values = {
    INVALID_INPUT: ['Provider request is invalid', false],
    NOT_FOUND: ['Provider connection or binding was not found', false],
    STALE_WRITE: ['Provider settings changed; refresh and try again', false],
    ASSISTANT_ARCHIVED: ['Archived assistants cannot use Provider chat', false],
    CONNECTION_DISABLED: ['This Provider connection is disabled', false],
    CREDENTIAL_MISSING: ['This Provider connection needs an API key', false],
    CREDENTIAL_PROTECTION_UNAVAILABLE: ['Windows credential protection is unavailable', false],
    REQUEST_IN_PROGRESS: ['This assistant already has a request in progress', false],
    AUTHENTICATION: ['Provider authentication failed', false],
    QUOTA: ['Provider quota is unavailable', false],
    CONFIGURATION: ['Provider configuration is invalid', false],
    TEMPORARY: ['Provider is temporarily unavailable', true],
    PROTOCOL: ['Provider returned an invalid or incomplete response', false],
    TIMEOUT: ['Provider request timed out', true],
    LIMIT: ['Provider response exceeded the safe limit', false],
    CANCELLED: ['Provider request was cancelled', false],
    STORAGE_UNAVAILABLE: ['Provider storage is unavailable', true],
    INTERNAL_ERROR: ['Provider service failed', false]
  } as const
  const selected = values[code]
  return { message: selected[0], retryable: selected[1] }
}

function transportError(
  value: NonNullable<TransportResult['error']>
): Parameters<typeof errorDetails>[0] {
  const values = {
    authentication: 'AUTHENTICATION',
    quota: 'QUOTA',
    configuration: 'CONFIGURATION',
    temporary: 'TEMPORARY',
    protocol: 'PROTOCOL',
    timeout: 'TIMEOUT',
    cancelled: 'CANCELLED',
    limit: 'LIMIT'
  } as const
  return values[value]
}

function transportResultError(result: TransportResult): 'LIMIT' | 'PROTOCOL' | null {
  if (typeof result.text !== 'string') return 'PROTOCOL'
  if (result.text.length > 120000) return 'LIMIT'
  if (!['completed', 'interrupted', 'cancelled', 'failed'].includes(result.status)) {
    return 'PROTOCOL'
  }
  if (result.usage !== null) {
    const values = [
      result.usage.promptTokens,
      result.usage.completionTokens,
      result.usage.totalTokens
    ]
    if (!values.every((value) => Number.isSafeInteger(value) && value >= 0)) {
      return 'PROTOCOL'
    }
  }
  return null
}

export class ProviderService {
  private readonly repository: ProviderRepository
  private readonly vault: CredentialVault
  private readonly sessions = new Map<string, ChatMessage[]>()
  private readonly inflight = new Map<
    string,
    { assistantId: string; connectionId: string; controller: AbortController }
  >()

  private constructor(
    private readonly store: SqliteStore,
    credentialDirectory: string,
    protector: CredentialProtector,
    private readonly transport: ChatTransport
  ) {
    this.repository = new ProviderRepository(store)
    this.vault = new CredentialVault(credentialDirectory, protector)
  }

  static open(
    databasePath: string,
    credentialDirectory: string,
    protector: CredentialProtector,
    transport: ChatTransport = chatCompletions
  ): ProviderService {
    return new ProviderService(
      new SqliteStore(databasePath),
      credentialDirectory,
      protector,
      transport
    )
  }

  list(input: unknown): ProviderResult {
    return this.handle(providerListInputSchema, input, () => this.snapshot())
  }

  saveConnection(input: unknown): ProviderResult {
    return this.handle(saveConnectionInputSchema, input, (value) => {
      this.repository.saveConnection({
        connectionId: value.connectionId,
        displayName: normalize(value.displayName, 80),
        baseUrl: validateBaseUrl(value.baseUrl),
        enabled: value.enabled,
        expectedVersion: value.expectedVersion
      })
      if (value.connectionId && !value.enabled) this.cancelConnection(value.connectionId)
      return this.snapshot()
    })
  }

  setCredential(input: unknown): ProviderResult {
    return this.handle(setCredentialInputSchema, input, (value) => {
      if (!this.repository.connectionExists(value.connectionId)) {
        throw new ProviderDomainError('NOT_FOUND')
      }
      const apiKey = normalize(value.apiKey, 4096)
      if (value.persistence === 'temporary') {
        this.vault.setTemporary(value.connectionId, apiKey)
      } else {
        this.vault.setPersistent(value.connectionId, apiKey)
        this.repository.setPersistentCredential(value.connectionId, true)
      }
      return this.snapshot()
    })
  }

  deleteCredential(input: unknown): ProviderResult {
    return this.handle(deleteCredentialInputSchema, input, (value) => {
      if (!this.repository.connectionExists(value.connectionId)) {
        throw new ProviderDomainError('NOT_FOUND')
      }
      this.cancelConnection(value.connectionId)
      this.vault.delete(value.connectionId)
      this.repository.setPersistentCredential(value.connectionId, false)
      return this.snapshot()
    })
  }

  bindAssistant(input: unknown): ProviderResult {
    return this.handle(bindAssistantInputSchema, input, (value) => {
      this.repository.bind({
        assistantId: value.assistantId,
        connectionId: value.connectionId,
        model: normalize(value.model, 160),
        expectedVersion: value.expectedVersion
      })
      return this.snapshot()
    })
  }

  clearChat(input: unknown): ProviderResult {
    return this.handle(clearChatInputSchema, input, (value) => {
      if (
        [...this.inflight.values()].some((request) => request.assistantId === value.assistantId)
      ) {
        throw new ProviderRequestInProgressError()
      }
      this.repository.execution(value.assistantId)
      this.sessions.delete(value.assistantId)
      return this.snapshot()
    })
  }

  async startChat(
    input: unknown,
    emit: (event: ProviderEvent) => void
  ): Promise<ProviderChatResult> {
    const parsed = startChatInputSchema.safeParse(input)
    if (!parsed.success) return chatFailure('INVALID_INPUT')
    const value = parsed.data
    if (
      this.inflight.has(value.requestId) ||
      [...this.inflight.values()].some((entry) => entry.assistantId === value.assistantId)
    ) {
      return chatFailure('REQUEST_IN_PROGRESS')
    }
    let controller: AbortController | undefined
    try {
      const text = normalize(value.text, 16000)
      const execution = this.repository.execution(value.assistantId)
      const apiKey = this.vault.get(execution.connection.id)
      if (!apiKey) return chatFailure('CREDENTIAL_MISSING')
      const previous = this.sessions.get(value.assistantId) ?? []
      const totalCharacters =
        previous.reduce((total, message) => total + message.content.length, 0) + text.length
      if (previous.length >= 64 || totalCharacters > 120000) return chatFailure('LIMIT')
      controller = new AbortController()
      this.inflight.set(value.requestId, {
        assistantId: value.assistantId,
        connectionId: execution.connection.id,
        controller
      })
      const messages: ChatMessage[] = [...previous, { role: 'user', content: text }]
      const result = await this.transport({
        baseUrl: execution.connection.baseUrl,
        apiKey,
        model: execution.binding.model,
        messages,
        stream: value.stream,
        signal: controller.signal,
        onDelta: value.stream
          ? (delta) => {
              if (typeof delta !== 'string') return
              for (let offset = 0; offset < delta.length; offset += 65536) {
                emit({
                  type: 'delta',
                  requestId: value.requestId,
                  assistantId: value.assistantId,
                  text: delta.slice(offset, offset + 65536)
                })
              }
            }
          : undefined
      })
      const invalidResult = transportResultError(result)
      if (invalidResult) {
        emit({ type: 'failed', requestId: value.requestId, assistantId: value.assistantId })
        return chatFailure(invalidResult)
      }
      if (result.status === 'completed' || (result.status === 'interrupted' && result.text)) {
        this.sessions.set(value.assistantId, [
          ...messages,
          { role: 'assistant', content: result.text }
        ])
      }
      const eventType = result.status === 'failed' ? 'failed' : result.status
      emit({ type: eventType, requestId: value.requestId, assistantId: value.assistantId })
      if (result.status === 'failed') {
        return chatFailure(transportError(result.error ?? 'temporary'))
      }
      return providerChatResultSchema.parse({
        ok: true,
        data: {
          requestId: value.requestId,
          assistantId: value.assistantId,
          status: result.status,
          text: result.text,
          usage: result.usage
        }
      })
    } catch (error) {
      return this.asChatFailure(error)
    } finally {
      const current = this.inflight.get(value.requestId)
      if (current?.controller === controller) this.inflight.delete(value.requestId)
    }
  }

  cancelChat(input: unknown): ProviderChatResult {
    const parsed = cancelChatInputSchema.safeParse(input)
    if (!parsed.success) return chatFailure('INVALID_INPUT')
    const request = this.inflight.get(parsed.data.requestId)
    if (!request || request.assistantId !== parsed.data.assistantId) {
      return chatFailure('NOT_FOUND')
    }
    request.controller.abort()
    return providerChatResultSchema.parse({
      ok: true,
      data: {
        requestId: parsed.data.requestId,
        assistantId: parsed.data.assistantId,
        status: 'cancelled',
        text: '',
        usage: null
      }
    })
  }

  close(): void {
    for (const request of this.inflight.values()) request.controller.abort()
    this.inflight.clear()
    this.sessions.clear()
    this.vault.clearTemporary()
    this.store.close()
  }

  private cancelConnection(connectionId: string): void {
    for (const request of this.inflight.values()) {
      if (request.connectionId === connectionId) request.controller.abort()
    }
  }

  private snapshot(): ProviderSnapshot {
    return this.repository.snapshot(this.vault.temporaryIds())
  }

  private handle<T>(
    schema: ZodType<T>,
    input: unknown,
    operation: (value: T) => ProviderSnapshot
  ): ProviderResult {
    const parsed = schema.safeParse(input)
    if (!parsed.success) return failure('INVALID_INPUT')
    try {
      return providerResultSchema.parse({ ok: true, data: operation(parsed.data) })
    } catch (error) {
      return failureFrom(error)
    }
  }

  private asChatFailure(error: unknown): ProviderChatResult {
    return providerChatResultSchema.parse(failureFrom(error))
  }
}

function failureFrom(error: unknown): Extract<ProviderResult, { ok: false }> {
  if (error instanceof InvalidProviderInputError) return failure('INVALID_INPUT')
  if (error instanceof ProviderRequestInProgressError) return failure('REQUEST_IN_PROGRESS')
  if (error instanceof CredentialProtectionUnavailableError) {
    return failure('CREDENTIAL_PROTECTION_UNAVAILABLE')
  }
  if (error instanceof ProviderDomainError) return failure(error.code)
  if (error instanceof Error && error.message === 'Invalid Provider base URL') {
    return failure('CONFIGURATION')
  }
  return failure('STORAGE_UNAVAILABLE')
}
