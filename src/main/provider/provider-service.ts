import { randomUUID, createHash } from 'node:crypto'
import {
  toolReadInputSchema,
  capabilityInputSchema,
  type ProviderCapabilities
} from '../../shared/tool-contract.js'
import {
  toolReadResultSchema,
  capabilityResultSchema,
  type ToolReadResult,
  type CapabilityResult
} from '../../shared/provider-contract.js'
import { ToolRepository } from './tool-repository.js'
import { executeToolChat } from './tool-execution.js'
import { GLM_TOOL_ADAPTER, toolsSupported, type ProtocolMessage } from './tool-protocol.js'
import { HistoryPermissionRepository } from './history-permission-repository.js'
import {
  timelineQueryInputSchema,
  timelinePageResultSchema,
  historyPermissionsInputSchema,
  setHistoryPermissionsInputSchema,
  historyPermissionsResultSchema,
  type TimelinePageResult,
  type HistoryPermissions,
  type HistoryPermissionsResult,
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
type ChatMessage = ProtocolMessage

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
    | 'PERMISSION_DENIED'
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
    PERMISSION_DENIED: ['History access or recipient permission is denied', false],
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
  private readonly toolLedger: ToolRepository
  private readonly temporaryToolLedger = new ToolRepository()
  private readonly repository: ProviderRepository
  private readonly vault: CredentialVault
  private readonly timeline: TimelineRepository
  private readonly historyPermissions: HistoryPermissionRepository
  private readonly sessions = new Map<string, { id: string; messages: TimelineMessage[] }>()
  private closed = false
  private readonly inflight = new Map<
    string,
    {
      assistantId: string
      connectionId: string
      controller: AbortController
      endpointFingerprint: string | null
      historyUsed: boolean
      mode: ChatMode
      response: TimelineMessage
    }
  >()

  private constructor(
    private readonly store: SqliteStore,
    credentialDirectory: string,
    protector: CredentialProtector,
    private readonly transport: ChatTransport,
    private readonly toolOptions: { clock?: () => Date }
  ) {
    this.repository = new ProviderRepository(store)
    this.timeline = new TimelineRepository(store)
    this.historyPermissions = new HistoryPermissionRepository(store)
    this.timeline.recover()
    this.toolLedger = new ToolRepository(store)
    this.toolLedger.recover()
    this.vault = new CredentialVault(credentialDirectory, protector)
  }

  static open(
    databasePath: string,
    credentialDirectory: string,
    protector: CredentialProtector,
    transport: ChatTransport = chatCompletions,
    toolOptions: { clock?: () => Date } = {}
  ): ProviderService {
    const store = new SqliteStore(databasePath)
    try {
      return new ProviderService(store, credentialDirectory, protector, transport, toolOptions)
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
      this.temporaryToolLedger.clear(value.assistantId)
      return this.snapshot()
    })
  }

  queryTimeline(input: unknown): TimelinePageResult {
    const parsed = timelineQueryInputSchema.safeParse(input)
    if (!parsed.success) return failure('INVALID_INPUT')
    try {
      if (!this.repository.assistantExists(parsed.data.assistantId))
        throw new ProviderDomainError('NOT_FOUND')
      return timelinePageResultSchema.parse(
        this.timeline.query(
          parsed.data.assistantId,
          parsed.data.query,
          parsed.data.before,
          parsed.data.requestId
        )
      )
    } catch (error) {
      return failureFrom(error)
    }
  }

  tools(input: unknown): ToolReadResult {
    const parsed = toolReadInputSchema.safeParse(input)
    if (!parsed.success) return failure('INVALID_INPUT')
    try {
      const value = parsed.data
      if (!this.repository.assistantExists(value.assistantId))
        throw new ProviderDomainError('NOT_FOUND')
      const ledger = value.mode === 'normal' ? this.toolLedger : this.temporaryToolLedger
      const includeHistory =
        value.mode === 'normal' && this.permissionSnapshot(value.assistantId).readHistory
      return toolReadResultSchema.parse({
        ok: true,
        data: {
          assistantId: value.assistantId,
          mode: value.mode,
          operations: ledger.read(value.assistantId, value.requestId, includeHistory)
        }
      })
    } catch (error) {
      return failureFrom(error)
    }
  }

  capabilities(input: unknown): CapabilityResult {
    const parsed = capabilityInputSchema.safeParse(input)
    if (!parsed.success) return failure('INVALID_INPUT')
    try {
      const permissions = this.permissionSnapshot(parsed.data.assistantId)
      const snapshot = this.repository.snapshot(this.vault.temporaryIds())
      const binding = snapshot.bindings.find((b) => b.assistantId === parsed.data.assistantId)
      const connection = snapshot.connections.find((c) => c.id === binding?.connectionId)
      const supported =
        !!connection && !!binding && toolsSupported(connection.baseUrl, binding.model)
      const ready = supported && connection!.enabled && connection!.hasCredential
      const names: ProviderCapabilities['evidence'][number]['capability'][] = [
        'text',
        'stream',
        'tools',
        'preserved-thinking',
        'json-object',
        'local-strict',
        'vendor-strict',
        'parallel',
        'usage'
      ]
      const liveRows = supported
        ? (this.store.database
            .prepare(
              'SELECT capability,observed_at FROM provider_capability_evidence WHERE endpoint_fingerprint=? AND model=? AND adapter_version=? AND mode=?'
            )
            .all(
              permissions.endpointFingerprint!,
              binding!.model.toLowerCase(),
              GLM_TOOL_ADAPTER,
              'standard-non-preserved'
            ) as unknown as { capability: string; observed_at: string }[])
        : []
      return capabilityResultSchema.parse({
        ok: true,
        data: {
          assistantId: parsed.data.assistantId,
          endpointFingerprint: permissions.endpointFingerprint,
          endpointDisplay: permissions.endpointDisplay,
          model: binding?.model ?? null,
          protocol: 'chat-completions-v1',
          adapterVersion: supported ? GLM_TOOL_ADAPTER : 'text-v1',
          mode: 'standard-non-preserved',
          toolsAvailable: ready,
          reason: ready
            ? '本轮可显式开启只读工具'
            : !supported
              ? '此实际端点与模型尚无内置工具适配'
              : !connection!.enabled
                ? '连接已停用'
                : '连接需要API密钥',
          evidence: names.map((capability) => ({
            capability,
            level: liveRows.some((r) => r.capability === capability)
              ? 'LIVE_VERIFIED'
              : supported &&
                  ['text', 'stream', 'tools', 'json-object', 'usage'].includes(capability)
                ? 'DOCUMENTED'
                : supported && capability === 'local-strict'
                  ? 'LOCAL_TESTED'
                  : 'UNVERIFIED',
            observedAt:
              liveRows.find((r) => r.capability === capability)?.observed_at ??
              (supported &&
              ['text', 'stream', 'tools', 'json-object', 'local-strict', 'usage'].includes(
                capability
              )
                ? '2026-09-06T00:00:00.000Z'
                : null),
            detail: liveRows.some((r) => r.capability === capability)
              ? '实际产品正常模式请求成功的端点证据；不等于所有能力均已验证'
              : capability === 'preserved-thinking'
                ? '本片未启用跨轮保留思考；工具reasoning真实端点未观测'
                : capability === 'local-strict'
                  ? '本地严格参数验证；不代表厂商strict'
                  : capability === 'parallel'
                    ? '工具串行执行，未声明并行支持'
                    : capability === 'usage'
                      ? '缺任一请求usage则整链总量未知；非账单'
                      : supported
                        ? '官方文档或本地实现证据；产品LIVE资格另行验证'
                        : '未验证'
          }))
        }
      })
    } catch (error) {
      return failureFrom(error)
    }
  }

  private permissionSnapshot(assistantId: string): HistoryPermissions {
    if (!this.repository.assistantExists(assistantId)) throw new ProviderDomainError('NOT_FOUND')
    const snapshot = this.repository.snapshot()
    const binding = snapshot.bindings.find((item) => item.assistantId === assistantId)
    const connection = snapshot.connections.find((item) => item.id === binding?.connectionId)
    const endpointDisplay = connection?.baseUrl ?? null
    const endpointFingerprint =
      endpointDisplay === null
        ? null
        : createHash('sha256')
            .update('chat-completions-v1|' + validateBaseUrl(endpointDisplay))
            .digest('hex')
    return {
      assistantId,
      connectionId: connection?.id ?? null,
      endpointFingerprint,
      endpointDisplay,
      ...this.historyPermissions.read(assistantId, endpointFingerprint)
    }
  }

  permissions(input: unknown): HistoryPermissionsResult {
    const parsed = historyPermissionsInputSchema.safeParse(input)
    if (!parsed.success) return failure('INVALID_INPUT')
    try {
      return historyPermissionsResultSchema.parse({
        ok: true,
        data: this.permissionSnapshot(parsed.data.assistantId)
      })
    } catch (error) {
      return failureFrom(error)
    }
  }

  setPermissions(input: unknown): HistoryPermissionsResult {
    const parsed = setHistoryPermissionsInputSchema.safeParse(input)
    if (!parsed.success) return failure('INVALID_INPUT')
    try {
      const value = parsed.data
      const current = this.permissionSnapshot(value.assistantId)
      if (
        current.connectionId !== value.connectionId ||
        current.endpointFingerprint !== value.endpointFingerprint
      )
        throw new ProviderDomainError('STALE_WRITE')
      if (current.endpointFingerprint === null && value.sendHistory)
        throw new ProviderDomainError('INVALID_INPUT')
      this.historyPermissions.update(
        value.assistantId,
        current.endpointFingerprint,
        value.expectedVersion,
        value.readHistory,
        value.sendHistory
      )
      for (const request of this.inflight.values()) {
        if (
          request.assistantId === value.assistantId &&
          request.historyUsed &&
          (!value.readHistory ||
            (!value.sendHistory && request.endpointFingerprint === current.endpointFingerprint))
        )
          request.controller.abort()
      }
      return historyPermissionsResultSchema.parse({
        ok: true,
        data: this.permissionSnapshot(value.assistantId)
      })
    } catch (error) {
      return failureFrom(error)
    }
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
      if (
        value.tools !== 'off' &&
        !toolsSupported(execution.connection.baseUrl, execution.binding.model)
      )
        return chatFailure('CONFIGURATION')
      if (
        value.tools === 'clock-and-history' &&
        (value.mode !== 'normal' || value.context.kind === 'none')
      )
        return chatFailure('PERMISSION_DENIED')
      const apiKey = this.vault.get(execution.connection.id)
      if (!apiKey) return chatFailure('CREDENTIAL_MISSING')
      let session = this.sessions.get(value.assistantId)
      let previous: ChatMessage[]
      if (value.mode === 'normal') {
        const permissions = this.permissionSnapshot(value.assistantId)
        const allowed = permissions.readHistory && permissions.sendHistory
        if (value.context.kind === 'selected' && !allowed)
          throw new ProviderDomainError('PERMISSION_DENIED')
        if (value.tools === 'clock-and-history' && !allowed)
          throw new ProviderDomainError('PERMISSION_DENIED')
        if (value.context.kind === 'selected')
          this.toolLedger.assertSelectedSources(value.assistantId, value.context.requestIds)
        previous =
          value.context.kind === 'none' || !allowed
            ? []
            : value.context.kind === 'selected'
              ? this.timeline.selectedContext(
                  value.assistantId,
                  value.context.requestIds,
                  text.length
                )
              : this.timeline.context(value.assistantId, text.length)
      } else {
        if (value.context.kind === 'selected') return chatFailure('INVALID_INPUT')
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
      const contextIds =
        value.mode === 'normal'
          ? previous.length
            ? this.timeline.contextRequestIds(
                value.assistantId,
                text.length,
                value.context.kind === 'selected' ? value.context.requestIds : undefined
              )
            : []
          : session!.messages
              .filter((message) => message.role === 'assistant' && message.status === 'completed')
              .map((message) => message.requestId)
      const contextFingerprint = createHash('sha256')
        .update('chat-completions-v1|' + execution.connection.baseUrl)
        .digest('hex')
      previous = (
        value.mode === 'normal' ? this.toolLedger : this.temporaryToolLedger
      ).expandContext(
        value.assistantId,
        previous,
        contextIds,
        contextFingerprint,
        execution.binding.model
      )
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
      if (value.mode === 'normal') {
        this.timeline.insert(value.assistantId, [user, response])
        if (previous.length > 0)
          this.toolLedger.addSources(value.assistantId, value.requestId, contextIds)
        if (previous.length > 0)
          this.toolLedger.inheritSources(
            value.assistantId,
            value.requestId,
            value.context.kind === 'selected' ? value.context.requestIds : undefined
          )
      } else {
        session!.messages.push(user, response)
        this.sessions.set(value.assistantId, session!)
      }
      controller = new AbortController()
      this.inflight.set(value.requestId, {
        assistantId: value.assistantId,
        connectionId: execution.connection.id,
        endpointFingerprint:
          value.mode === 'normal'
            ? this.permissionSnapshot(value.assistantId).endpointFingerprint
            : null,
        historyUsed:
          value.mode === 'normal' && (previous.length > 0 || value.tools === 'clock-and-history'),
        controller,
        mode: value.mode,
        response
      })
      const transportRequest: TransportRequest = {
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
      }
      const endpointFingerprint = createHash('sha256')
        .update('chat-completions-v1|' + execution.connection.baseUrl)
        .digest('hex')
      const assertCurrent = () => {
        if (this.closed || controller!.signal.aborted) throw new ProviderDomainError('CANCELLED')
        const current = this.repository
          .snapshot(this.vault.temporaryIds())
          .connections.find((c) => c.id === execution.connection.id)
        if (
          !current ||
          !current.enabled ||
          current.baseUrl !== execution.connection.baseUrl ||
          !this.vault.get(execution.connection.id)
        )
          throw new ProviderDomainError('PERMISSION_DENIED')
        const assistant = this.store.database
          .prepare('SELECT archived_at FROM assistants WHERE id=?')
          .get(value.assistantId) as { archived_at: string | null } | undefined
        if (!assistant || assistant.archived_at !== null)
          throw new ProviderDomainError('ASSISTANT_ARCHIVED')
        if (
          value.mode === 'normal' &&
          (previous.length > 0 || value.tools === 'clock-and-history')
        ) {
          const permissions = this.historyPermissions.read(value.assistantId, endpointFingerprint)
          if (!permissions.readHistory || !permissions.sendHistory)
            throw new ProviderDomainError('PERMISSION_DENIED')
        }
      }
      const result =
        value.tools === 'off'
          ? await this.transport(transportRequest)
          : await executeToolChat({
              request: transportRequest,
              scope: value.tools,
              transport: this.transport,
              ledger: value.mode === 'normal' ? this.toolLedger : this.temporaryToolLedger,
              segment: {
                id: randomUUID(),
                assistantId: value.assistantId,
                requestId: value.requestId,
                endpointFingerprint,
                model: execution.binding.model,
                adapterVersion: GLM_TOOL_ADAPTER,
                messages: transportRequest.messages,
                createdAt: now
              },
              assertCurrent,
              clock: this.toolOptions.clock ?? (() => new Date()),
              history: (query, limit) => {
                assertCurrent()
                if (
                  value.mode !== 'normal' ||
                  value.tools !== 'clock-and-history' ||
                  value.context.kind === 'none'
                )
                  throw new ProviderDomainError('PERMISSION_DENIED')
                const citations = this.timeline.searchHistory(
                  value.assistantId,
                  query,
                  limit,
                  value.context.kind === 'selected' ? value.context.requestIds : undefined
                )
                assertCurrent()
                return citations
              },
              emit: (operation) => {
                if (!this.closed)
                  emit({
                    type: 'operation',
                    requestId: value.requestId,
                    assistantId: value.assistantId,
                    operation
                  })
              }
            })
      if (this.closed) return chatFailure('CANCELLED')
      if (deltaLimitExceeded) {
        finish('failed', response.content)
        emit({ type: 'failed', requestId: value.requestId, assistantId: value.assistantId })
        return chatFailure('LIMIT')
      }
      if (controller.signal.aborted) {
        finish('cancelled', response.content)
        emit({ type: 'cancelled', requestId: value.requestId, assistantId: value.assistantId })
        return providerChatResultSchema.parse({
          ok: true,
          data: {
            requestId: value.requestId,
            assistantId: value.assistantId,
            status: 'cancelled',
            text: response.content,
            usage: null
          }
        })
      }
      const invalidResult = transportResultError(result)
      if (invalidResult) {
        finish('failed', response.content)
        emit({ type: 'failed', requestId: value.requestId, assistantId: value.assistantId })
        return chatFailure(invalidResult)
      }
      if (
        value.tools !== 'off' &&
        value.mode === 'normal' &&
        this.transport === chatCompletions &&
        result.status === 'completed'
      ) {
        assertCurrent()
        const capabilities = [
          'text',
          ...(value.stream ? ['stream'] : []),
          ...(this.toolLedger
            .read(value.assistantId, value.requestId)
            .some((o) => o.state === 'SUCCEEDED')
            ? ['tools']
            : []),
          ...(result.usage ? ['usage'] : [])
        ]
        this.store.transaction(() => {
          const statement = this.store.database.prepare(
            'INSERT INTO provider_capability_evidence VALUES(?,?,?,?,?,?) ON CONFLICT(endpoint_fingerprint,model,adapter_version,mode,capability) DO UPDATE SET observed_at=excluded.observed_at'
          )
          for (const capability of capabilities)
            statement.run(
              endpointFingerprint,
              execution.binding.model.toLowerCase(),
              GLM_TOOL_ADAPTER,
              'standard-non-preserved',
              capability,
              new Date().toISOString()
            )
        })
      }
      const status = result.status
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
          if (deltaLimitExceeded) {
            finish('failed', response.content)
            emit({ type: 'failed', requestId: value.requestId, assistantId: value.assistantId })
            return chatFailure('LIMIT')
          }
          if (controller?.signal.aborted) {
            finish('cancelled', response.content)
            emit({ type: 'cancelled', requestId: value.requestId, assistantId: value.assistantId })
            return providerChatResultSchema.parse({
              ok: true,
              data: {
                requestId: value.requestId,
                assistantId: value.assistantId,
                status: 'cancelled',
                text: response.content,
                usage: null
              }
            })
          }
          finish('failed', response.content)
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
