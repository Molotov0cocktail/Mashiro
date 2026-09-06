import { randomUUID, createHash } from 'node:crypto'
import { ItemService, ItemError } from '../item/item-service.js'
import { ItemToolSession } from '../item/item-tool-session.js'
import { RetentionService } from '../retention/retention-service.js'
import { retentionToolSchema } from './tool-protocol.js'
import { dirname, join } from 'node:path'
import { MemoryService, MemoryError, MemoryMutationError } from '../memory/memory-service.js'
import {
  memoryCreateToolSchema,
  memoryCorrectToolSchema,
  memoryRemovalSchema,
  type MemorySource,
  type MemoryReceipt
} from '../../shared/memory-contract.js'
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
    PERMISSION_DENIED: ['Current data, source, business or recipient permission is denied', false],
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
  readonly retention: RetentionService
  readonly memory: MemoryService
  readonly items: ItemService
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
    this.memory = new MemoryService(
      store,
      join(dirname(credentialDirectory), 'memory'),
      (assistantId) => {
        const p = this.permissionSnapshot(assistantId)
        return { fingerprint: p.endpointFingerprint, display: p.endpointDisplay }
      },
      (exceptRequestId) => {
        for (const [id, entry] of this.inflight)
          if (id !== exceptRequestId && entry.mode === 'normal') entry.controller.abort()
      }
    )
    this.items = new ItemService(
      store,
      (assistantId) => {
        const p = this.permissionSnapshot(assistantId)
        return { fingerprint: p.endpointFingerprint, display: p.endpointDisplay }
      },
      (source, assistantId, fingerprint, visited) =>
        this.memory.assertSource(source, assistantId, fingerprint, [], visited),
      (exceptRequestId) => {
        for (const [id, entry] of this.inflight)
          if (id !== exceptRequestId && entry.mode === 'normal') entry.controller.abort()
      }
    )
    this.memory.setDomainSourceCheck((source, assistantId, fingerprint, visited) =>
      this.items.assertSource(source, assistantId, fingerprint, visited)
    )
    this.retention = new RetentionService(
      store,
      join(dirname(credentialDirectory), 'memory'),
      this.memory,
      () => {
        for (const entry of this.inflight.values()) {
          entry.response.content = ''
          entry.controller.abort()
        }
        for (const id of this.sessions.keys()) this.temporaryToolLedger.clear(id)
        this.sessions.clear()
      }
    )
  }

  private governanceGeneration(): number {
    return Number(
      this.store.database.prepare('SELECT generation FROM retention_state WHERE singleton=1').get()!
        .generation
    )
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
          operations: ledger
            .read(value.assistantId, value.requestId, includeHistory)
            .map((operation) => {
              if (value.mode !== 'normal' || !operation.memoryReceipt) return operation
              return {
                ...operation,
                memoryReceipt:
                  this.memory.businessReceipt(
                    value.assistantId,
                    operation.memoryReceipt.operationId
                  ) ?? operation.memoryReceipt
              }
            })
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
            ? '本轮可显式开启工具；记忆写入另受业务权限限制'
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
    const generation = this.governanceGeneration()
    const currentGeneration = () => !this.closed && this.governanceGeneration() === generation
    const finish = (status: TimelineMessage['status'], content: string): void => {
      if (!response || !currentGeneration()) {
        if (response) response.content = ''
        return
      }
      response.status = status
      response.content = content.slice(0, 120000)
      if (value.mode === 'normal') this.timeline.finish(value.assistantId, response)
    }
    try {
      const text = normalize(value.text, 16000)
      // Authority and actual recipient are re-resolved in trusted code on every send.
      const execution = this.repository.execution(value.assistantId)
      const profileMessage: ChatMessage = {
        role: 'system',
        content:
          '以下为用户配置的人设与称呼，只定义身份、语气和表达；不代表任何历史、记忆、事项、工具或外发权限。配置数据：' +
          JSON.stringify({
            assistantId: execution.assistant.id,
            displayName: execution.assistant.displayName,
            persona: execution.assistant.persona,
            version: execution.assistant.version
          })
      }
      const inputLength = text.length + profileMessage.content.length
      if (
        value.tools !== 'off' &&
        !toolsSupported(execution.connection.baseUrl, execution.binding.model)
      )
        return chatFailure('CONFIGURATION')
      if (
        ['clock-and-history', 'clock-history-and-memory'].includes(value.tools) &&
        (value.mode !== 'normal' || value.context.kind === 'none')
      )
        return chatFailure('PERMISSION_DENIED')
      if (
        value.mode === 'temporary' &&
        ['clock-and-memory', 'clock-history-and-memory', 'items', 'items-memory'].includes(
          value.tools
        )
      )
        return chatFailure('PERMISSION_DENIED')
      if (
        value.itemContext &&
        (value.mode !== 'normal' || !['items', 'items-memory'].includes(value.tools))
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
        if (['clock-and-history', 'clock-history-and-memory'].includes(value.tools) && !allowed)
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
                  inputLength
                )
              : this.timeline.context(value.assistantId, inputLength)
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
          previous.reduce((total, message) => total + message.content.length, inputLength) > 120000
        )
          return chatFailure('LIMIT')
      }
      let contextIds =
        value.mode === 'normal'
          ? previous.length
            ? this.timeline.contextRequestIds(
                value.assistantId,
                inputLength,
                value.context.kind === 'selected' ? value.context.requestIds : undefined
              )
            : []
          : session!.messages
              .filter((message) => message.role === 'assistant' && message.status === 'completed')
              .map((message) => message.requestId)
      const contextFingerprint = createHash('sha256')
        .update('chat-completions-v1|' + execution.connection.baseUrl)
        .digest('hex')
      if (value.mode === 'normal') {
        const acceptedIndices = new Set<number>()
        for (const [index, id] of contextIds.entries()) {
          try {
            this.memory.assertRound(value.assistantId, id, contextFingerprint)
            acceptedIndices.add(index)
          } catch (error) {
            if (value.context.kind !== 'recent' || !(error instanceof MemoryError)) throw error
          }
        }
        previous = previous.filter((_message, index) => acceptedIndices.has(Math.floor(index / 2)))
        contextIds = contextIds.filter((_id, index) => acceptedIndices.has(index))
      }
      previous = (
        value.mode === 'normal' ? this.toolLedger : this.temporaryToolLedger
      ).expandContext(
        value.assistantId,
        previous,
        contextIds,
        contextFingerprint,
        execution.binding.model
      )
      if (
        previous.reduce((total, message) => total + (message.content?.length ?? 0), inputLength) >
        120000
      )
        return chatFailure('LIMIT')
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
        if (previous.length > 0) {
          this.memory.addDependencies(
            'round',
            value.requestId,
            1,
            contextIds.map((id) => ({
              type: 'round',
              id,
              assistantId: value.assistantId,
              version: 1
            }))
          )
          this.toolLedger.addSources(value.assistantId, value.requestId, contextIds)
        }
        if (previous.length > 0)
          this.toolLedger.inheritSources(value.assistantId, value.requestId, contextIds)
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
          value.mode === 'normal' &&
          (previous.length > 0 ||
            ['clock-and-history', 'clock-history-and-memory'].includes(value.tools)),
        controller,
        mode: value.mode,
        response
      })
      const transportRequest: TransportRequest = {
        baseUrl: execution.connection.baseUrl,
        apiKey,
        model: execution.binding.model,
        messages: [profileMessage, ...previous, { role: 'user', content: text }],
        stream: value.stream,
        signal: controller.signal,
        onDelta: value.stream
          ? (delta) => {
              if (
                !currentGeneration() ||
                controller!.signal.aborted ||
                typeof delta !== 'string' ||
                !delta
              )
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
      const providedMemory: MemorySource[] = []
      let itemSession: ItemToolSession | undefined
      const correctedInThisRound: MemorySource[] = []
      const providedHistory = new Set<string>()
      const assertCurrent = () => {
        if (!currentGeneration() || controller!.signal.aborted)
          throw new ProviderDomainError('CANCELLED')
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
          (previous.length > 0 ||
            ['clock-and-history', 'clock-history-and-memory'].includes(value.tools))
        ) {
          const permissions = this.historyPermissions.read(value.assistantId, endpointFingerprint)
          if (!permissions.readHistory || !permissions.sendHistory)
            throw new ProviderDomainError('PERMISSION_DENIED')
        }
        itemSession?.assertSources()
        if (value.mode === 'normal') {
          for (const id of new Set([...contextIds, ...providedHistory]))
            this.memory.assertRound(
              value.assistantId,
              id,
              endpointFingerprint,
              correctedInThisRound
            )
          for (const source of providedMemory)
            this.memory.assertSource(
              source,
              value.assistantId,
              endpointFingerprint,
              correctedInThisRound
            )
        }
      }
      assertCurrent()
      let automatic: import('./tool-protocol.js').ToolCall | undefined
      if (value.mode === 'normal' && ['items', 'items-memory'].includes(value.tools)) {
        itemSession = new ItemToolSession(
          this.items,
          this.memory,
          this.toolLedger,
          {
            assistantId: value.assistantId,
            requestId: value.requestId,
            fingerprint: endpointFingerprint,
            assertCurrent,
            sources: [
              {
                type: 'user-round',
                id: value.requestId,
                assistantId: value.assistantId,
                version: 1
              },
              ...providedMemory,
              ...contextIds.map((id) => ({
                type: 'round' as const,
                id,
                assistantId: value.assistantId,
                version: 1
              }))
            ]
          },
          text,
          value.itemContext
        )
        const prepared = itemSession.prepare()
        automatic = prepared.automatic
        if (prepared.context)
          transportRequest.messages.unshift({ role: 'system', content: prepared.context })
      }
      if (
        transportRequest.messages.reduce(
          (total, message) => total + (message.content?.length ?? 0),
          0
        ) > 120000
      )
        throw new ProviderDomainError('LIMIT')
      const itemTransport: ChatTransport = async (request) => {
        if (automatic) {
          const call = automatic
          automatic = undefined
          return {
            text: '',
            status: 'completed',
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            finishReason: 'tool_calls',
            toolCalls: [call]
          }
        }
        return this.transport(request)
      }
      const result =
        value.tools === 'off'
          ? await this.transport(transportRequest)
          : await executeToolChat({
              request: transportRequest,
              scope: value.tools,
              transport: itemTransport,
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
                  !['clock-and-history', 'clock-history-and-memory'].includes(value.tools) ||
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
                for (const citation of citations.matches)
                  this.memory.assertRound(
                    value.assistantId,
                    citation.requestId,
                    endpointFingerprint
                  )
                for (const citation of citations.matches) providedHistory.add(citation.requestId)
                this.memory.addDependencies(
                  'round',
                  value.requestId,
                  1,
                  citations.matches.map((citation) => ({
                    type: 'round',
                    id: citation.requestId,
                    assistantId: value.assistantId,
                    version: 1
                  }))
                )
                return citations
              },
              memory: async (call, operation) => {
                assertCurrent()
                if (value.mode !== 'normal') throw new ProviderDomainError('PERMISSION_DENIED')
                if (
                  [
                    'search_items',
                    'apply_item_intent',
                    'propose_item',
                    'revise_item_proposal',
                    'prepare_item_update'
                  ].includes(call.function.name)
                ) {
                  if (!itemSession) throw new ProviderDomainError('PERMISSION_DENIED')
                  try {
                    return itemSession.execute(call, operation, [
                      ...providedMemory,
                      ...[...providedHistory].map((id) => ({
                        type: 'round' as const,
                        id,
                        assistantId: value.assistantId,
                        version: 1
                      }))
                    ])
                  } catch (error) {
                    if (error instanceof ItemError && error.code !== 'STORAGE_UNAVAILABLE') {
                      const rejected = {
                        ...operation,
                        state: 'CONFIRMED_NOT_APPLIED' as const,
                        summary: '当前参数未提交，已核查目标、版本或权限不符',
                        updatedAt: new Date().toISOString()
                      }
                      const body = JSON.stringify({
                        state: 'CONFIRMED_NOT_APPLIED',
                        error: {
                          code: error.code,
                          message:
                            '当前参数未提交。parentId和relatedIds只能使用search_items返回的正式事项ID，用户文本中的编号不是事项ID；evidence须逐字引用完整原文分句，可连续跨分句。请修正参数后再调用，不能声称已建立。'
                        }
                      })
                      this.toolLedger.update(rejected, body)
                      Object.assign(operation, rejected)
                      return { body, summary: rejected.summary }
                    }
                    throw error
                  }
                }
                const args = JSON.parse(call.function.arguments)
                if (call.function.name === 'request_retention_cleanup') {
                  const intent = {
                    ...retentionToolSchema.parse(args),
                    protocolVersion: 1 as const,
                    assistantId: value.assistantId
                  }
                  const scopes =
                    intent.target.type === 'memories'
                      ? intent.target.objects.map((object) => {
                          const inspected = this.memory.inspect({
                            protocolVersion: 1,
                            assistantId: value.assistantId,
                            id: object.id
                          })
                          if (!inspected.ok) throw new ProviderDomainError('PERMISSION_DENIED')
                          return inspected.data.record.scope
                        })
                      : ['assistant' as const]
                  if (
                    scopes.some(
                      (scope) =>
                        !this.memory.permissionState(value.assistantId, scope, endpointFingerprint)
                          .write
                    )
                  )
                    throw new ProviderDomainError('PERMISSION_DENIED')
                  const preview = await this.retention.preview(intent)
                  assertCurrent()
                  if (!preview.ok) throw new ProviderDomainError('PERMISSION_DENIED')
                  operation.retentionPreview = {
                    ...preview.data,
                    memories: preview.data.memories.map((memory) => ({ ...memory, title: null })),
                    rounds: preview.data.rounds.map((round) => ({ ...round, summary: null }))
                  }
                  operation.retentionIntent = intent
                  return {
                    body: JSON.stringify({
                      previewId: preview.data.id,
                      memoryCount: preview.data.memoryIds.length,
                      roundCount: preview.data.requestIds.length,
                      blockers: preview.data.blockers,
                      state: 'PENDING_LOCAL_CONFIRMATION'
                    }),
                    summary: '治理预览已准备，尚未清理；需用户在本地打开并确认'
                  }
                }
                if (call.function.name === 'search_memory') {
                  const records = this.memory.search(
                    {
                      assistantId: value.assistantId,
                      requestId: value.requestId,
                      fingerprint: endpointFingerprint,
                      assertCurrent,
                      sources: []
                    },
                    args.query,
                    args.limit
                  )
                  providedMemory.push(
                    ...records.map((record) => ({
                      type: 'memory' as const,
                      id: record.id,
                      assistantId: record.ownerAssistantId,
                      version: record.objectVersion
                    }))
                  )
                  return {
                    body: JSON.stringify({ records }),
                    summary: '已提供 ' + records.length + ' 条获准记忆（不代表模型实际使用）'
                  }
                }
                const mutation =
                  call.function.name === 'write_memory'
                    ? {
                        ...memoryCreateToolSchema.parse(args),
                        action: 'remember' as const,
                        targetId: null,
                        expectedVersion: null
                      }
                    : call.function.name === 'correct_memory'
                      ? { ...memoryCorrectToolSchema.parse(args), action: 'correct' as const }
                      : memoryRemovalSchema.parse(args)
                const rawSource: MemorySource = {
                  type: 'user-round',
                  id: value.requestId,
                  assistantId: value.assistantId,
                  version: 1
                }
                if (
                  'nature' in mutation &&
                  mutation.nature === 'user-statement' &&
                  !text.includes(mutation.markdown)
                )
                  throw new ProviderDomainError('PROTOCOL')
                const sources: MemorySource[] =
                  'nature' in mutation && mutation.nature === 'user-statement'
                    ? [rawSource]
                    : [
                        rawSource,
                        ...providedMemory,
                        ...(itemSession?.provided ?? []),
                        ...[...new Set([...contextIds, ...providedHistory])].map((id) => ({
                          type: 'round' as const,
                          id,
                          assistantId: value.assistantId,
                          version: 1
                        }))
                      ]
                let receipt: MemoryReceipt
                try {
                  receipt = this.memory.toolMutation(
                    {
                      assistantId: value.assistantId,
                      requestId: value.requestId,
                      fingerprint: endpointFingerprint,
                      assertCurrent,
                      sources,
                      toolOperationId: operation.operationId,
                      commitReceipt: (receipt) => {
                        this.toolLedger.update(
                          {
                            ...operation,
                            state: 'SUCCEEDED',
                            memoryReceipt: receipt,
                            summary: receipt.summary.slice(0, 200),
                            updatedAt: new Date().toISOString()
                          },
                          JSON.stringify(receipt),
                          true
                        )
                      }
                    },
                    mutation
                  )
                } catch (error) {
                  if (error instanceof MemoryMutationError && error.provenNotApplied) {
                    const rejected = {
                      ...operation,
                      state: 'CONFIRMED_NOT_APPLIED' as const,
                      summary: '已核查业务未提交，请检查目标、版本或权限',
                      updatedAt: new Date().toISOString()
                    }
                    this.toolLedger.update(rejected)
                    Object.assign(operation, rejected)
                  }
                  throw error
                }
                if (mutation.action === 'correct' && receipt.state === 'SUCCEEDED')
                  correctedInThisRound.push({
                    type: 'memory',
                    id: receipt.objectId!,
                    assistantId: value.assistantId,
                    version: receipt.objectVersion!
                  })
                operation.memoryReceipt = receipt
                const committed = this.toolLedger
                  .read(value.assistantId, value.requestId)
                  .find((record) => record.operationId === operation.operationId)
                if (committed?.state === 'SUCCEEDED') Object.assign(operation, committed)
                return { body: JSON.stringify(receipt), summary: receipt.summary.slice(0, 200) }
              },
              emit: (operation) => {
                if (currentGeneration())
                  emit({
                    type: 'operation',
                    requestId: value.requestId,
                    assistantId: value.assistantId,
                    operation
                  })
              }
            })
      if (!currentGeneration()) {
        response.content = ''
        return chatFailure('CANCELLED')
      }
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
      if (!currentGeneration()) {
        if (response) response.content = ''
        return chatFailure('CANCELLED')
      }
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
    this.retention.close()
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
  if (error instanceof MemoryError || error instanceof ItemError) {
    if (error.code === 'CONFLICT') return failure('LIMIT')
    if (error.code === 'INTEGRITY') return failure('STORAGE_UNAVAILABLE')
    return failure(error.code)
  }
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
