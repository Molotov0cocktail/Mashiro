import { useCallback, useEffect, useRef, useState } from 'react'
import type { ItemApi, ItemPermissions, ItemReceipt } from '../../../../shared/item-contract'
import type {
  MemoryApi,
  MemoryPermissions,
  MemoryReceipt
} from '../../../../shared/memory-contract'
import type { RetentionChanged, RetentionIntent } from '../../../../shared/retention-contract'
import type {
  ReminderApi,
  ReminderPreview,
  ReminderReceipt
} from '../../../../shared/reminder-contract'
import type { ContextIntent } from '../../../../shared/provider-contract'
import type {
  HistoryCitation,
  ProviderCapabilities,
  ToolOperation,
  ToolScope
} from '../../../../shared/tool-contract'
import type { ChatMode } from '../../../../shared/timeline-contract'

const capabilityLabels: Record<ProviderCapabilities['evidence'][number]['capability'], string> = {
  text: '普通文本',
  stream: '流式文本',
  tools: '工具调用',
  'preserved-thinking': '保留式思考',
  'json-object': 'JSON 对象',
  'local-strict': '本地严格校验',
  'vendor-strict': '厂商 strict',
  parallel: '并行工具',
  usage: '用量'
}

const capabilityLevelLabels: Record<ProviderCapabilities['evidence'][number]['level'], string> = {
  UNVERIFIED: '未验证',
  DOCUMENTED: '文档说明',
  LOCAL_TESTED: '本地验证',
  LIVE_VERIFIED: '真实端点验证',
  FAILED: '验证失败'
}

const operationStateLabels: Record<ToolOperation['state'], string> = {
  PREPARED: '准备',
  DISPATCHING: '读取中',
  SUCCEEDED: '已完成',
  CONFIRMED_NOT_APPLIED: '已确认未执行',
  RESULT_UNKNOWN: '结果待核查',
  CANCELLED_BEFORE_DISPATCH: '被取消',
  BLOCKED_BY_CURRENT_STATE: '权限阻止'
}

export function toolLabel(toolName: ToolOperation['toolName']): string {
  switch (toolName) {
    case 'get_current_time':
      return '本机时钟'
    case 'search_conversation_history':
      return '历史检索'
    case 'search_memory':
      return '记忆检索'
    case 'write_memory':
      return '记忆或事件写入'
    case 'correct_memory':
      return '纠正记忆'
    case 'request_memory_removal':
      return '删除或撤回请求'
    case 'request_retention_cleanup':
      return '保留与原文清理预览'
    case 'search_items':
      return '事项检索'
    case 'apply_item_intent':
      return '明确事项操作'
    case 'propose_item':
      return '待确认事项建议'
    case 'revise_item_proposal':
      return '协商中的提案修改'
    case 'prepare_item_update':
      return '正式事项修改预览'
    case 'prepare_reminder':
      return '提醒候选'
  }
}

export function operationAriaLabel(toolName: ToolOperation['toolName']): string {
  if (toolName === 'get_current_time') return '时钟读取操作'
  if (toolName === 'search_conversation_history') return '历史检索操作'
  return toolLabel(toolName) + '操作'
}

export function operationStateText(operation: ToolOperation, receipt?: MemoryReceipt): string {
  if (operation.toolName === 'request_memory_removal' && receipt) {
    if (receipt.state === 'PENDING_CONFIRMATION') return '待本地确认'
    if (receipt.state === 'SUCCEEDED') return '已执行'
    return '已取消'
  }
  if (operation.toolName === 'request_memory_removal' && operation.state === 'SUCCEEDED')
    return '待本地确认'
  if (operation.toolName === 'write_memory' && operation.state === 'SUCCEEDED') return '已保存'
  if (operation.toolName === 'correct_memory' && operation.state === 'SUCCEEDED') return '已纠正'
  return operationStateLabels[operation.state]
}

type MemoryConfirmationState = { receipt: MemoryReceipt; busy: boolean; error: string }

export function MemoryReceiptCard({
  receipt,
  busy,
  error,
  onConfirm,
  onLocateRound
}: {
  receipt: MemoryReceipt
  busy: boolean
  error: string
  onConfirm: (accept: boolean) => void
  onLocateRound?: (source: { assistantId: string; id: string }) => void
}): React.JSX.Element {
  return (
    <section className="confirmation-card" aria-label="对话记忆操作确认">
      <strong>
        {receipt.state === 'PENDING_CONFIRMATION'
          ? '请在本机核对后确认'
          : receipt.state === 'SUCCEEDED'
            ? '可信业务操作已完成'
            : '本次业务操作已取消'}
      </strong>
      <p>{receipt.summary}</p>
      {receipt.impact ? (
        <>
          <p>
            受影响：{receipt.impact.totalMemories} 条记忆或事件 · {receipt.impact.totalRounds}
            个派生或来源轮次
          </p>
          {receipt.impact.memoryIds.length > 0 ? (
            <p className="scope-note">记忆编号：{receipt.impact.memoryIds.join('、')}</p>
          ) : null}
          {receipt.impact.roundIds.length > 0 ? (
            <p className="scope-note">轮次编号：{receipt.impact.roundIds.join('、')}</p>
          ) : null}
          {receipt.impact.sourceRounds.length > 0 ? (
            <div className="button-row">
              {receipt.impact.sourceRounds.map((source) => (
                <button
                  key={source.assistantId + ':' + source.requestId}
                  type="button"
                  onClick={() =>
                    onLocateRound?.({ assistantId: source.assistantId, id: source.requestId })
                  }
                >
                  定位受影响来源轮次
                </button>
              ))}
            </div>
          ) : null}
          {receipt.impact.truncated ? (
            <p className="scope-note">影响范围较大，编号列表仅显示可信回执中的前 64 项。</p>
          ) : null}
        </>
      ) : null}
      {receipt.state === 'PENDING_CONFIRMATION' ? (
        <>
          <p className="scope-note">此时尚未删除或撤回；确认时会重新核对完整影响范围。</p>
          <div className="button-row">
            <button type="button" disabled={busy} onClick={() => onConfirm(true)}>
              {busy ? '正在确认…' : '确认执行'}
            </button>
            <button type="button" disabled={busy} onClick={() => onConfirm(false)}>
              取消操作
            </button>
          </div>
        </>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
    </section>
  )
}

export function ItemReceiptCard({
  receipt,
  onOpen
}: {
  receipt: ItemReceipt
  onOpen?: () => void
}): React.JSX.Element {
  const state =
    receipt.state === 'SUCCEEDED'
      ? '可信事项操作已完成'
      : receipt.state === 'RESULT_UNKNOWN'
        ? '事项结果仍待核查'
        : receipt.state === 'PENDING_CONFIRMATION'
          ? '等待本机确认'
          : receipt.state === 'CONFIRMED_NOT_APPLIED'
            ? '已确认未执行'
            : receipt.state === 'SUPPRESSED'
              ? '已抑制重复建议'
              : '已在执行前取消'
  return (
    <section className="confirmation-card" aria-label="事项可信回执">
      <strong>{state}</strong>
      <p>{receipt.summary}</p>
      <p className="scope-note">
        {receipt.objectType === 'proposal'
          ? '提案'
          : receipt.objectType === 'item'
            ? '正式事项'
            : '对象'}
        ：{receipt.objectId ?? '无'} · 版本 {receipt.objectVersion}
      </p>
      {onOpen ? (
        <button type="button" onClick={onOpen}>
          打开事项
        </button>
      ) : null}
    </section>
  )
}

function reminderTime(preview: ReminderPreview): string {
  if (!('dueAt' in preview.mutation)) return '不包含新提醒时间'
  try {
    return (
      new Intl.DateTimeFormat('zh-CN', {
        timeZone: preview.mutation.timeZone,
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZoneName: 'longOffset',
        hourCycle: 'h23'
      }).format(new Date(preview.mutation.dueAt)) +
      ' · ' +
      preview.mutation.timeZone +
      ' · ' +
      preview.mutation.dueAt
    )
  } catch {
    return preview.mutation.dueAt + ' · ' + preview.mutation.timeZone
  }
}

export function ReminderReceiptCard({ receipt }: { receipt: ReminderReceipt }): React.JSX.Element {
  return (
    <section className="reminder-tool-receipt" aria-label="提醒可信回执">
      <strong>
        {receipt.state === 'SUCCEEDED'
          ? '本地提醒操作已完成'
          : receipt.state === 'RESULT_UNKNOWN'
            ? '提醒操作结果待核查'
            : '已确认提醒操作未执行'}
      </strong>
      <p>{receipt.summary}</p>
      <small>
        操作编号：{receipt.operationId}
        {receipt.reminderId
          ? ' · 提醒 ' + receipt.reminderId + ' · 版本 ' + receipt.reminderVersion
          : ''}
      </small>
    </section>
  )
}

export function ReminderConversationCard({
  api,
  operation,
  initial,
  onRefresh,
  onChanged
}: {
  api: ReminderApi
  operation: ToolOperation
  initial: ReminderPreview
  onRefresh: () => void
  onChanged?: () => void
}): React.JSX.Element {
  const [preview, setPreview] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const version = useRef(0)

  useEffect(() => {
    const currentVersion = ++version.current
    queueMicrotask(() => {
      if (currentVersion !== version.current) return
      setBusy(false)
      setError('')
    })
    return () => {
      version.current += 1
    }
  }, [initial.confirmationId, operation.assistantId])

  useEffect(() => {
    const currentVersion = version.current
    queueMicrotask(() => {
      if (currentVersion !== version.current) return
      setPreview((current) => {
        if (current.confirmationId !== initial.confirmationId) return initial
        const rank = (state: ReminderPreview['state']): number => (state === 'PENDING' ? 0 : 1)
        return rank(current.state) > rank(initial.state) ? current : initial
      })
    })
  }, [initial])

  async function confirm(accept: boolean): Promise<void> {
    if (busy || preview.state !== 'PENDING') return
    const currentVersion = version.current
    setBusy(true)
    setError('')
    try {
      const checked = await api.preview({
        protocolVersion: 1,
        assistantId: operation.assistantId,
        confirmationId: preview.confirmationId
      })
      if (currentVersion !== version.current) return
      if (!checked.ok) {
        setError('候选核查失败：' + checked.error.message)
        onRefresh()
        return
      }
      const current = checked.data
      const changed =
        current.commandId !== preview.commandId ||
        current.itemId !== preview.itemId ||
        current.itemVersion !== preview.itemVersion ||
        current.itemTitle !== preview.itemTitle ||
        JSON.stringify(current.mutation) !== JSON.stringify(preview.mutation)
      setPreview(current)
      if (changed) {
        setError('候选内容或事项版本已变化，请重新核对后再确认。')
        onRefresh()
        return
      }
      if (current.state !== 'PENDING') {
        onRefresh()
        return
      }
      const result = await api.confirm({
        protocolVersion: 1,
        assistantId: operation.assistantId,
        confirmationId: current.confirmationId,
        accept
      })
      if (currentVersion !== version.current) return
      if (!result.ok) {
        setError('确认失败：' + result.error.message)
        onRefresh()
        return
      }
      if (result.data.operationId !== current.commandId) {
        setError('确认回执与原候选操作不一致，已停止并重新核查。')
        onRefresh()
        return
      }
      let resolved: ReminderPreview = {
        ...current,
        state:
          result.data.state === 'SUCCEEDED'
            ? accept
              ? 'ACCEPTED'
              : 'REJECTED'
            : !accept && result.data.state === 'CONFIRMED_NOT_APPLIED'
              ? 'REJECTED'
              : 'PENDING',
        receipt: result.data
      }
      try {
        const refreshed = await api.preview({
          protocolVersion: 1,
          assistantId: operation.assistantId,
          confirmationId: current.confirmationId
        })
        if (currentVersion !== version.current) return
        if (refreshed.ok) resolved = refreshed.data
      } catch {
        // Keep the confirmed receipt visible until the next trusted operation refresh.
      }
      setPreview(resolved)
      onRefresh()
      if (accept && result.data.state === 'SUCCEEDED') onChanged?.()
    } catch {
      if (currentVersion === version.current)
        setError('确认结果未返回，请核查本地状态；界面不会自动重复确认。')
    } finally {
      if (currentVersion === version.current) setBusy(false)
    }
  }

  const action =
    preview.mutation.action === 'create'
      ? '设置提醒'
      : preview.mutation.action === 'reschedule'
        ? '修改提醒'
        : preview.mutation.action === 'cancel'
          ? '取消提醒'
          : '标为已处理'
  return (
    <section className="confirmation-card reminder-confirmation-card" aria-label="对话提醒候选确认">
      <strong>
        {preview.state === 'PENDING'
          ? '请核对后明确确认'
          : preview.state === 'ACCEPTED'
            ? '提醒操作已接受'
            : '提醒操作已拒绝'}
      </strong>
      <p>
        {action}：{preview.itemTitle}
      </p>
      <p>{reminderTime(preview)}</p>
      <p className="scope-note">
        正式事项 {preview.itemId} · 当前候选事项版本 {preview.itemVersion} · 确认编号{' '}
        {preview.confirmationId}
      </p>
      {preview.state === 'PENDING' ? (
        <>
          <p className="scope-note">
            模型只准备了候选，尚未调度提醒；确认时本机会重新核对事项、提醒版本、时间和权限。
          </p>
          <div className="button-row">
            <button type="button" disabled={busy} onClick={() => void confirm(true)}>
              {busy ? '正在确认…' : '确认' + action}
            </button>
            <button type="button" disabled={busy} onClick={() => void confirm(false)}>
              拒绝候选
            </button>
          </div>
        </>
      ) : null}
      {preview.receipt ? <ReminderReceiptCard receipt={preview.receipt} /> : null}
      {error ? <p role="alert">{error}</p> : null}
    </section>
  )
}

export function ToolExecutionPanel({
  assistantId,
  mode,
  contextIntent,
  memoryApi,
  itemApi,
  reminderApi,
  capability,
  capabilityLoading,
  capabilityError,
  scope,
  operations,
  operationLoading,
  operationError,
  onScopeChange,
  onRefreshOperation,
  onLocateCitation,
  onMemoryChanged,
  onItemChanged,
  onReminderChanged,
  onOpenItems,
  onLocateMemorySource,
  retentionChange,
  onPrepareRetention
}: {
  assistantId: string
  mode: ChatMode
  contextIntent: ContextIntent
  memoryApi?: MemoryApi
  itemApi?: ItemApi
  reminderApi?: ReminderApi
  capability: ProviderCapabilities | undefined
  capabilityLoading: boolean
  capabilityError: string
  scope: ToolScope
  operations: ToolOperation[]
  operationLoading: boolean
  operationError: string
  onScopeChange: (scope: ToolScope) => void
  onRefreshOperation: (requestId: string) => void
  onLocateCitation: (citation: HistoryCitation) => void
  onMemoryChanged?: () => void
  onItemChanged?: () => void
  onReminderChanged?: () => void
  onOpenItems?: (recovery?: {
    assistantId: string
    commandId: string
    confirmationAction?: 'replace-content'
  }) => void
  onLocateMemorySource?: (source: { assistantId: string; id: string }) => Promise<void>
  retentionChange?: RetentionChanged | null
  onPrepareRetention?: (intent: RetentionIntent) => void
}): React.JSX.Element {
  const [memoryPermissions, setMemoryPermissions] = useState<MemoryPermissions[]>([])
  const [itemPermissions, setItemPermissions] = useState<ItemPermissions | null>(null)
  const [itemPermissionLoading, setItemPermissionLoading] = useState(false)
  const [itemPermissionError, setItemPermissionError] = useState('')
  const [memoryPermissionLoading, setMemoryPermissionLoading] = useState(false)
  const [memoryPermissionError, setMemoryPermissionError] = useState('')
  const memoryPermissionVersion = useRef(0)
  const itemPermissionVersion = useRef(0)
  const [memoryConfirmations, setMemoryConfirmations] = useState<
    Record<string, MemoryConfirmationState>
  >({})
  const confirmingMemoryOperations = useRef(new Set<string>())
  const retentionVersion = useRef(0)
  useEffect(() => {
    if (
      !retentionChange ||
      retentionChange.reason === 'job-status' ||
      !retentionChange.assistantIds.includes(assistantId)
    )
      return
    memoryPermissionVersion.current += 1
    itemPermissionVersion.current += 1
    if (retentionChange.reason === 'cleanup' || retentionChange.reason === 'purge') {
      retentionVersion.current += 1
      confirmingMemoryOperations.current.clear()
      queueMicrotask(() => setMemoryConfirmations({}))
    }
  }, [assistantId, retentionChange])

  const toolsAvailable = capability?.toolsAvailable === true
  const visibleScope = toolsAvailable ? scope : 'off'
  const historyDisabled =
    !assistantId || capabilityLoading || !toolsAvailable || contextIntent.kind === 'none'

  const loadMemoryPermissions = useCallback(async (): Promise<void> => {
    if (!memoryApi || !assistantId || mode !== 'normal') return
    const version = ++memoryPermissionVersion.current
    setMemoryPermissionLoading(true)
    setMemoryPermissionError('')
    try {
      const results = await Promise.all([
        memoryApi.permissions({ protocolVersion: 1, assistantId, scope: 'global' }),
        memoryApi.permissions({ protocolVersion: 1, assistantId, scope: 'assistant' })
      ])
      if (version !== memoryPermissionVersion.current) return
      const failure = results.find((result) => !result.ok)
      if (failure && !failure.ok) {
        setMemoryPermissionError(failure.error.message)
        return
      }
      setMemoryPermissions(results.flatMap((result) => (result.ok ? [result.data] : [])))
    } catch {
      if (version === memoryPermissionVersion.current)
        setMemoryPermissionError('记忆授权暂时无法读取')
    } finally {
      if (version === memoryPermissionVersion.current) setMemoryPermissionLoading(false)
    }
  }, [assistantId, memoryApi, mode])

  const loadItemPermissions = useCallback(async (): Promise<void> => {
    if (!itemApi || !assistantId || mode !== 'normal') return
    const version = ++itemPermissionVersion.current
    setItemPermissionLoading(true)
    setItemPermissionError('')
    try {
      const result = await itemApi.permissions({ protocolVersion: 1, assistantId })
      if (version !== itemPermissionVersion.current) return
      if (!result.ok) {
        setItemPermissionError(result.error.message)
        return
      }
      setItemPermissions(result.data)
    } catch {
      if (version === itemPermissionVersion.current) setItemPermissionError('事项授权暂时无法读取')
    } finally {
      if (version === itemPermissionVersion.current) setItemPermissionLoading(false)
    }
  }, [assistantId, itemApi, mode])

  useEffect(() => {
    memoryPermissionVersion.current += 1
    let active = true
    queueMicrotask(() => {
      if (!active) return
      setMemoryPermissions([])
      setMemoryPermissionError('')
      if (memoryApi && assistantId && mode === 'normal') void loadMemoryPermissions()
    })
    return () => {
      active = false
    }
  }, [assistantId, memoryApi, mode, loadMemoryPermissions])

  useEffect(() => {
    itemPermissionVersion.current += 1
    let active = true
    queueMicrotask(() => {
      if (!active) return
      setItemPermissions(null)
      setItemPermissionError('')
      if (itemApi && assistantId && mode === 'normal') void loadItemPermissions()
    })
    return () => {
      active = false
    }
  }, [assistantId, itemApi, loadItemPermissions, mode])

  const memoryEnabled = memoryPermissions.some(
    (permission) =>
      permission.write || permission.writeInferences || (permission.read && permission.receive)
  )
  const memoryDisabled =
    !assistantId ||
    capabilityLoading ||
    !toolsAvailable ||
    memoryPermissionLoading ||
    !memoryEnabled
  const itemEnabled = Boolean(
    itemPermissions &&
    (itemPermissions.write ||
      itemPermissions.propose ||
      (itemPermissions.read && itemPermissions.receive))
  )
  const itemDisabled =
    !assistantId || capabilityLoading || !toolsAvailable || itemPermissionLoading || !itemEnabled

  async function confirmMemoryOperation(
    operation: ToolOperation,
    receipt: MemoryReceipt,
    accept: boolean
  ): Promise<void> {
    if (
      !memoryApi ||
      !receipt.confirmationId ||
      confirmingMemoryOperations.current.has(receipt.operationId)
    )
      return
    confirmingMemoryOperations.current.add(receipt.operationId)
    const governanceVersion = retentionVersion.current
    setMemoryConfirmations((values) => ({
      ...values,
      [receipt.operationId]: { receipt, busy: true, error: '' }
    }))
    try {
      const result = await memoryApi.confirm({
        protocolVersion: 1,
        assistantId: operation.assistantId,
        confirmationId: receipt.confirmationId,
        accept
      })
      if (governanceVersion !== retentionVersion.current) return
      if (!result.ok) {
        setMemoryConfirmations((values) => ({
          ...values,
          [receipt.operationId]: {
            receipt: values[receipt.operationId]?.receipt ?? receipt,
            busy: false,
            error: '确认失败：' + result.error.message
          }
        }))
        onRefreshOperation(operation.requestId)
        return
      }
      if (
        result.data.operationId !== receipt.operationId ||
        result.data.objectId !== receipt.objectId
      ) {
        setMemoryConfirmations((values) => ({
          ...values,
          [receipt.operationId]: {
            receipt,
            busy: false,
            error: '确认回执与原业务操作不一致，已保留待确认状态并重新核查。'
          }
        }))
        onRefreshOperation(operation.requestId)
        return
      }
      setMemoryConfirmations((values) => ({
        ...values,
        [receipt.operationId]: { receipt: result.data, busy: false, error: '' }
      }))
      onRefreshOperation(operation.requestId)
      if (accept && result.data.state === 'SUCCEEDED') onMemoryChanged?.()
    } catch {
      if (governanceVersion !== retentionVersion.current) return
      setMemoryConfirmations((values) => ({
        ...values,
        [receipt.operationId]: {
          receipt: values[receipt.operationId]?.receipt ?? receipt,
          busy: false,
          error: '确认结果未返回，请核查本地状态；界面不会自动重复确认。'
        }
      }))
    } finally {
      confirmingMemoryOperations.current.delete(receipt.operationId)
    }
  }

  return (
    <section className="tool-execution" aria-label="本轮工具与可信回执">
      <fieldset className="tool-scope">
        <legend>本轮工具范围</legend>
        <label className="inline-check">
          <input
            type="radio"
            name={'tool-scope-' + assistantId + '-' + mode}
            checked={visibleScope === 'off'}
            onChange={() => onScopeChange('off')}
          />
          关闭工具（默认）
        </label>
        <label className="inline-check">
          <input
            type="radio"
            name={'tool-scope-' + assistantId + '-' + mode}
            checked={visibleScope === 'clock'}
            disabled={!assistantId || capabilityLoading || !toolsAvailable}
            onChange={() => onScopeChange('clock')}
          />
          仅本机时钟
        </label>
        {mode === 'normal' ? (
          <>
            <label className="inline-check">
              <input
                type="radio"
                name={'tool-scope-' + assistantId + '-' + mode}
                checked={visibleScope === 'clock-and-history'}
                disabled={historyDisabled}
                onChange={() => onScopeChange('clock-and-history')}
              />
              {contextIntent.kind === 'selected'
                ? '本机时钟 + 按关键词检索所选轮次'
                : '本机时钟 + 按关键词检索本助手完整历史'}
            </label>
            <label className="inline-check">
              <input
                type="radio"
                name={'tool-scope-' + assistantId + '-' + mode}
                checked={visibleScope === 'items'}
                disabled={itemDisabled}
                onChange={() => onScopeChange('items')}
              />
              本机时钟 + 事项与待确认提案
            </label>
            <label className="inline-check">
              <input
                type="radio"
                name={'tool-scope-' + assistantId + '-' + mode}
                checked={visibleScope === 'items-memory'}
                disabled={itemDisabled || memoryDisabled}
                onChange={() => onScopeChange('items-memory')}
              />
              本机时钟 + 事项 + 记忆与个人事件
            </label>
            <label className="inline-check">
              <input
                type="radio"
                name={'tool-scope-' + assistantId + '-' + mode}
                checked={visibleScope === 'clock-and-memory'}
                disabled={memoryDisabled}
                onChange={() => onScopeChange('clock-and-memory')}
              />
              本机时钟 + 记忆与个人事件
            </label>
            <label className="inline-check">
              <input
                type="radio"
                name={'tool-scope-' + assistantId + '-' + mode}
                checked={visibleScope === 'clock-history-and-memory'}
                disabled={historyDisabled || memoryDisabled}
                onChange={() => onScopeChange('clock-history-and-memory')}
              />
              本机时钟 + 历史 + 记忆与个人事件
            </label>
          </>
        ) : null}
        <p className="scope-note">
          {mode === 'temporary'
            ? '严格临时只可使用本机时钟。临时工具不会读取正常历史，也不会形成可重启的协议或操作记录；同时不会读取或写入记忆、个人事件，也不会读取或写入事项、提案。'
            : visibleScope === 'clock-and-history'
              ? contextIntent.kind === 'selected'
                ? '你已明确允许本轮模型仅按关键词检索所选轮次；仍须同时具备历史读取与当前实际接收方发送权限。未选择的历史不会进入工具检索范围。'
                : '你已明确允许本轮模型按关键词检索本助手完整正常历史；仍须同时具备历史读取与当前实际接收方发送权限。近期上下文仍只控制随请求直接发送的近期轮次，不会暗中扩成全部历史。'
              : visibleScope === 'items' || visibleScope === 'items-memory'
                ? '本轮模型可检索事项，并按你的明确意图执行事项操作或保存待确认建议；正式事项、提案和实际端点接收权限仍由可信边界分别检查。'
                : visibleScope === 'clock-and-memory' || visibleScope === 'clock-history-and-memory'
                  ? '本轮模型可按任务需要检索或提出记忆、事件业务操作；应用会在每次读取、外发和写入前重新检查对应全局或私有授权。每轮最多一个记忆或事件业务写操作，删除或撤回仍需本地确认。'
                  : contextIntent.kind === 'none'
                    ? '“仅本次输入”禁止历史检索；记忆工具仍须单独开启并通过对应领域授权。'
                    : '工具范围只影响下一次发送，默认关闭；模型文字不能代替可信执行回执。'}
        </p>
        {capabilityLoading ? <p>正在读取当前端点能力…</p> : null}
        {!capabilityLoading && !capability ? (
          <p role="status">能力记录不可用，工具保持关闭。</p>
        ) : null}
        {capabilityError ? <p role="alert">{capabilityError}</p> : null}
      </fieldset>

      {memoryApi && mode === 'normal' ? (
        <section className="capability-panel" aria-label="Provider 记忆授权状态">
          <div className="operation-heading">
            <div>
              <h3>当前记忆授权</h3>
              <p className="scope-note">以下状态来自可信边界；全局与本助手私有范围分别检查。</p>
            </div>
            <button
              type="button"
              disabled={memoryPermissionLoading}
              onClick={() => void loadMemoryPermissions()}
            >
              刷新记忆授权
            </button>
          </div>
          {memoryPermissionError ? <p role="alert">{memoryPermissionError}</p> : null}
          {memoryPermissions.map((permission) => (
            <p key={permission.scope} className="receiver">
              {permission.scope === 'global' ? '全局用户记忆' : '本助手私有记忆'}：
              {permission.read ? '可读' : '不可读'} · {permission.write ? '可写' : '不可写'} ·
              {permission.writeInferences ? ' 可写推测' : ' 不可写推测'} ·
              {permission.receive ? '可提供给实际接收方' : '不可提供给实际接收方'} · 实际接收方：
              {permission.endpointDisplay ?? '未确认'}
            </p>
          ))}
          {!memoryPermissionLoading && !memoryEnabled ? (
            <p className="scope-note">
              请在“记忆与个人事件”面板按范围授予所需权限后，再刷新并开启本轮记忆工具。
            </p>
          ) : null}
        </section>
      ) : null}

      {itemApi && mode === 'normal' ? (
        <section className="capability-panel" aria-label="Provider 事项授权状态">
          <div className="operation-heading">
            <div>
              <h3>当前事项授权</h3>
              <p className="scope-note">读取、写入、提案与实际端点接收分别由可信边界检查。</p>
            </div>
            <button
              type="button"
              disabled={itemPermissionLoading}
              onClick={() => void loadItemPermissions()}
            >
              刷新事项授权
            </button>
          </div>
          {itemPermissionError ? <p role="alert">{itemPermissionError}</p> : null}
          {itemPermissions ? (
            <>
              <p className="receiver">
                读取：{itemPermissions.read ? '允许' : '关闭'} · 写入：
                {itemPermissions.write ? '允许' : '关闭'} · 提案：
                {itemPermissions.propose ? '允许' : '关闭'} · 实际端点接收：
                {itemPermissions.receive ? '允许' : '关闭'}
              </p>
              <p className="receiver">
                实际接收方：{itemPermissions.endpointDisplay ?? '未绑定可用端点'}
              </p>
            </>
          ) : null}
          {!itemPermissionLoading && !itemEnabled ? (
            <p className="scope-note">请在“事项”面板授予所需权限后，再刷新并开启本轮事项工具。</p>
          ) : null}
        </section>
      ) : null}

      <details className="capability-panel" open>
        <summary>当前端点能力</summary>
        {capability ? (
          <>
            <p className="receiver">
              {capability.endpointDisplay
                ? '实际端点：' + capability.endpointDisplay
                : '当前没有可确认的实际端点'}
            </p>
            <p className="scope-note">
              模型：{capability.model ?? '未绑定'} · 协议：{capability.protocol} · 适配版本：
              {capability.adapterVersion} · 模式：{capability.mode}
            </p>
            <p
              className={
                capability.toolsAvailable ? 'capability-reason' : 'capability-reason unavailable'
              }
            >
              {capability.reason}
            </p>
            <ul className="capability-list">
              {capability.evidence.map((item) => (
                <li key={item.capability}>
                  <strong>{capabilityLabels[item.capability]}</strong> · {item.level}（
                  {capabilityLevelLabels[item.level]}）
                  <small>
                    {item.observedAt
                      ? new Date(item.observedAt).toLocaleString('zh-CN') + ' · '
                      : '暂无验证时间 · '}
                    {item.detail}
                  </small>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </details>

      <section className="operation-panel" aria-label="可信工具回执">
        <div className="operation-heading">
          <div>
            <h3>可信工具回执</h3>
            <p className="scope-note">
              这里显示应用实际记录的工具状态；与助手最后回答分别保存和展示。
            </p>
          </div>
          {operationLoading ? <span>正在读取…</span> : null}
        </div>
        {operationError ? <p role="alert">{operationError}</p> : null}
        {!operationLoading && operations.length === 0 ? (
          <p className="scope-note">当前会话还没有工具回执。</p>
        ) : null}
        <div className="operation-list">
          {operations.map((operation) => (
            <article
              key={operation.operationId}
              className={'operation-card state-' + operation.state.toLowerCase()}
              aria-label={operationAriaLabel(operation.toolName)}
            >
              <div className="operation-title">
                <strong>{toolLabel(operation.toolName)}</strong>
                <span className="operation-state">
                  {operationStateText(
                    operation,
                    operation.memoryReceipt
                      ? (memoryConfirmations[operation.memoryReceipt.operationId]?.receipt ??
                          operation.memoryReceipt)
                      : undefined
                  )}
                </span>
              </div>
              <p>{operation.summary}</p>
              {operation.retentionIntent && onPrepareRetention ? (
                <div className="retention-tool-preview">
                  <p className="scope-note">
                    模型只准备了清理意图，不能代表你确认。打开后会按当前治理版本重新生成完整可信预览。
                  </p>
                  <button
                    type="button"
                    onClick={() => onPrepareRetention(operation.retentionIntent!)}
                  >
                    打开当前完整预览
                  </button>
                </div>
              ) : null}
              {operation.itemReceipt ? (
                <ItemReceiptCard
                  receipt={operation.itemReceipt}
                  onOpen={() => {
                    onItemChanged?.()
                    onOpenItems?.(
                      operation.itemReceipt?.state === 'PENDING_CONFIRMATION'
                        ? {
                            assistantId: operation.assistantId,
                            commandId: operation.itemReceipt.operationId,
                            ...(operation.toolName === 'prepare_item_update'
                              ? { confirmationAction: 'replace-content' as const }
                              : {})
                          }
                        : undefined
                    )
                  }}
                />
              ) : null}
              {operation.reminderPreview && reminderApi ? (
                <ReminderConversationCard
                  api={reminderApi}
                  operation={operation}
                  initial={operation.reminderPreview}
                  onRefresh={() => onRefreshOperation(operation.requestId)}
                  onChanged={onReminderChanged}
                />
              ) : operation.reminderReceipt ? (
                <ReminderReceiptCard receipt={operation.reminderReceipt} />
              ) : null}
              {operation.memoryReceipt ? (
                <MemoryReceiptCard
                  receipt={
                    memoryConfirmations[operation.memoryReceipt.operationId]?.receipt ??
                    operation.memoryReceipt
                  }
                  busy={memoryConfirmations[operation.memoryReceipt.operationId]?.busy ?? false}
                  error={memoryConfirmations[operation.memoryReceipt.operationId]?.error ?? ''}
                  onConfirm={(accept) =>
                    void confirmMemoryOperation(operation, operation.memoryReceipt!, accept)
                  }
                  onLocateRound={(source) => void onLocateMemorySource?.(source)}
                />
              ) : null}
              <small>
                操作编号：{operation.operationId} · 更新于
                {new Date(operation.updatedAt).toLocaleString('zh-CN')}
              </small>
              {operation.state === 'RESULT_UNKNOWN' ? (
                <button type="button" onClick={() => onRefreshOperation(operation.requestId)}>
                  核查本地状态
                </button>
              ) : null}
              {operation.citations.length > 0 ? (
                <div className="citation-list">
                  {operation.citations.map((citation) => (
                    <article key={citation.requestId} className="citation">
                      <p>{citation.excerpt || '原轮次没有可显示的摘录'}</p>
                      <small>
                        {new Date(citation.createdAt).toLocaleString('zh-CN')}
                        {citation.truncated ? ' · 摘录已截断' : ' · 完整摘录'}
                      </small>
                      <button type="button" onClick={() => onLocateCitation(citation)}>
                        定位原轮次
                      </button>
                    </article>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </section>
    </section>
  )
}
