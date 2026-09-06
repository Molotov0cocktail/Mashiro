import { randomUUID } from 'node:crypto'
import {
  timelineReadInputSchema,
  timelineSaveInputSchema,
  timelineResultSchema,
  type TimelineMessage,
  type TimelineResult,
  type TimelineSnapshot,
  type ChatMode
} from '../../shared/timeline-contract.js'
import { TimelineRepository } from './timeline-repository.js'
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
  private readonly timeline: TimelineRepository
  private readonly sessions = new Map<string, { id: string; messages: TimelineMessage[] }>()
  private closed = false
  private readonly inflight = new Map<
    string,
    {
      assistantId: string
      connectionId: string
      controller: AbortController
      mode: ChatMode
      response: TimelineMessage
    }
  >()

  private constructor(
    private readonly store: SqliteStore,
    credentialDirectory: string,
    protector: CredentialProtector,
    private readonly transport: ChatTransport
  ) {
    this.repository = new ProviderRepository(store)
    this.timeline = new TimelineRepository(store)
    this.timeline.recover()
    this.vault = new CredentialVault(credentialDirectory, protector)
  }

  static open(
    databasePath: string,
    credentialDirectory: string,
    protector: CredentialProtector,
    transport: ChatTransport = chatCompletions
  ): ProviderService {
    const store = new SqliteStore(databasePath)
    try {
      return new ProviderService(store, credentialDirectory, protector, transport)
    } catch (error) {
      store.close()
      throw error
    }
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
      if (value.connectionId) this.cancelConnection(value.connectionId)
      return this.snapshot()
    })
  }

  setCredential(input: unknown): ProviderResult {
    return this.handle(setCredentialInputSchema, input, (value) => {
      if (!this.repository.connectionExists(value.connectionId)) {
        throw new ProviderDomainError('NOT_FOUND')
      }
      const apiKey = normalize(value.apiKey, 4096)
      this.cancelConnection(value.connectionId)
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
      if (!this.repository.assistantExists(value.assistantId))
        throw new ProviderDomainError('NOT_FOUND')
      this.sessions.delete(value.assistantId)
      return this.snapshot()
    })
  }

  readTimeline(input: unknown): TimelineResult {
    const parsed = timelineReadInputSchema.safeParse(input)
    if (!parsed.success) return failure('INVALID_INPUT')
    try {
      if (!this.repository.assistantExists(parsed.data.assistantId))
        throw new ProviderDomainError('NOT_FOUND')
      return timelineResultSchema.parse({
        ok: true,
        data:
          parsed.data.mode === 'normal'
            ? this.timeline.read(parsed.data.assistantId)
            : this.temporarySnapshot(parsed.data.assistantId)
      })
    } catch (error) {
      return failureFrom(error)
    }
  }

  saveTemporary(input: unknown): TimelineResult {
    const parsed = timelineSaveInputSchema.safeParse(input)
    if (!parsed.success) return failure('INVALID_INPUT')
    try {
      const assistantId = parsed.data.assistantId
      if (!this.repository.assistantExists(assistantId)) throw new ProviderDomainError('NOT_FOUND')
      if ([...this.inflight.values()].some((request) => request.assistantId === assistantId)) {
        throw new ProviderRequestInProgressError()
      }
      const session = this.sessions.get(assistantId)
      if (session) {
        this.timeline.insert(assistantId, session.messages, session.id)
        for (const message of session.messages) message.saved = true
      }
      return timelineResultSchema.parse({ ok: true, data: this.temporarySnapshot(assistantId) })
    } catch (error) {
      return failureFrom(error)
    }
  }

  private temporarySnapshot(assistantId: string): TimelineSnapshot {
    return {
      assistantId,
      mode: 'temporary',
      messages: this.sessions.get(assistantId)?.messages.map((message) => ({ ...message })) ?? [],
      hasMore: false
    }
  }

  async startChat(
    input: unknown,
    emit: (event: ProviderEvent) => void
  ): Promise<ProviderChatResult> {
    const parsed = startChatInputSchema.safeParse(input)
    if (!parsed.success) return chatFailure('INVALID_INPUT')
    const value = parsed.data
    if (this.closed) return chatFailure('STORAGE_UNAVAILABLE')
    if (
      this.inflight.has(value.requestId) ||
      [...this.inflight.values()].some((entry) => entry.assistantId === value.assistantId)
    ) {
      return chatFailure('REQUEST_IN_PROGRESS')
    }
    let controller: AbortController | undefined
    let response: TimelineMessage | undefined
    let deltaLimitExceeded = false
    const finish = (status: TimelineMessage['status'], content: string): void => {
      if (!response || this.closed) return
      response.status = status
      response.content = content.slice(0, 120000)
      if (value.mode === 'normal') this.timeline.finish(value.assistantId, response)
    }
    try {
      const text = normalize(value.text, 16000)
      // Authority and actual recipient are re-resolved in trusted code on every send.
      const execution = this.repository.execution(value.assistantId)
      const apiKey = this.vault.get(execution.connection.id)
      if (!apiKey) return chatFailure('CREDENTIAL_MISSING')
      let session = this.sessions.get(value.assistantId)
      let previous: ChatMessage[]
      if (value.mode === 'normal') {
        previous = this.timeline.context(value.assistantId, text.length)
      } else {
        session ??= { id: randomUUID(), messages: [] }
        if (session.messages.length >= 64) return chatFailure('LIMIT')
        if (session.messages.some((message) => message.requestId === value.requestId))
          return chatFailure('INVALID_INPUT')
        previous = []
        for (let index = 0; index < session.messages.length; index += 2) {
          const user = session.messages[index]!
          const assistant = session.messages[index + 1]
          if (assistant?.status === 'completed')
            previous.push(
              { role: 'user', content: user.content },
              { role: 'assistant', content: assistant.content }
            )
        }
        if (
          previous.reduce((total, message) => total + message.content.length, text.length) > 120000
        )
          return chatFailure('LIMIT')
      }
      const now = new Date().toISOString()
      const user: TimelineMessage = {
        id: randomUUID(),
        requestId: value.requestId,
        role: 'user',
        content: text,
        status: 'completed',
        createdAt: now,
        saved: value.mode === 'normal'
      }
      response = {
        id: randomUUID(),
        requestId: value.requestId,
        role: 'assistant',
        content: '',
        status: 'pending',
        createdAt: now,
        saved: value.mode === 'normal'
      }
      // The user and pending response commit atomically BEFORE the transport starts.
      if (value.mode === 'normal') this.timeline.insert(value.assistantId, [user, response])
      else {
        session!.messages.push(user, response)
        this.sessions.set(value.assistantId, session!)
      }
      controller = new AbortController()
      this.inflight.set(value.requestId, {
        assistantId: value.assistantId,
        connectionId: execution.connection.id,
        controller,
        mode: value.mode,
        response
      })
      const result = await this.transport({
        baseUrl: execution.connection.baseUrl,
        apiKey,
        model: execution.binding.model,
        messages: [...previous, { role: 'user', content: text }],
        stream: value.stream,
        signal: controller.signal,
        onDelta: value.stream
          ? (delta) => {
              if (this.closed || controller!.signal.aborted || typeof delta !== 'string' || !delta)
                return
              const available = 120000 - response!.content.length
              if (delta.length > available) {
                delta = delta.slice(0, available)
                deltaLimitExceeded = true
                controller!.abort()
              }
              response!.content += delta
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
      if (this.closed) return chatFailure('CANCELLED')
      const invalidResult = deltaLimitExceeded ? 'LIMIT' : transportResultError(result)
      if (invalidResult) {
        finish('failed', response.content)
        emit({ type: 'failed', requestId: value.requestId, assistantId: value.assistantId })
        return chatFailure(invalidResult)
      }
      const status = controller.signal.aborted ? 'cancelled' : result.status
      finish(status, result.text || response.content)
      emit({ type: status, requestId: value.requestId, assistantId: value.assistantId })
      if (status === 'failed') return chatFailure(transportError(result.error ?? 'temporary'))
      return providerChatResultSchema.parse({
        ok: true,
        data: {
          requestId: value.requestId,
          assistantId: value.assistantId,
          status,
          text: response.content,
          usage: result.usage
        }
      })
    } catch (error) {
      if (response && !this.closed) {
        try {
          finish(controller?.signal.aborted ? 'cancelled' : 'failed', response.content)
        } catch {
          return chatFailure('STORAGE_UNAVAILABLE')
        }
      }
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
    if (this.closed) return
    for (const request of this.inflight.values()) {
      request.response.status = request.controller.signal.aborted ? 'cancelled' : 'interrupted'
      request.controller.abort()
      if (request.mode === 'normal') this.timeline.finish(request.assistantId, request.response)
    }
    this.closed = true
    this.inflight.clear()
    this.sessions.clear()
    this.vault.clearTemporary()
    this.store.close()
  }

  cancelArchivedRequests(): void {
    for (const request of this.inflight.values()) {
      const assistant = this.store.database
        .prepare('SELECT archived_at FROM assistants WHERE id = ?')
        .get(request.assistantId) as { archived_at: string | null } | undefined
      if (!assistant || assistant.archived_at !== null) request.controller.abort()
    }
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
