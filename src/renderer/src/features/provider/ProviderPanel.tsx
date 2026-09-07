import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AssistantSnapshot } from '../../../../shared/assistant-contract'
import type { ItemApi } from '../../../../shared/item-contract'
import type { MemoryApi } from '../../../../shared/memory-contract'
import type { ReminderApi } from '../../../../shared/reminder-contract'
import type {
  RetentionChanged,
  RetentionIntent,
  RetentionPreview
} from '../../../../shared/retention-contract'
import type {
  ContextIntent,
  ProviderApi,
  ProviderResult,
  ProviderSnapshot,
  StartChatInput
} from '../../../../shared/provider-contract'
import type {
  ChatMode,
  TimelineApi,
  TimelineMessage,
  TimelineSnapshot
} from '../../../../shared/timeline-contract'
import type {
  HistoryCitation,
  ProviderCapabilities,
  ToolOperation,
  ToolScope
} from '../../../../shared/tool-contract'
import { AssistantAvatar, avatarLabel } from '../assistants/AssistantAvatar'
import { HistoryContextPanel } from './HistoryContextPanel'
import { RoundMemoryPanel } from './RoundMemoryPanel'
import { ToolExecutionPanel } from './ToolExecutionPanel'

const protocolVersion = 1 as const
const errorMessages: Record<string, string> = {
  INVALID_INPUT: '输入不符合要求，请检查后重试',
  PERMISSION_DENIED: '当前没有读取并向实际接收方发送历史的权限',
  NOT_FOUND: '连接、助手或时间线不存在',
  STALE_WRITE: '设置已变化，请刷新后重试',
  ASSISTANT_ARCHIVED: '已归档助手不能发起交流',
  CONNECTION_DISABLED: '当前连接已停用',
  CREDENTIAL_MISSING: '请先为连接设置 API Key',
  CREDENTIAL_PROTECTION_UNAVAILABLE: 'Windows 凭据保护不可用，无法持久保存 Key',
  REQUEST_IN_PROGRESS: '当前助手仍在生成，请等待完成或先取消',
  AUTHENTICATION: 'Provider 认证失败，请检查 Key',
  QUOTA: 'Provider 额度不足或不可用',
  CONFIGURATION:
    '连接地址或模型配置无效，请检查连接与模型；若引用了旧工具轮次，可选不附带历史后重新发送',
  TEMPORARY: 'Provider 暂时不可用，请稍后手动重试',
  PROTOCOL: 'Provider 返回不完整或格式异常，已保留部分输出',
  TIMEOUT: '请求超时，已保留部分输出',
  LIMIT: '当前上下文或响应达到安全上限，请缩短输入后重试',
  CANCELLED: '请求已取消',
  STORAGE_UNAVAILABLE: '本地时间线或 Provider 设置暂时无法读取',
  INTERNAL_ERROR: '服务发生内部错误'
}
type TimelineMap = Record<string, TimelineMessage[]>
type BooleanMap = Record<string, boolean>
type TextMap = Record<string, string>
type ToolScopeMap = Record<string, ToolScope>
type OperationMap = Record<string, ToolOperation[]>
type CapabilityMap = Record<string, ProviderCapabilities | undefined>
type HistoryFocusMap = Record<string, { requestId: string; nonce: number }>
type ContextIntentMap = Record<string, ContextIntent>
type RequestSelectionMap = Record<string, string[]>
type ItemContext = NonNullable<StartChatInput['itemContext']>
type ItemContextMap = Record<string, ItemContext | undefined>
type ActiveRequest = {
  requestId: string
  mode: ChatMode
  observedAcceptance: boolean
  observedTerminal: boolean
  retentionEpoch: number
}
type TimelineObservation =
  { kind: 'snapshot'; data: TimelineSnapshot } | { kind: 'unavailable' | 'superseded' }
type ActiveRequestMap = Record<string, ActiveRequest>
type ProtectedRequestMap = Record<string, Set<string>>
type RejectedDraft = { requestId: string; content: string }
type RejectedDraftMap = Record<string, RejectedDraft[]>
type StableFailure = { error: { code: string; correlationId: string } }

function timelineKey(assistantId: string, mode: ChatMode): string {
  return assistantId + ':' + mode
}

function errorText(result: StableFailure): string {
  return (
    (errorMessages[result.error.code] ?? '操作失败') + ' · 关联编号 ' + result.error.correlationId
  )
}

function statusText(status: TimelineMessage['status']): string {
  switch (status) {
    case 'pending':
      return '生成中'
    case 'completed':
      return '完成'
    case 'failed':
      return '失败，已保留现有正文'
    case 'cancelled':
      return '已取消，已保留现有正文'
    case 'interrupted':
      return '响应中断，已保留部分输出且不会自动重发'
  }
}

export function ProviderPanel({
  assistantSnapshot,
  api,
  timelineApi,
  memoryApi,
  itemApi,
  reminderApi,
  itemTarget,
  historyTarget,
  onMemoryChanged,
  onItemChanged,
  onReminderChanged,
  onOpenItems,
  onLocateMemorySource,
  onOpenMemory,
  memoryEvidenceRefreshKey,
  retentionChange,
  onPrepareRetention,
  configurationFocus,
  chapterContextTarget
}: {
  assistantSnapshot: AssistantSnapshot | null
  api: ProviderApi
  timelineApi: TimelineApi
  memoryApi?: MemoryApi
  itemApi?: ItemApi
  reminderApi?: ReminderApi
  itemTarget?: {
    assistantId: string
    type: 'item' | 'proposal'
    id: string
    expectedVersion: number
    nonce: number
  } | null
  historyTarget?: { assistantId: string; requestId: string; nonce: number } | null
  onMemoryChanged?: () => void
  onItemChanged?: () => void
  onReminderChanged?: () => void
  onOpenItems?: (recovery?: {
    assistantId: string
    commandId: string
    confirmationAction?: 'replace-content'
  }) => void
  onLocateMemorySource?: (source: { assistantId: string; id: string }) => Promise<void>
  onOpenMemory?: (target: { assistantId: string; id: string }) => void
  memoryEvidenceRefreshKey?: number
  retentionChange?: RetentionChanged | null
  onPrepareRetention?: (
    assistantId: string,
    target: RetentionIntent['target'],
    intent?: RetentionPreview['intent']
  ) => void
  configurationFocus?: {
    assistantId: string
    target: 'provider' | 'history'
    nonce: number
  } | null
  chapterContextTarget?: {
    assistantId: string
    chapters: Array<{ id: string; expectedVersion: number }>
    nonce: number
  } | null
}): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<ProviderSnapshot | null>(null)
  const [selectedId, setSelectedId] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [baseUrl, setBaseUrl] = useState('https://open.bigmodel.cn/api/paas/v4')
  const [enabled, setEnabled] = useState(true)
  const [apiKey, setApiKey] = useState('')
  const [persistent, setPersistent] = useState(false)
  const [modelDrafts, setModelDrafts] = useState<Record<string, string>>({})
  const [modeByAssistant, setModeByAssistant] = useState<Record<string, ChatMode>>({})
  const [textDrafts, setTextDrafts] = useState<TextMap>({})
  const [contextByAssistant, setContextByAssistant] = useState<ContextIntentMap>({})
  const [itemContexts, setItemContexts] = useState<ItemContextMap>({})
  const [dismissedItemTargetNonce, setDismissedItemTargetNonce] = useState<number | null>(null)
  const previousItemTarget = useRef(itemTarget)
  const [selectedRequestsByAssistant, setSelectedRequestsByAssistant] =
    useState<RequestSelectionMap>({})
  const [cleanupAnchorsByAssistant, setCleanupAnchorsByAssistant] = useState<RequestSelectionMap>(
    {}
  )
  const [stream, setStream] = useState(true)
  const [timelines, setTimelines] = useState<TimelineMap>({})
  const [hasMore, setHasMore] = useState<BooleanMap>({})
  const [loading, setLoading] = useState<BooleanMap>({})
  const [saving, setSaving] = useState<BooleanMap>({})
  const [activeRequests, setActiveRequests] = useState<ActiveRequestMap>({})
  const activeRequestsRef = useRef<ActiveRequestMap>({})
  const protectedRequestsRef = useRef<ProtectedRequestMap>({})
  const readVersions = useRef<Record<string, number>>({})
  const toolReadVersions = useRef<Record<string, number>>({})
  const capabilityReadVersions = useRef<Record<string, number>>({})
  const requestRoutesRef = useRef<
    Record<
      string,
      { assistantId: string; mode: ChatMode; citationEpoch: number; retentionEpoch: number }
    >
  >({})
  const citationEpochs = useRef<Record<string, number>>({})
  const retentionEpochs = useRef<Record<string, number>>({})
  const lastRetentionEpoch = useRef(-1)
  const operationSequence = useRef(0)
  const operationEvents = useRef<Record<string, Record<string, number>>>({})
  const autoOperationReadVersions = useRef<Record<string, number>>({})
  const notifiedMemoryOperations = useRef(new Set<string>())
  const notifiedItemOperations = useRef(new Set<string>())
  const notifiedItemRequests = useRef(new Set<string>())
  const [rejectedDrafts, setRejectedDrafts] = useState<RejectedDraftMap>({})
  const [settingsError, setSettingsError] = useState<string | null>(null)
  const [timelineErrors, setTimelineErrors] = useState<TextMap>({})
  const [notices, setNotices] = useState<TextMap>({})
  const [uncertainRequests, setUncertainRequests] = useState<TextMap>({})
  const [toolScopes, setToolScopes] = useState<ToolScopeMap>({})
  const [operations, setOperations] = useState<OperationMap>({})
  const [operationLoading, setOperationLoading] = useState<BooleanMap>({})
  const [operationErrors, setOperationErrors] = useState<TextMap>({})
  const [capabilities, setCapabilities] = useState<CapabilityMap>({})
  const [capabilityLoading, setCapabilityLoading] = useState<BooleanMap>({})
  const [capabilityErrors, setCapabilityErrors] = useState<TextMap>({})
  const [historyFocus, setHistoryFocus] = useState<HistoryFocusMap>({})
  const [roundMemoryRefresh, setRoundMemoryRefresh] = useState(0)

  const currentAssistantId = assistantSnapshot?.currentAssistantId ?? ''
  const currentAssistant = assistantSnapshot?.assistants.find(
    (item) => item.id === currentAssistantId
  )
  const mode = modeByAssistant[currentAssistantId] ?? 'normal'
  const configurationFocusAssistantId = configurationFocus?.assistantId
  const configurationFocusTarget = configurationFocus?.target
  const configurationFocusNonce = configurationFocus?.nonce
  const handledConfigurationFocus = useRef('')
  const handledChapterContext = useRef('')

  useEffect(() => {
    if (
      !configurationFocusAssistantId ||
      configurationFocusAssistantId !== currentAssistantId ||
      !configurationFocusTarget ||
      configurationFocusNonce == null
    ) {
      return
    }
    const focusKey = `${configurationFocusAssistantId}:${configurationFocusNonce}`
    if (handledConfigurationFocus.current === focusKey) return
    handledConfigurationFocus.current = focusKey
    let focusTimer: number | undefined
    const focusTarget = (): void => {
      const targetId =
        configurationFocusTarget === 'provider'
          ? 'provider-connection-settings'
          : 'history-permissions'
      const element = document.getElementById(targetId)
      if (!element) return
      if (element instanceof HTMLDetailsElement) element.open = true
      element.focus()
      element.scrollIntoView?.({ block: 'start' })
    }
    const timer = window.setTimeout(() => {
      if (configurationFocusTarget === 'history') {
        setModeByAssistant((values) => ({ ...values, [currentAssistantId]: 'normal' }))
        focusTimer = window.setTimeout(focusTarget, 0)
      } else {
        focusTarget()
      }
    }, 0)
    return () => {
      window.clearTimeout(timer)
      if (focusTimer !== undefined) window.clearTimeout(focusTimer)
    }
  }, [
    configurationFocusAssistantId,
    configurationFocusNonce,
    configurationFocusTarget,
    currentAssistantId
  ])

  useEffect(() => {
    if (
      !chapterContextTarget ||
      chapterContextTarget.assistantId !== currentAssistantId ||
      chapterContextTarget.chapters.length === 0
    ) {
      return
    }
    const key = `${chapterContextTarget.assistantId}:${chapterContextTarget.nonce}`
    if (handledChapterContext.current === key) return
    handledChapterContext.current = key
    setModeByAssistant((values) => ({ ...values, [currentAssistantId]: 'normal' }))
    setContextByAssistant((values) => ({
      ...values,
      [currentAssistantId]: { kind: 'chapters', chapters: chapterContextTarget.chapters }
    }))
    setNotices((values) => ({
      ...values,
      [timelineKey(currentAssistantId, 'normal')]:
        `已选择 ${chapterContextTarget.chapters.length} 个章节作为下一次正常对话上下文。`
    }))
  }, [chapterContextTarget, currentAssistantId])

  const currentKey = timelineKey(currentAssistantId, mode)
  const selected = snapshot?.connections.find((item) => item.id === selectedId)
  const binding = snapshot?.bindings.find((item) => item.assistantId === currentAssistantId)
  const executionConnection = snapshot?.connections.find(
    (item) => item.id === binding?.connectionId
  )
  const model = modelDrafts[currentAssistantId] ?? binding?.model ?? 'GLM-5.3-FLASH'
  const text = textDrafts[currentKey] ?? ''
  const contextIntent = contextByAssistant[currentAssistantId] ?? ({ kind: 'recent' } as const)
  const itemContext =
    itemContexts[currentAssistantId] ??
    (itemTarget?.assistantId === currentAssistantId && itemTarget.nonce !== dismissedItemTargetNonce
      ? {
          type: itemTarget.type,
          id: itemTarget.id,
          expectedVersion: itemTarget.expectedVersion
        }
      : undefined)
  const selectedRequestIds = selectedRequestsByAssistant[currentAssistantId] ?? []
  const cleanupAnchors = cleanupAnchorsByAssistant[currentAssistantId] ?? []
  const historyBindingKey =
    (binding?.connectionId ?? '') +
    ':' +
    (executionConnection?.baseUrl ?? '') +
    ':' +
    (binding?.model ?? '') +
    ':' +
    (binding?.version ?? '') +
    ':' +
    (executionConnection?.version ?? '') +
    ':' +
    String(executionConnection?.enabled ?? '')
  const transcript = timelines[currentKey] ?? []
  const currentRejectedDrafts = rejectedDrafts[currentKey] ?? []
  const activeRequest = activeRequests[currentAssistantId]
  const toolScope = toolScopes[currentKey] ?? 'off'
  const currentOperations = operations[currentKey] ?? []
  const currentCapability = capabilities[currentAssistantId]

  const invalidateRead = useCallback((key: string): void => {
    readVersions.current[key] = (readVersions.current[key] ?? 0) + 1
  }, [])

  const clearActiveRequest = useCallback((assistantId: string, requestId: string): void => {
    if (activeRequestsRef.current[assistantId]?.requestId !== requestId) return
    const next = { ...activeRequestsRef.current }
    delete next[assistantId]
    activeRequestsRef.current = next
    setActiveRequests(next)
  }, [])

  const protectRequest = useCallback((key: string, requestId: string): void => {
    protectedRequestsRef.current = {
      ...protectedRequestsRef.current,
      [key]: new Set([...(protectedRequestsRef.current[key] ?? []), requestId])
    }
  }, [])

  const releaseProtectedRequest = useCallback((key: string, requestId: string): void => {
    const protectedIds = new Set(protectedRequestsRef.current[key] ?? [])
    protectedIds.delete(requestId)
    protectedRequestsRef.current = { ...protectedRequestsRef.current, [key]: protectedIds }
  }, [])

  const applyTimelineSnapshot = useCallback(
    (key: string, snapshot: TimelineSnapshot): void => {
      const protectedIds = new Set(protectedRequestsRef.current[key] ?? [])
      setTimelines((values) => ({
        ...values,
        [key]: reconcileTimelineMessages(values[key] ?? [], snapshot.messages, protectedIds)
      }))
      for (const message of snapshot.messages) {
        if (message.role === 'assistant' && message.status !== 'pending') {
          releaseProtectedRequest(key, message.requestId)
          setUncertainRequests((values) => ({ ...values, [message.requestId]: '' }))
        }
      }
      setHasMore((values) => ({ ...values, [key]: snapshot.hasMore }))
    },
    [releaseProtectedRequest]
  )

  const readTimeline = useCallback(
    async (assistantId: string, chatMode: ChatMode): Promise<TimelineObservation> => {
      if (!assistantId) return { kind: 'unavailable' }
      const key = timelineKey(assistantId, chatMode)
      const version = (readVersions.current[key] ?? 0) + 1
      readVersions.current[key] = version
      setLoading((values) => ({ ...values, [key]: true }))
      try {
        const result = await timelineApi.read({ protocolVersion, assistantId, mode: chatMode })
        if (readVersions.current[key] !== version) return { kind: 'superseded' }
        if (!result.ok) {
          setTimelineErrors((values) => ({ ...values, [key]: errorText(result) }))
          return { kind: 'unavailable' }
        }
        applyTimelineSnapshot(key, result.data)
        setTimelineErrors((values) => ({ ...values, [key]: '' }))
        return { kind: 'snapshot', data: result.data }
      } catch {
        if (readVersions.current[key] === version) {
          setTimelineErrors((values) => ({
            ...values,
            [key]: '本地时间线暂时无法读取，当前显示内容已保留'
          }))
        }
        return { kind: readVersions.current[key] === version ? 'unavailable' : 'superseded' }
      } finally {
        if (readVersions.current[key] === version) {
          setLoading((values) => ({ ...values, [key]: false }))
        }
      }
    },
    [applyTimelineSnapshot, timelineApi]
  )

  const loadOperations = useCallback(
    async (assistantId: string, chatMode: ChatMode, requestId?: string): Promise<void> => {
      if (!assistantId) return
      const key = timelineKey(assistantId, chatMode)
      const version = (toolReadVersions.current[key] ?? 0) + 1
      toolReadVersions.current[key] = version
      setOperationLoading((values) => ({ ...values, [key]: true }))
      setOperationErrors((values) => ({ ...values, [key]: '' }))
      try {
        const result = await api.tools({
          protocolVersion,
          assistantId,
          mode: chatMode,
          ...(requestId ? { requestId } : {})
        })
        if (toolReadVersions.current[key] !== version) return
        if (!result.ok) {
          setOperationErrors((values) => ({ ...values, [key]: errorText(result) }))
          return
        }
        if (result.data.assistantId !== assistantId || result.data.mode !== chatMode) {
          setOperationErrors((values) => ({
            ...values,
            [key]: '工具回执归属不一致，已忽略此次读取'
          }))
          return
        }
        setOperations((values) => ({
          ...values,
          [key]: mergeToolOperations(
            (values[key] ?? []).filter(
              (operation) =>
                requestId ||
                result.data.operations.some(
                  (incoming) => incoming.operationId === operation.operationId
                ) ||
                (operationEvents.current[key]?.[operation.operationId] ?? 0) > 0
            ),
            result.data.operations,
            true
          )
        }))
      } catch {
        if (toolReadVersions.current[key] === version) {
          setOperationErrors((values) => ({
            ...values,
            [key]: '可信工具回执暂时无法读取，当前记录已保留'
          }))
        }
      } finally {
        if (toolReadVersions.current[key] === version) {
          setOperationLoading((values) => ({ ...values, [key]: false }))
        }
      }
    },
    [api]
  )

  const refreshOperationPermissions = useCallback(
    (assistantId: string): void => {
      const key = timelineKey(assistantId, 'normal')
      citationEpochs.current[key] = (citationEpochs.current[key] ?? 0) + 1
      setOperations((values) => ({
        ...values,
        [key]: (values[key] ?? []).map((operation) => ({ ...operation, citations: [] }))
      }))
      void loadOperations(assistantId, 'normal')
    },
    [loadOperations]
  )

  const loadCapabilities = useCallback(
    async (assistantId: string): Promise<void> => {
      if (!assistantId) return
      const version = (capabilityReadVersions.current[assistantId] ?? 0) + 1
      capabilityReadVersions.current[assistantId] = version
      setCapabilityLoading((values) => ({ ...values, [assistantId]: true }))
      setCapabilityErrors((values) => ({ ...values, [assistantId]: '' }))
      setCapabilities((values) => ({ ...values, [assistantId]: undefined }))
      try {
        const result = await api.capabilities({ protocolVersion, assistantId })
        if (capabilityReadVersions.current[assistantId] !== version) return
        if (!result.ok) {
          setCapabilityErrors((values) => ({ ...values, [assistantId]: errorText(result) }))
          return
        }
        if (result.data.assistantId !== assistantId) {
          setCapabilityErrors((values) => ({
            ...values,
            [assistantId]: '端点能力归属不一致，工具保持关闭'
          }))
          return
        }
        setCapabilities((values) => ({ ...values, [assistantId]: result.data }))
      } catch {
        if (capabilityReadVersions.current[assistantId] === version) {
          setCapabilityErrors((values) => ({
            ...values,
            [assistantId]: '当前端点能力暂时无法读取，工具保持关闭'
          }))
        }
      } finally {
        if (capabilityReadVersions.current[assistantId] === version) {
          setCapabilityLoading((values) => ({ ...values, [assistantId]: false }))
        }
      }
    },
    [api]
  )

  useEffect(() => {
    let active = true
    void api.list().then((result) => {
      if (!active) return
      if (result.ok) {
        setSnapshot(result.data)
        const first = result.data.connections[0]
        setSelectedId(first?.id ?? '')
        if (first) {
          setDisplayName(first.displayName)
          setBaseUrl(first.baseUrl)
          setEnabled(first.enabled)
        }
      } else setSettingsError(errorText(result))
    })
    const remove = api.onEvent((event) => {
      if (event.type === 'operation') {
        const requestRoute = requestRoutesRef.current[event.requestId]
        if (
          !requestRoute ||
          requestRoute.assistantId !== event.assistantId ||
          event.operation.requestId !== event.requestId ||
          event.operation.assistantId !== event.assistantId ||
          requestRoute.retentionEpoch !== (retentionEpochs.current[event.assistantId] ?? 0)
        )
          return
        const key = timelineKey(event.assistantId, requestRoute.mode)
        operationEvents.current[key] = {
          ...operationEvents.current[key],
          [event.operation.operationId]: ++operationSequence.current
        }
        const operation =
          requestRoute.citationEpoch === (citationEpochs.current[key] ?? 0)
            ? event.operation
            : { ...event.operation, citations: [] }
        setOperations((values) => ({
          ...values,
          [key]: mergeToolOperations(values[key] ?? [], [operation])
        }))
        if (
          (event.operation.toolName === 'write_memory' ||
            event.operation.toolName === 'correct_memory') &&
          event.operation.state === 'SUCCEEDED' &&
          !notifiedMemoryOperations.current.has(event.operation.operationId)
        ) {
          notifiedMemoryOperations.current.add(event.operation.operationId)
          onMemoryChanged?.()
        }
        const itemTool =
          event.operation.toolName === 'search_items' ||
          event.operation.toolName === 'apply_item_intent' ||
          event.operation.toolName === 'propose_item' ||
          event.operation.toolName === 'revise_item_proposal' ||
          event.operation.toolName === 'prepare_item_update'
        if (event.operation.itemReceipt?.objectId) {
          const receipt = event.operation.itemReceipt
          setItemContexts((values) => {
            const current = values[event.assistantId]
            if (!current || current.id !== receipt.objectId || receipt.objectVersion <= 0)
              return values
            return {
              ...values,
              [event.assistantId]: { ...current, expectedVersion: receipt.objectVersion }
            }
          })
        }
        if (
          itemTool &&
          event.operation.state === 'SUCCEEDED' &&
          !notifiedItemOperations.current.has(event.operation.operationId)
        ) {
          notifiedItemOperations.current.add(event.operation.operationId)
          onItemChanged?.()
        }
        return
      }
      const route = activeRequestsRef.current[event.assistantId]
      if (
        !route ||
        route.requestId !== event.requestId ||
        route.retentionEpoch !== (retentionEpochs.current[event.assistantId] ?? 0)
      )
        return
      route.observedAcceptance = true
      route.observedTerminal = event.type !== 'delta'
      const key = timelineKey(event.assistantId, route.mode)
      invalidateRead(key)
      if (event.type === 'delta') {
        setTimelines((values) =>
          updateRequest(values, key, event.requestId, (message) => ({
            ...message,
            content: message.content + event.text,
            status: 'pending'
          }))
        )
        return
      }
      setTimelines((values) =>
        updateRequest(values, key, event.requestId, (message) => ({
          ...message,
          status:
            event.type === 'completed'
              ? 'completed'
              : event.type === 'cancelled'
                ? 'cancelled'
                : event.type === 'interrupted'
                  ? 'interrupted'
                  : 'failed'
        }))
      )
      clearActiveRequest(event.assistantId, event.requestId)
      if (route.mode === 'normal' && !notifiedItemRequests.current.has(event.requestId)) {
        notifiedItemRequests.current.add(event.requestId)
        onItemChanged?.()
      }
    })
    return () => {
      active = false
      remove()
    }
  }, [api, clearActiveRequest, invalidateRead, onItemChanged, onMemoryChanged])

  useEffect(() => {
    if (
      !retentionChange ||
      retentionChange.reason === 'job-status' ||
      retentionChange.reason === 'policy-status'
    )
      return
    if (lastRetentionEpoch.current === retentionChange.epoch) return
    lastRetentionEpoch.current = retentionChange.epoch
    const affected = new Set(retentionChange.assistantIds)
    for (const assistantId of affected) {
      retentionEpochs.current[assistantId] = retentionChange.epoch
      for (const chatMode of ['normal', 'temporary'] as const) {
        const key = timelineKey(assistantId, chatMode)
        readVersions.current[key] = (readVersions.current[key] ?? 0) + 1
        toolReadVersions.current[key] = (toolReadVersions.current[key] ?? 0) + 1
        autoOperationReadVersions.current[key] = (autoOperationReadVersions.current[key] ?? 0) + 1
        citationEpochs.current[key] = (citationEpochs.current[key] ?? 0) + 1
        delete protectedRequestsRef.current[key]
        delete operationEvents.current[key]
      }
      capabilityReadVersions.current[assistantId] =
        (capabilityReadVersions.current[assistantId] ?? 0) + 1
    }
    const affectedRequestIds = new Set(
      Object.entries(requestRoutesRef.current)
        .filter(([, route]) => affected.has(route.assistantId))
        .map(([requestId]) => requestId)
    )
    activeRequestsRef.current = Object.fromEntries(
      Object.entries(activeRequestsRef.current).filter(
        ([assistantId]) => !affected.has(assistantId)
      )
    )
    setActiveRequests(activeRequestsRef.current)
    requestRoutesRef.current = Object.fromEntries(
      Object.entries(requestRoutesRef.current).filter(
        ([, route]) => !affected.has(route.assistantId)
      )
    )
    setSelectedRequestsByAssistant((values) =>
      Object.fromEntries(
        Object.entries(values).filter(([assistantId]) => !affected.has(assistantId))
      )
    )
    setCleanupAnchorsByAssistant((values) =>
      Object.fromEntries(
        Object.entries(values).filter(([assistantId]) => !affected.has(assistantId))
      )
    )
    setContextByAssistant((values) =>
      Object.fromEntries(
        Object.entries(values).filter(([assistantId]) => !affected.has(assistantId))
      )
    )
    setItemContexts((values) =>
      Object.fromEntries(
        Object.entries(values).filter(([assistantId]) => !affected.has(assistantId))
      )
    )
    setHistoryFocus((values) =>
      Object.fromEntries(
        Object.entries(values).filter(([assistantId]) => !affected.has(assistantId))
      )
    )
    setUncertainRequests((values) =>
      Object.fromEntries(
        Object.entries(values).filter(([requestId]) => !affectedRequestIds.has(requestId))
      )
    )
    setOperations((values) =>
      Object.fromEntries(
        Object.entries(values).map(([key, items]) => [
          key,
          affected.has(key.split(':')[0] ?? '') ? [] : items
        ])
      )
    )
    if (retentionChange.reason === 'cleanup' || retentionChange.reason === 'purge') {
      setTimelines((values) =>
        Object.fromEntries(
          Object.entries(values).filter(([key]) => !affected.has(key.split(':')[0] ?? ''))
        )
      )
      setTextDrafts((values) =>
        Object.fromEntries(
          Object.entries(values).filter(([key]) => !affected.has(key.split(':')[0] ?? ''))
        )
      )
      setRejectedDrafts((values) =>
        Object.fromEntries(
          Object.entries(values).filter(([key]) => !affected.has(key.split(':')[0] ?? ''))
        )
      )
      setHasMore((values) =>
        Object.fromEntries(
          Object.entries(values).filter(([key]) => !affected.has(key.split(':')[0] ?? ''))
        )
      )
      setLoading((values) =>
        Object.fromEntries(
          Object.entries(values).filter(([key]) => !affected.has(key.split(':')[0] ?? ''))
        )
      )
      setSaving((values) =>
        Object.fromEntries(
          Object.entries(values).filter(([key]) => !affected.has(key.split(':')[0] ?? ''))
        )
      )
      setTimelineErrors((values) =>
        Object.fromEntries(
          Object.entries(values).filter(([key]) => !affected.has(key.split(':')[0] ?? ''))
        )
      )
      setNotices((values) =>
        Object.fromEntries(
          Object.entries(values).filter(([key]) => !affected.has(key.split(':')[0] ?? ''))
        )
      )
      setOperationLoading((values) =>
        Object.fromEntries(
          Object.entries(values).filter(([key]) => !affected.has(key.split(':')[0] ?? ''))
        )
      )
      setOperationErrors((values) =>
        Object.fromEntries(
          Object.entries(values).filter(([key]) => !affected.has(key.split(':')[0] ?? ''))
        )
      )
      notifiedMemoryOperations.current.clear()
      notifiedItemOperations.current.clear()
      notifiedItemRequests.current.clear()
    }
    for (const assistantId of affected) {
      if (assistantSnapshot?.assistants.some((item) => item.id === assistantId)) {
        void readTimeline(assistantId, 'normal')
        void readTimeline(assistantId, 'temporary')
      }
    }
  }, [assistantSnapshot, readTimeline, retentionChange])

  useEffect(() => {
    let active = true
    queueMicrotask(() => {
      if (active) void readTimeline(currentAssistantId, mode)
    })
    return () => {
      active = false
    }
  }, [currentAssistantId, mode, readTimeline])

  useEffect(() => {
    let active = true
    const key = timelineKey(currentAssistantId, mode)
    const autoVersion = (autoOperationReadVersions.current[key] ?? 0) + 1
    autoOperationReadVersions.current[key] = autoVersion
    queueMicrotask(() => {
      if (active && autoOperationReadVersions.current[key] === autoVersion) {
        void loadOperations(currentAssistantId, mode)
      }
    })
    return () => {
      active = false
    }
  }, [currentAssistantId, historyBindingKey, loadOperations, mode, refreshOperationPermissions])

  useEffect(() => {
    let active = true
    queueMicrotask(() => {
      if (active) void loadCapabilities(currentAssistantId)
    })
    return () => {
      active = false
    }
  }, [currentAssistantId, historyBindingKey, loadCapabilities])

  useEffect(() => {
    if (!historyTarget || historyTarget.assistantId !== currentAssistantId) return
    let active = true
    queueMicrotask(() => {
      if (!active) return
      setModeByAssistant((values) => ({ ...values, [currentAssistantId]: 'normal' }))
      setHistoryFocus((values) => ({
        ...values,
        [currentAssistantId]: {
          requestId: historyTarget.requestId,
          nonce: historyTarget.nonce
        }
      }))
    })
    return () => {
      active = false
    }
  }, [currentAssistantId, historyTarget])

  useEffect(() => {
    const previous = previousItemTarget.current
    previousItemTarget.current = itemTarget
    if (itemTarget || !previous) return
    setItemContexts((values) => ({ ...values, [previous.assistantId]: undefined }))
  }, [itemTarget])
  useEffect(() => {
    if (
      !itemTarget ||
      itemTarget.assistantId !== currentAssistantId ||
      itemTarget.nonce === dismissedItemTargetNonce
    )
      return
    let active = true
    queueMicrotask(() => {
      if (!active) return
      setModeByAssistant((values) => ({ ...values, [currentAssistantId]: 'normal' }))
      setItemContexts((values) => ({
        ...values,
        [currentAssistantId]: {
          type: itemTarget.type,
          id: itemTarget.id,
          expectedVersion: itemTarget.expectedVersion
        }
      }))
      setToolScopes((values) => ({
        ...values,
        [timelineKey(currentAssistantId, 'normal')]: 'items'
      }))
    })
    return () => {
      active = false
    }
  }, [currentAssistantId, dismissedItemTargetNonce, itemTarget])

  const receiver = useMemo(() => {
    if (!executionConnection || !binding) return null
    return (
      executionConnection.displayName + ' · ' + executionConnection.baseUrl + ' · ' + binding.model
    )
  }, [executionConnection, binding])

  async function apply(operation: () => Promise<ProviderResult>): Promise<void> {
    setSettingsError(null)
    try {
      const result = await operation()
      if (result.ok) {
        setSnapshot(result.data)
        if (!selectedId) setSelectedId(result.data.connections.at(-1)?.id ?? '')
      } else setSettingsError(errorText(result))
    } catch {
      setSettingsError('Provider 服务暂时不可用')
    }
  }

  async function clearTemporaryChat(assistantId: string): Promise<void> {
    const key = timelineKey(assistantId, 'temporary')
    const retentionEpoch = retentionEpochs.current[assistantId] ?? 0
    setTimelineErrors((values) => ({ ...values, [key]: '' }))
    setNotices((values) => ({ ...values, [key]: '' }))
    try {
      const result = await api.clearChat({ protocolVersion, assistantId })
      if ((retentionEpochs.current[assistantId] ?? 0) !== retentionEpoch) return
      if (!result.ok) {
        setTimelineErrors((values) => ({ ...values, [key]: errorText(result) }))
        return
      }
      invalidateRead(key)
      setSnapshot(result.data)
      setTimelines((values) => ({ ...values, [key]: [] }))
      toolReadVersions.current[key] = (toolReadVersions.current[key] ?? 0) + 1
      delete operationEvents.current[key]
      for (const [id, route] of Object.entries(requestRoutesRef.current)) {
        if (route.assistantId === assistantId && route.mode === 'temporary')
          delete requestRoutesRef.current[id]
      }
      setOperationLoading((values) => ({ ...values, [key]: false }))
      setOperations((values) => ({ ...values, [key]: [] }))
      setRejectedDrafts((values) => ({ ...values, [key]: [] }))
      setHasMore((values) => ({ ...values, [key]: false }))
      setNotices((values) => ({ ...values, [key]: '当前助手的临时会话已清空' }))
    } catch {
      if ((retentionEpochs.current[assistantId] ?? 0) !== retentionEpoch) return
      setTimelineErrors((values) => ({
        ...values,
        [key]: '临时会话清空失败，当前正文已保留'
      }))
    }
  }

  async function saveTemporary(assistantId: string): Promise<void> {
    const key = timelineKey(assistantId, 'temporary')
    const retentionEpoch = retentionEpochs.current[assistantId] ?? 0
    setSaving((values) => ({ ...values, [key]: true }))
    setTimelineErrors((values) => ({ ...values, [key]: '' }))
    setNotices((values) => ({ ...values, [key]: '' }))
    try {
      const result = await timelineApi.saveTemporary({ protocolVersion, assistantId })
      if ((retentionEpochs.current[assistantId] ?? 0) !== retentionEpoch) return
      if (!result.ok) {
        setTimelineErrors((values) => ({ ...values, [key]: errorText(result) }))
        return
      }
      invalidateRead(key)
      applyTimelineSnapshot(key, result.data)
      const savedCount = result.data.messages.filter((message) => message.saved).length
      const targetName =
        assistantSnapshot?.assistants.find((item) => item.id === assistantId)?.displayName ??
        '此助手'
      setNotices((values) => ({
        ...values,
        [key]:
          savedCount > 0
            ? '已将当前临时会话中 ' +
              String(savedCount) +
              ' 条消息保存到“' +
              targetName +
              '”的正常时间线；这是已确认的保存总数，包含此前保存的消息，重复操作不会重复写入'
            : currentRejectedDrafts.length > 0
              ? '没有新的临时消息需要保存；没有临时时间线消息被保存，未发送草稿仍保留在界面中'
              : '没有新的临时消息需要保存；没有临时时间线消息被保存，已保存内容不会重复写入'
      }))
      void readTimeline(assistantId, 'normal')
    } catch {
      if ((retentionEpochs.current[assistantId] ?? 0) !== retentionEpoch) return
      setTimelineErrors((values) => ({
        ...values,
        [key]: '保存失败，临时正文仍保留在本次运行中且尚未标记为已保存'
      }))
    } finally {
      if ((retentionEpochs.current[assistantId] ?? 0) === retentionEpoch) {
        setSaving((values) => ({ ...values, [key]: false }))
      }
    }
  }

  async function reconcileFailedRequest(
    assistantId: string,
    request: ActiveRequest,
    submitted: string,
    errorCode?: string
  ): Promise<'not-admitted' | 'retained'> {
    const key = timelineKey(assistantId, request.mode)
    const observation = await readTimeline(assistantId, request.mode)
    const snapshot = observation.kind === 'snapshot' ? observation.data : undefined
    const rows = snapshot?.messages.filter((message) => message.requestId === request.requestId)
    if (rows?.length) request.observedAcceptance = true
    if (rows?.some((message) => message.role === 'assistant' && message.status !== 'pending')) {
      request.observedTerminal = true
    }
    // These codes are trusted rejections before admission. A missing row is
    // evidence only in a fresh complete snapshot, and never outweighs an event.
    const rejectedBeforeAdmission =
      errorCode !== undefined &&
      [
        'INVALID_INPUT',
        'PERMISSION_DENIED',
        'LIMIT',
        'NOT_FOUND',
        'ASSISTANT_ARCHIVED',
        'CONNECTION_DISABLED',
        'CREDENTIAL_MISSING',
        'REQUEST_IN_PROGRESS'
      ].includes(errorCode)
    const confirmedAbsent = snapshot !== undefined && !snapshot.hasMore && rows?.length === 0
    if (!request.observedAcceptance && (rejectedBeforeAdmission || confirmedAbsent)) {
      releaseProtectedRequest(key, request.requestId)
      setTimelines((items) => removeRequest(items, key, request.requestId))
      setRejectedDrafts((items) =>
        addRejectedDraft(items, key, {
          requestId: request.requestId,
          content: submitted
        })
      )
      return 'not-admitted'
    }
    if (!request.observedTerminal) {
      setUncertainRequests((items) => ({
        ...items,
        [request.requestId]: request.observedAcceptance
          ? '请求已发送，最终状态或保存情况未确认；不会自动重试'
          : '请求结果未确认，可能已经发送；已保留输入，不会自动重试'
      }))
    }
    return 'retained'
  }

  function notifyItemCompletion(requestId: string, requestMode: ChatMode): void {
    if (requestMode !== 'normal' || notifiedItemRequests.current.has(requestId)) return
    notifiedItemRequests.current.add(requestId)
    onItemChanged?.()
  }

  async function send(): Promise<void> {
    if (!currentAssistantId || !text.trim() || activeRequest) return
    const requestId = crypto.randomUUID()
    const assistantId = currentAssistantId
    const requestMode = mode
    const requestContext = requestMode === 'temporary' ? ({ kind: 'none' } as const) : contextIntent
    const requestedTools = toolScopes[timelineKey(assistantId, requestMode)] ?? 'off'
    const requestTools: ToolScope =
      currentCapability?.assistantId !== assistantId || !currentCapability.toolsAvailable
        ? 'off'
        : requestMode === 'temporary' &&
            (requestedTools === 'clock-and-history' ||
              requestedTools === 'clock-and-memory' ||
              requestedTools === 'clock-history-and-memory' ||
              requestedTools === 'items' ||
              requestedTools === 'items-memory')
          ? 'clock'
          : requestContext.kind === 'none' && requestedTools === 'clock-and-history'
            ? 'clock'
            : requestContext.kind === 'none' && requestedTools === 'clock-history-and-memory'
              ? 'clock-and-memory'
              : requestedTools
    const key = timelineKey(assistantId, requestMode)
    const submitted = text
    const createdAt = new Date().toISOString()
    invalidateRead(key)
    protectRequest(key, requestId)
    setTextDrafts((items) => ({ ...items, [key]: '' }))
    setTimelineErrors((items) => ({ ...items, [key]: '' }))
    setNotices((items) => ({ ...items, [key]: '' }))
    setTimelines((items) => ({
      ...items,
      [key]: [
        ...(items[key] ?? []),
        {
          id: crypto.randomUUID(),
          requestId,
          role: 'user',
          content: submitted,
          status: 'completed',
          createdAt,
          saved: requestMode === 'normal'
        },
        {
          id: crypto.randomUUID(),
          requestId,
          role: 'assistant',
          content: '',
          status: 'pending',
          createdAt,
          saved: requestMode === 'normal'
        }
      ]
    }))
    const request = {
      requestId,
      mode: requestMode,
      observedAcceptance: false,
      observedTerminal: false,
      retentionEpoch: retentionEpochs.current[assistantId] ?? 0
    }
    activeRequestsRef.current = { ...activeRequestsRef.current, [assistantId]: request }
    setActiveRequests(activeRequestsRef.current)
    requestRoutesRef.current = {
      ...requestRoutesRef.current,
      [requestId]: {
        assistantId,
        mode: requestMode,
        citationEpoch: citationEpochs.current[timelineKey(assistantId, requestMode)] ?? 0,
        retentionEpoch: request.retentionEpoch
      }
    }
    try {
      const result = await api.startChat({
        protocolVersion,
        requestId,
        assistantId,
        text: submitted,
        mode: requestMode,
        context: requestContext,
        tools: requestTools,
        ...(requestMode === 'normal' && itemContext ? { itemContext } : {}),
        stream
      })
      if ((retentionEpochs.current[assistantId] ?? 0) !== request.retentionEpoch) return
      clearActiveRequest(assistantId, requestId)
      if (!result.ok) {
        await reconcileFailedRequest(assistantId, request, submitted, result.error.code)
        setTimelineErrors((items) => ({ ...items, [key]: errorText(result) }))
        notifyItemCompletion(requestId, requestMode)
        return
      }
      request.observedAcceptance = true
      request.observedTerminal = true
      setTimelines((items) =>
        updateRequest(items, key, requestId, (message) => ({
          ...message,
          content: result.data.text,
          status: result.data.status
        }))
      )
      await readTimeline(assistantId, requestMode)
      notifyItemCompletion(requestId, requestMode)
    } catch {
      if ((retentionEpochs.current[assistantId] ?? 0) !== request.retentionEpoch) return
      clearActiveRequest(assistantId, requestId)
      const outcome = await reconcileFailedRequest(assistantId, request, submitted)
      setTimelineErrors((items) => ({
        ...items,
        [key]:
          outcome === 'not-admitted'
            ? '已确认请求未进入时间线，输入已保留为未发送草稿；不会自动重试'
            : '请求回执未确认，当前输入与已收到正文已保留；不会自动重试'
      }))
      notifyItemCompletion(requestId, requestMode)
    }
  }

  function selectConnection(id: string): void {
    setSelectedId(id)
    const connection = snapshot?.connections.find((item) => item.id === id)
    if (connection) {
      setDisplayName(connection.displayName)
      setBaseUrl(connection.baseUrl)
      setEnabled(connection.enabled)
    } else {
      setDisplayName('')
      setEnabled(true)
    }
  }

  return (
    <section aria-labelledby="provider-heading" className="provider-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">持续时间线与严格临时交流</p>
          <h1 id="provider-heading">连接与文本交流</h1>
        </div>
        <p className="privacy-note">
          正常模式自动记录在本机；严格临时模式只保留于本次运行，除非你明确保存
        </p>
      </div>
      {settingsError ? <p role="alert">{settingsError}</p> : null}

      <div className="provider-grid">
        <details
          id="provider-connection-settings"
          className="provider-settings-shell"
          tabIndex={-1}
          open
        >
          <summary>连接设置</summary>
          <form
            className="provider-settings"
            onSubmit={(event) => {
              event.preventDefault()
              void apply(() =>
                api.saveConnection({
                  protocolVersion,
                  connectionId: selected?.id,
                  displayName,
                  baseUrl,
                  enabled,
                  expectedVersion: selected?.version
                })
              )
            }}
          >
            <h2>连接设置</h2>
            <label>
              正在编辑
              <select
                value={selectedId}
                onChange={(event) => selectConnection(event.currentTarget.value)}
              >
                <option value="">新建连接</option>
                {snapshot?.connections.map((connection) => (
                  <option key={connection.id} value={connection.id}>
                    {connection.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              连接名称
              <input
                value={displayName}
                maxLength={80}
                onChange={(event) => setDisplayName(event.currentTarget.value)}
              />
            </label>
            <label>
              HTTPS Base URL
              <input value={baseUrl} onChange={(event) => setBaseUrl(event.currentTarget.value)} />
            </label>
            <label className="inline-check">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(event) => setEnabled(event.currentTarget.checked)}
              />
              启用此连接
            </label>
            <button type="submit" disabled={!displayName.trim() || !baseUrl.trim()}>
              保存连接
            </button>

            {selected ? (
              <>
                <label>
                  API Key
                  <input
                    type="password"
                    autoComplete="off"
                    value={apiKey}
                    onChange={(event) => setApiKey(event.currentTarget.value)}
                  />
                </label>
                <label className="inline-check">
                  <input
                    type="checkbox"
                    checked={persistent}
                    onChange={(event) => setPersistent(event.currentTarget.checked)}
                  />
                  使用 Windows 凭据保护持久保存
                </label>
                <div className="button-row">
                  <button
                    type="button"
                    disabled={!apiKey}
                    onClick={() => {
                      const value = apiKey
                      setApiKey('')
                      void apply(() =>
                        api.setCredential({
                          protocolVersion,
                          connectionId: selected.id,
                          apiKey: value,
                          persistence: persistent ? 'persistent' : 'temporary'
                        })
                      )
                    }}
                  >
                    提交 Key
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void apply(() =>
                        api.deleteCredential({ protocolVersion, connectionId: selected.id })
                      )
                    }
                  >
                    删除 Key
                  </button>
                </div>
                <p role="status">
                  {selected.credentialPersistence === 'temporary'
                    ? '当前使用运行期临时 Key；若先前保存过持久 Key，重启后仍会恢复持久 Key'
                    : selected.credentialPersistence === 'persistent'
                      ? 'Key 已由 Windows 凭据保护持久保存'
                      : '尚未设置 Key'}
                </p>
              </>
            ) : null}
          </form>
        </details>

        <div className="temporary-chat">
          <div className="chat-assistant-heading">
            {currentAssistant ? (
              <AssistantAvatar
                avatarKey={currentAssistant.avatarKey}
                size="large"
                label={`${currentAssistant.displayName}的聊天形象：${avatarLabel(currentAssistant.avatarKey)}`}
              />
            ) : null}
            <h2>{mode === 'normal' ? '正常时间线' : '本次运行的严格临时会话'}</h2>
          </div>
          <label>
            当前助手
            <select value={currentAssistantId} disabled>
              <option value={currentAssistantId}>
                {currentAssistant?.displayName ?? '请先创建助手'}
              </option>
            </select>
          </label>
          <p className="scope-note">
            当前助手的名称和人设会随正常及严格临时请求发送给下方显示的实际接收方；人设不会授予历史、记忆、事项或工具权限。
          </p>
          <fieldset className="mode-switch">
            <legend>交流模式</legend>
            <label className="inline-check">
              <input
                type="radio"
                name={'chat-mode-' + currentAssistantId}
                value="normal"
                checked={mode === 'normal'}
                onChange={() =>
                  setModeByAssistant((values) => ({ ...values, [currentAssistantId]: 'normal' }))
                }
              />
              正常模式（自动保存）
            </label>
            <label className="inline-check">
              <input
                type="radio"
                name={'chat-mode-' + currentAssistantId}
                value="temporary"
                checked={mode === 'temporary'}
                onChange={() =>
                  setModeByAssistant((values) => ({
                    ...values,
                    [currentAssistantId]: 'temporary'
                  }))
                }
              />
              严格临时（不自动保存）
            </label>
          </fieldset>
          <label>
            模型
            <input
              value={model}
              maxLength={160}
              onChange={(event) => {
                const value = event.currentTarget.value
                setModelDrafts((items) => ({ ...items, [currentAssistantId]: value }))
              }}
            />
          </label>
          <button
            type="button"
            disabled={!selectedId || !currentAssistantId || !model.trim()}
            onClick={() =>
              void apply(() =>
                api.bindAssistant({
                  protocolVersion,
                  assistantId: currentAssistantId,
                  connectionId: selectedId,
                  model,
                  expectedVersion: binding?.version ?? null
                })
              )
            }
          >
            绑定“正在编辑”的连接
          </button>
          <p className="receiver">
            {receiver ? '实际接收方：' + receiver : '请先保存连接并绑定当前助手'}
          </p>
          <p className="scope-note">
            {mode === 'normal'
              ? '你可以在下方选择近期历史、仅本次输入或已选轮次；近期模式最多最近 16 组已完成的正常对话，并且只有读取与实际接收方权限都允许时才会外发。'
              : '只发送本次严格临时会话；不会读取正常历史，也不会自动保存到正常时间线。'}
          </p>

          {mode === 'normal' && itemContext ? (
            <section className="item-context-banner" aria-label="当前事项协商上下文">
              <p>
                正在{itemContext.type === 'proposal' ? '协商提案' : '处理事项'} {itemContext.id} ·
                版本 {itemContext.expectedVersion}
              </p>
              <button
                type="button"
                onClick={() => {
                  setDismissedItemTargetNonce(itemTarget?.nonce ?? null)
                  setItemContexts((values) => ({ ...values, [currentAssistantId]: undefined }))
                }}
              >
                结束事项上下文
              </button>
            </section>
          ) : null}

          {mode === 'normal' && contextIntent.kind === 'chapters' ? (
            <section className="item-context-banner" aria-label="当前章节上下文">
              <p>下一次正常对话将读取 {contextIntent.chapters.length} 个已接受章节及其精确版本。</p>
              <button
                type="button"
                onClick={() =>
                  setContextByAssistant((items) => ({
                    ...items,
                    [currentAssistantId]: { kind: 'recent' }
                  }))
                }
              >
                改用近期合格历史
              </button>
            </section>
          ) : null}

          <HistoryContextPanel
            assistantId={currentAssistantId}
            mode={mode}
            bindingKey={historyBindingKey}
            timelineApi={timelineApi}
            providerApi={api}
            memoryApi={memoryApi}
            reminderApi={reminderApi}
            roundMemoryRefreshKey={`${historyBindingKey}:${roundMemoryRefresh}:${memoryEvidenceRefreshKey ?? ''}:${retentionChange?.epoch ?? ''}`}
            receiptRouteKey={`${assistantSnapshot?.stateRevision ?? ''}:${historyBindingKey}:${roundMemoryRefresh}:${memoryEvidenceRefreshKey ?? ''}:${retentionChange?.epoch ?? ''}`}
            onOpenMemory={onOpenMemory}
            onMemoryChanged={() => {
              setRoundMemoryRefresh((value) => value + 1)
              onMemoryChanged?.()
            }}
            onItemChanged={onItemChanged}
            onReminderChanged={onReminderChanged}
            onOpenItems={onOpenItems}
            onLocateMemorySource={onLocateMemorySource}
            onPrepareRetention={(prepared) =>
              onPrepareRetention?.(prepared.assistantId, prepared.target, prepared.intent)
            }
            contextIntent={contextIntent}
            selectedRequestIds={selectedRequestIds}
            focusRequest={historyFocus[currentAssistantId]}
            onPermissionsChange={() => {
              setRoundMemoryRefresh((value) => value + 1)
              refreshOperationPermissions(currentAssistantId)
            }}
            retentionChange={retentionChange}
            onContextIntentChange={(value) => {
              setContextByAssistant((items) => ({ ...items, [currentAssistantId]: value }))
              if (value.kind === 'none') {
                setToolScopes((items) => ({
                  ...items,
                  [currentKey]:
                    items[currentKey] === 'clock-and-history'
                      ? 'clock'
                      : items[currentKey] === 'clock-history-and-memory'
                        ? 'clock-and-memory'
                        : (items[currentKey] ?? 'off')
                }))
              }
            }}
            onSelectedRequestIdsChange={(value) => {
              setSelectedRequestsByAssistant((items) => ({
                ...items,
                [currentAssistantId]: value
              }))
              if (contextIntent.kind === 'selected' && value.length > 0) {
                setContextByAssistant((items) => ({
                  ...items,
                  [currentAssistantId]: { kind: 'selected', requestIds: value }
                }))
              }
            }}
          />

          <ToolExecutionPanel
            assistantId={currentAssistantId}
            mode={mode}
            contextIntent={contextIntent}
            memoryApi={memoryApi}
            itemApi={itemApi}
            reminderApi={reminderApi}
            capability={currentCapability}
            capabilityLoading={capabilityLoading[currentAssistantId] ?? false}
            capabilityError={capabilityErrors[currentAssistantId] ?? ''}
            scope={toolScope}
            operations={currentOperations}
            operationLoading={operationLoading[currentKey] ?? false}
            operationError={operationErrors[currentKey] ?? ''}
            onScopeChange={(value) => setToolScopes((items) => ({ ...items, [currentKey]: value }))}
            onRefreshOperation={(requestId) => {
              autoOperationReadVersions.current[currentKey] =
                (autoOperationReadVersions.current[currentKey] ?? 0) + 1
              void loadOperations(currentAssistantId, mode, requestId)
            }}
            onMemoryChanged={() => {
              setRoundMemoryRefresh((value) => value + 1)
              onMemoryChanged?.()
            }}
            onItemChanged={onItemChanged}
            onReminderChanged={onReminderChanged}
            onOpenItems={onOpenItems}
            onLocateMemorySource={onLocateMemorySource}
            retentionChange={retentionChange}
            onPrepareRetention={(prepared) =>
              onPrepareRetention?.(prepared.assistantId, prepared.target, prepared.intent)
            }
            onLocateCitation={(citation: HistoryCitation) =>
              setHistoryFocus((items) => ({
                ...items,
                [currentAssistantId]: {
                  requestId: citation.requestId,
                  nonce: (items[currentAssistantId]?.nonce ?? 0) + 1
                }
              }))
            }
          />

          {timelineErrors[currentKey] ? <p role="alert">{timelineErrors[currentKey]}</p> : null}
          {notices[currentKey] ? <p role="status">{notices[currentKey]}</p> : null}
          {loading[currentKey] && transcript.length === 0 ? <p>正在读取…</p> : null}
          {hasMore[currentKey] ? (
            <p className="scope-note">这里只显示最近 100 条消息，更早内容仍保留在本机。</p>
          ) : null}
          {currentRejectedDrafts.length > 0 ? (
            <section aria-label="未发送草稿" className="rejected-drafts">
              {currentRejectedDrafts.map((draft) => (
                <article key={draft.requestId}>
                  <strong>未发送草稿</strong>
                  <p>{draft.content}</p>
                  <small>
                    {mode === 'temporary'
                      ? '未发送 · 未保存 · 未进入可保存的临时时间线'
                      : '未发送 · 未保存 · 未进入正常时间线'}
                  </small>
                  <button
                    type="button"
                    disabled={Boolean(text.trim())}
                    onClick={() => {
                      setTextDrafts((values) => ({ ...values, [currentKey]: draft.content }))
                      setRejectedDrafts((values) => ({
                        ...values,
                        [currentKey]: (values[currentKey] ?? []).filter(
                          (item) => item.requestId !== draft.requestId
                        )
                      }))
                    }}
                  >
                    重新编辑此草稿
                  </button>
                </article>
              ))}
            </section>
          ) : null}
          {mode === 'normal' && onPrepareRetention ? (
            <div className="retention-timeline-actions">
              <button
                type="button"
                onClick={() => onPrepareRetention(currentAssistantId, { type: 'timeline' })}
              >
                预览清理整条时间线
              </button>
              {cleanupAnchors.length === 2 ? (
                <button
                  type="button"
                  onClick={() =>
                    onPrepareRetention(currentAssistantId, {
                      type: 'range',
                      firstMessageId: cleanupAnchors[0]!,
                      lastMessageId: cleanupAnchors[1]!
                    })
                  }
                >
                  预览清理所选区段
                </button>
              ) : null}
              <small>按时间顺序选择两个消息作为区段端点；可信预览会说明是否扩大到完整轮次。</small>
            </div>
          ) : null}
          <div className="transcript" aria-live="polite" aria-label="消息时间线">
            {transcript.map((item) => (
              <article key={item.id} className={item.role + ' status-' + item.status}>
                <strong>{item.role === 'user' ? '你' : '助手'}</strong>
                <p>{item.content || (item.status === 'pending' ? '尚未返回正文' : '未返回正文')}</p>
                <small>
                  {uncertainRequests[item.requestId] || statusText(item.status)}
                  {mode === 'temporary' ? ' · ' + (item.saved ? '已保存' : '未保存') : ''}
                </small>
                {item.role === 'assistant' ? (
                  <RoundMemoryPanel
                    assistantId={currentAssistantId}
                    requestId={item.requestId}
                    mode={mode}
                    api={memoryApi}
                    refreshKey={`${historyBindingKey}:${roundMemoryRefresh}:${memoryEvidenceRefreshKey ?? ''}:${retentionChange?.epoch ?? ''}`}
                    onOpenMemory={onOpenMemory}
                  />
                ) : null}
                {mode === 'normal' && onPrepareRetention ? (
                  <div className="message-retention-actions">
                    <button
                      type="button"
                      onClick={() =>
                        onPrepareRetention(currentAssistantId, {
                          type: 'message',
                          messageId: item.id
                        })
                      }
                    >
                      预览清理此消息
                    </button>
                    <label className="inline-check">
                      <input
                        type="checkbox"
                        checked={cleanupAnchors.includes(item.id)}
                        disabled={!cleanupAnchors.includes(item.id) && cleanupAnchors.length >= 2}
                        onChange={(event) => {
                          const checked = event.currentTarget.checked
                          setCleanupAnchorsByAssistant((values) => ({
                            ...values,
                            [currentAssistantId]: checked
                              ? [...cleanupAnchors, item.id]
                              : cleanupAnchors.filter((id) => id !== item.id)
                          }))
                        }}
                      />
                      作为区段端点
                    </label>
                  </div>
                ) : null}
              </article>
            ))}
          </div>

          {mode === 'temporary' ? (
            <div className="temporary-actions">
              <p className="scope-note">
                保存目标：“{currentAssistant?.displayName ?? '此助手'}
                ”的正常时间线。范围：当前临时会话中尚未保存的用户可见消息及其真实状态。
              </p>
              {activeRequest ? (
                <p className="scope-note">请等待当前请求完成或取消后再保存。</p>
              ) : null}
              <div className="button-row">
                <button
                  type="button"
                  disabled={!currentAssistantId || Boolean(activeRequest) || saving[currentKey]}
                  onClick={() => void saveTemporary(currentAssistantId)}
                >
                  {saving[currentKey] ? '正在保存…' : '保存到此助手时间线'}
                </button>
                <button
                  type="button"
                  disabled={!currentAssistantId || Boolean(activeRequest)}
                  onClick={() => void clearTemporaryChat(currentAssistantId)}
                >
                  清空本助手的临时会话
                </button>
              </div>
            </div>
          ) : null}

          <form
            onSubmit={(event) => {
              event.preventDefault()
              void send()
            }}
          >
            <label>
              {mode === 'normal' ? '正常消息' : '临时消息'}
              <textarea
                value={text}
                maxLength={16000}
                onChange={(event) => {
                  const value = event.currentTarget.value
                  setTextDrafts((items) => ({ ...items, [currentKey]: value }))
                }}
              />
            </label>
            <label className="inline-check">
              <input
                type="checkbox"
                checked={stream}
                onChange={(event) => setStream(event.currentTarget.checked)}
              />
              流式显示
            </label>
            <div className="button-row">
              <button type="submit" disabled={!receiver || !text.trim() || Boolean(activeRequest)}>
                发送
              </button>
              <button
                type="button"
                disabled={!activeRequest}
                onClick={() =>
                  activeRequest &&
                  void api.cancelChat({
                    protocolVersion,
                    requestId: activeRequest.requestId,
                    assistantId: currentAssistantId
                  })
                }
              >
                取消
              </button>
            </div>
          </form>
        </div>
      </div>
    </section>
  )
}

function mergeToolOperations(
  current: ToolOperation[],
  incoming: ToolOperation[],
  snapshot = false
): ToolOperation[] {
  const byId = new Map(current.map((operation) => [operation.operationId, operation]))
  for (const operation of incoming) {
    const previous = byId.get(operation.operationId)
    const rank = (state: ToolOperation['state']): number =>
      state === 'PREPARED' ? 0 : state === 'DISPATCHING' ? 1 : state === 'RESULT_UNKNOWN' ? 2 : 3
    const stale =
      previous &&
      (rank(previous.state) > rank(operation.state) || previous.updatedAt > operation.updatedAt)
    const next = stale ? previous : operation
    // Permission-filtered snapshots own citation visibility; queued events cannot restore stripped references.
    const citations = snapshot
      ? stale
        ? next.citations
        : operation.citations
      : previous?.state === 'SUCCEEDED' && previous.citations.length === 0
        ? []
        : next.citations
    byId.set(operation.operationId, {
      ...next,
      citations,
      memoryReceipt: mergeMemoryReceipt(
        previous?.memoryReceipt,
        operation.memoryReceipt,
        Boolean(stale)
      ),
      reminderPreview: mergeReminderPreview(
        previous?.reminderPreview,
        operation.reminderPreview,
        Boolean(stale)
      ),
      reminderReceipt: mergeReminderReceipt(
        previous?.reminderReceipt,
        operation.reminderReceipt,
        Boolean(stale)
      )
    })
  }
  return [...byId.values()].sort((left, right) =>
    left.createdAt === right.createdAt
      ? left.operationId.localeCompare(right.operationId)
      : left.createdAt.localeCompare(right.createdAt)
  )
}

function mergeMemoryReceipt(
  previous: ToolOperation['memoryReceipt'],
  incoming: ToolOperation['memoryReceipt'],
  outerOperationIsStale: boolean
): ToolOperation['memoryReceipt'] {
  if (outerOperationIsStale) return previous
  if (!previous) return incoming
  if (!incoming) return previous
  if (previous.operationId !== incoming.operationId) return incoming
  const rank = (state: NonNullable<ToolOperation['memoryReceipt']>['state']): number =>
    state === 'PENDING_CONFIRMATION' ? 0 : 1
  return rank(previous.state) > rank(incoming.state) ? previous : incoming
}

function mergeReminderPreview(
  previous: ToolOperation['reminderPreview'],
  incoming: ToolOperation['reminderPreview'],
  outerOperationIsStale: boolean
): ToolOperation['reminderPreview'] {
  if (outerOperationIsStale) return previous
  if (!previous) return incoming
  if (!incoming) return previous
  if (previous.confirmationId !== incoming.confirmationId) return incoming
  const rank = (state: NonNullable<ToolOperation['reminderPreview']>['state']): number =>
    state === 'PENDING' ? 0 : 1
  return rank(previous.state) >= rank(incoming.state) ? previous : incoming
}

function mergeReminderReceipt(
  previous: ToolOperation['reminderReceipt'],
  incoming: ToolOperation['reminderReceipt'],
  outerOperationIsStale: boolean
): ToolOperation['reminderReceipt'] {
  if (outerOperationIsStale) return previous
  if (!previous) return incoming
  if (!incoming) return previous
  if (previous.operationId !== incoming.operationId) return incoming
  const rank = (state: NonNullable<ToolOperation['reminderReceipt']>['state']): number =>
    state === 'RESULT_UNKNOWN' ? 0 : 1
  return rank(previous.state) >= rank(incoming.state) ? previous : incoming
}

function reconcileTimelineMessages(
  local: TimelineMessage[],
  authoritative: TimelineMessage[],
  protectedRequestIds: Set<string>
): TimelineMessage[] {
  const localByRequestRole = new Map(
    local.map((message) => [message.requestId + ':' + message.role, message])
  )
  const authoritativeRoles = new Set(
    authoritative.map((message) => message.requestId + ':' + message.role)
  )
  const reconciled = authoritative.map((message) => {
    if (
      message.role !== 'assistant' ||
      message.status !== 'pending' ||
      !protectedRequestIds.has(message.requestId)
    ) {
      return message
    }
    const localMessage = localByRequestRole.get(message.requestId + ':assistant')
    if (!localMessage) return message
    return {
      ...message,
      content: newerVisibleContent(message.content, localMessage.content),
      status: localMessage.status
    }
  })
  for (const message of local) {
    const roleKey = message.requestId + ':' + message.role
    if (protectedRequestIds.has(message.requestId) && !authoritativeRoles.has(roleKey)) {
      reconciled.push(message)
    }
  }
  return reconciled
}

function newerVisibleContent(authoritative: string, local: string): string {
  if (!local) return authoritative
  if (!authoritative) return local
  if (authoritative.startsWith(local)) return authoritative
  return local
}

function removeRequest(values: TimelineMap, key: string, requestId: string): TimelineMap {
  return {
    ...values,
    [key]: (values[key] ?? []).filter((message) => message.requestId !== requestId)
  }
}

function addRejectedDraft(
  values: RejectedDraftMap,
  key: string,
  draft: RejectedDraft
): RejectedDraftMap {
  if ((values[key] ?? []).some((item) => item.requestId === draft.requestId)) return values
  return { ...values, [key]: [...(values[key] ?? []), draft] }
}

function updateRequest(
  values: TimelineMap,
  key: string,
  requestId: string,
  update: (value: TimelineMessage) => TimelineMessage
): TimelineMap {
  const items = [...(values[key] ?? [])]
  let index = items.length - 1
  while (
    index >= 0 &&
    (items[index]?.role !== 'assistant' || items[index]?.requestId !== requestId)
  ) {
    index -= 1
  }
  if (index >= 0) items[index] = update(items[index]!)
  return { ...values, [key]: items }
}
