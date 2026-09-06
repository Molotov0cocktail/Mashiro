import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  ItemApi,
  ItemContent,
  ItemPermissions,
  ItemProposal,
  ItemReceipt,
  ItemRecord,
  ItemSource
} from '../../../../shared/item-contract'
import type { RetentionChanged } from '../../../../shared/retention-contract'
import type { ReminderApi } from '../../../../shared/reminder-contract'
import { ReminderPanel } from '../reminders/ReminderPanel'

const protocolVersion = 1 as const
type ItemView = 'items' | 'proposals'
type ItemKind = ItemContent['kind']
type ItemStatus = ItemContent['status']
type Selection = { type: 'item' | 'proposal'; id: string }
type ItemPreviewData = Extract<Awaited<ReturnType<ItemApi['preview']>>, { ok: true }>['data']
type DiscussResult = Awaited<ReturnType<ItemApi['proposalAction']>>
type PendingCommand = { key: string; commandId: string; reused: boolean }
type ConfirmationAction = 'delete' | 'replace-links' | 'replace-content'
type RecoveryTarget = {
  assistantId: string
  commandId: string
  nonce: number
  confirmationAction?: Extract<ConfirmationAction, 'replace-content'>
}

const kindLabels: Record<ItemKind, string> = {
  goal: '目标',
  project: '项目',
  task: '任务',
  commitment: '承诺',
  waiting: '等待事项'
}

const statusLabels: Record<ItemKind, Record<ItemStatus, string>> = {
  goal: { open: '计划中', active: '进行中', completed: '已达成', cancelled: '已取消' },
  project: { open: '计划中', active: '进行中', completed: '已完成', cancelled: '已取消' },
  task: { open: '待办', active: '进行中', completed: '已完成', cancelled: '已取消' },
  commitment: { open: '待履行', active: '履行中', completed: '已履行', cancelled: '已取消' },
  waiting: { open: '待回应', active: '等待中', completed: '已收到', cancelled: '已取消' }
}

const proposalStateLabels: Record<ItemProposal['state'], string> = {
  DRAFT_PROPOSAL: '待确认',
  DISCUSSING: '协商中',
  DEFERRED: '已暂缓',
  ACCEPTED: '已接受',
  REJECTED: '已否决',
  STALE: '已失效'
}

const receiptStateLabels: Record<ItemReceipt['state'], string> = {
  SUCCEEDED: '已执行',
  PENDING_CONFIRMATION: '待本地确认',
  CANCELLED_BEFORE_DISPATCH: '已在执行前取消',
  SUPPRESSED: '已抑制重复建议',
  CONFIRMED_NOT_APPLIED: '已确认未执行',
  RESULT_UNKNOWN: '结果待核查'
}

function blankContent(): ItemContent {
  return {
    kind: 'task',
    title: '',
    description: '',
    status: 'open',
    dueAt: null,
    timeZone: null,
    parentId: null,
    relatedIds: [],
    counterpart: ''
  }
}

function sourceLabel(source: ItemSource): string {
  const labels: Record<ItemSource['type'], string> = {
    round: '对话轮次',
    'user-round': '用户轮次',
    memory: '记忆',
    manual: '手动创建',
    item: '正式事项',
    proposal: '事项提案'
  }
  return `${labels[source.type]} · ${source.id} · 版本 ${source.version}`
}

function contentValue(
  field: keyof ItemContent,
  value: ItemContent[keyof ItemContent],
  content: ItemContent
): string {
  if (field === 'kind') return kindLabels[value as ItemKind]
  if (field === 'status') return statusLabels[content.kind][value as ItemStatus]
  if (field === 'relatedIds') return (value as string[]).join('、') || '无'
  if (value === null || value === '') return '无'
  return String(value)
}

const contentFieldLabels: Record<keyof ItemContent, string> = {
  kind: '类型',
  title: '标题',
  description: '说明',
  status: '状态',
  dueAt: '期限',
  timeZone: '时区',
  parentId: '父事项',
  relatedIds: '相关事项',
  counterpart: '相关对象'
}

function changedContentFields(before: ItemContent, after: ItemContent): (keyof ItemContent)[] {
  return (Object.keys(contentFieldLabels) as (keyof ItemContent)[]).filter((field) =>
    field === 'relatedIds'
      ? before.relatedIds.join('\n') !== after.relatedIds.join('\n')
      : before[field] !== after[field]
  )
}
function parseRelations(value: string): string[] {
  return value
    .split(/[，,\n]/)
    .map((part) => part.trim())
    .filter(Boolean)
}

async function payloadDigest(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function ContentFields({
  content,
  onChange,
  titleLabel = '事项标题'
}: {
  content: ItemContent
  onChange: (content: ItemContent) => void
  titleLabel?: string
}): React.JSX.Element {
  return (
    <div className="item-form-grid">
      <label>
        类型
        <select
          aria-label="事项类型"
          value={content.kind}
          onChange={(event) => onChange({ ...content, kind: event.target.value as ItemKind })}
        >
          {Object.entries(kindLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label>
        {titleLabel}
        <input
          aria-label={titleLabel}
          maxLength={160}
          value={content.title}
          onChange={(event) => onChange({ ...content, title: event.target.value })}
        />
      </label>
      <label className="item-form-wide">
        说明
        <textarea
          aria-label="事项说明"
          maxLength={8000}
          value={content.description}
          onChange={(event) => onChange({ ...content, description: event.target.value })}
        />
      </label>
      <label>
        当前状态
        <select
          aria-label="事项状态"
          value={content.status}
          onChange={(event) => onChange({ ...content, status: event.target.value as ItemStatus })}
        >
          {Object.entries(statusLabels[content.kind]).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label>
        期限（含时区的 ISO 时间，可留空）
        <input
          aria-label="事项期限"
          placeholder="2026-09-12T15:00:00+08:00"
          value={content.dueAt ?? ''}
          onChange={(event) =>
            onChange({
              ...content,
              dueAt: event.target.value || null,
              timeZone: event.target.value ? (content.timeZone ?? 'Asia/Shanghai') : null
            })
          }
        />
      </label>
      <label>
        IANA 时区
        <input
          aria-label="事项时区"
          placeholder="Asia/Shanghai"
          disabled={content.dueAt === null}
          value={content.timeZone ?? ''}
          onChange={(event) => onChange({ ...content, timeZone: event.target.value || null })}
        />
      </label>
      <label>
        父事项 ID（可留空）
        <input
          aria-label="父事项 ID"
          value={content.parentId ?? ''}
          onChange={(event) =>
            onChange({ ...content, parentId: event.target.value.trim() || null })
          }
        />
      </label>
      <label className="item-form-wide">
        相关事项 ID（逗号或换行分隔）
        <textarea
          aria-label="相关事项 ID"
          value={content.relatedIds.join('\n')}
          onChange={(event) =>
            onChange({ ...content, relatedIds: parseRelations(event.target.value) })
          }
        />
      </label>
      <label className="item-form-wide">
        {content.kind === 'waiting' ? '等待谁回应' : '相关对象（可留空）'}
        <input
          aria-label="相关对象"
          maxLength={160}
          value={content.counterpart}
          onChange={(event) => onChange({ ...content, counterpart: event.target.value })}
        />
      </label>
    </div>
  )
}

function ItemContentDiff({
  before,
  after
}: {
  before: ItemContent
  after: ItemContent
}): React.JSX.Element {
  const fields = changedContentFields(before, after)
  return (
    <div className="item-content-diff">
      {fields.length === 0 ? <p>内容没有变化。</p> : null}
      <dl>
        {fields.map((field) => (
          <div key={field}>
            <dt>{contentFieldLabels[field]}</dt>
            <dd>
              <span>原值：{contentValue(field, before[field], before)}</span>
              <span>新值：{contentValue(field, after[field], after)}</span>
            </dd>
          </div>
        ))}
      </dl>
      <p className="scope-note">只有确认以上字段差异后，才会写入这个正式事项。</p>
    </div>
  )
}
function ReceiptNotice({ receipt }: { receipt: ItemReceipt }): React.JSX.Element {
  return (
    <section
      className={`item-receipt state-${receipt.state.toLowerCase()}`}
      aria-label="事项操作回执"
    >
      <strong>{receiptStateLabels[receipt.state]}</strong>
      <p>{receipt.summary}</p>
      <small>
        操作编号：{receipt.operationId}
        {receipt.objectId ? ` · 对象 ${receipt.objectId} · 版本 ${receipt.objectVersion}` : ''}
      </small>
    </section>
  )
}

export function ItemPanel({
  assistantId,
  assistantName,
  api,
  reminderApi,
  refreshKey = 0,
  reminderRefreshKey = 0,
  onDiscuss,
  onOpenConversation,
  onPermissionsChanged,
  onItemVersionChanged,
  pendingCommands,
  pendingReminderCommands,
  retentionChange,
  recoveryTarget,
  archivedAssistantIds = [],
  configurationFocusNonce,
  openItemTarget
}: {
  assistantId: string
  assistantName: string
  api: ItemApi
  reminderApi?: ReminderApi
  refreshKey?: number
  reminderRefreshKey?: number
  pendingCommands?: Map<string, string>
  pendingReminderCommands?: Map<string, string>
  retentionChange?: RetentionChanged | null
  recoveryTarget?: RecoveryTarget | null
  archivedAssistantIds?: readonly string[]
  onDiscuss?: (value: {
    originAssistantId: string
    proposalId: string
    expectedVersion: number
    commandId: string
    restoreArchived: boolean
  }) => Promise<DiscussResult | null>
  onOpenConversation?: (value: {
    assistantId: string
    itemId: string
    expectedVersion: number
  }) => void
  onPermissionsChanged?: (value: ItemPermissions) => void
  onItemVersionChanged?: (value: { assistantId: string; id: string; version: number }) => void
  configurationFocusNonce?: number | null
  openItemTarget?: { assistantId: string; itemId: string; nonce: number } | null
}): React.JSX.Element {
  const [localPendingCommands] = useState(() => new Map<string, string>())
  const commandRegistry = pendingCommands ?? localPendingCommands
  const [view, setView] = useState<ItemView>('items')
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<'all' | ItemKind>('all')
  const [status, setStatus] = useState<'all' | ItemStatus>('all')
  const [cursor, setCursor] = useState(0)
  const [cursorHistory, setCursorHistory] = useState<number[]>([])
  const [nextCursor, setNextCursor] = useState<number | null>(null)
  const [items, setItems] = useState<ItemRecord[]>([])
  const [proposals, setProposals] = useState<ItemProposal[]>([])
  const [formalCount, setFormalCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [receipt, setReceipt] = useState<ItemReceipt | null>(null)
  const [unknownCommandId, setUnknownCommandId] = useState('')
  const [selection, setSelection] = useState<Selection | null>(null)
  const [selectedItem, setSelectedItem] = useState<ItemRecord | null>(null)
  const [selectedProposal, setSelectedProposal] = useState<ItemProposal | null>(null)
  const [receipts, setReceipts] = useState<ItemReceipt[]>([])
  const [editor, setEditor] = useState<ItemContent>(blankContent)
  const [draft, setDraft] = useState<ItemContent>(blankContent)
  const [permissions, setPermissions] = useState<ItemPermissions | null>(null)
  const [permissionsBusy, setPermissionsBusy] = useState(false)

  useEffect(() => {
    if (configurationFocusNonce == null || permissionsBusy || !permissions) return
    const element = document.getElementById('item-permissions')
    if (!(element instanceof HTMLDetailsElement)) return
    element.open = true
    element.focus()
    element.scrollIntoView?.({ block: 'start' })
  }, [configurationFocusNonce, permissions, permissionsBusy])

  const [busyAction, setBusyAction] = useState('')
  const [settledProposalVersions, setSettledProposalVersions] = useState(() => new Set<string>())
  const [localRefresh, setLocalRefresh] = useState(0)
  const [confirmationPreview, setConfirmationPreview] = useState<ItemPreviewData>()
  const [confirmationAction, setConfirmationAction] = useState<ConfirmationAction | null>(null)
  const queryVersion = useRef(0)
  const inspectVersion = useRef(0)
  const permissionVersion = useRef(0)
  const operationGeneration = useRef(0)
  const reminderOpenVersion = useRef(0)

  const currentRows = view === 'items' ? items : proposals

  async function commandFor(
    action: string,
    payload: unknown,
    commandAssistantId = assistantId
  ): Promise<PendingCommand> {
    const payloadSha256 = await payloadDigest(payload)
    const key = JSON.stringify({
      domain: 'item-command',
      assistantId: commandAssistantId,
      action,
      payloadSha256
    })
    const existing = commandRegistry.get(key)
    if (existing) return { key, commandId: existing, reused: true }
    const commandId = crypto.randomUUID()
    commandRegistry.set(key, commandId)
    return { key, commandId, reused: false }
  }

  const isCurrentOperation = useCallback(
    (generation: number): boolean => generation === operationGeneration.current,
    []
  )

  const releaseCommand = useCallback(
    (command: PendingCommand): void => {
      if (commandRegistry.get(command.key) === command.commandId)
        commandRegistry.delete(command.key)
    },
    [commandRegistry]
  )

  const recoverableCommandId = useCallback(
    (commandAssistantId: string): string => {
      for (const [key, commandId] of commandRegistry) {
        try {
          const descriptor = JSON.parse(key) as { domain?: unknown; assistantId?: unknown }
          if (descriptor.domain === 'item-command' && descriptor.assistantId === commandAssistantId)
            return commandId
        } catch {
          continue
        }
      }
      return ''
    },
    [commandRegistry]
  )

  const registerRecoveredCommand = useCallback(
    (commandId: string, commandAssistantId = assistantId): PendingCommand => {
      const existing = [...commandRegistry].find(([, value]) => value === commandId)
      if (existing) return { key: existing[0], commandId, reused: true }
      const key = JSON.stringify({
        domain: 'item-command',
        assistantId: commandAssistantId,
        action: 'preview:recover',
        operationId: commandId
      })
      commandRegistry.set(key, commandId)
      return { key, commandId, reused: true }
    },
    [assistantId, commandRegistry]
  )

  const recoverConfirmation = useCallback(
    async (
      command: PendingCommand,
      generation: number,
      commandAssistantId = assistantId,
      actionHint?: ConfirmationAction
    ): Promise<void> => {
      try {
        const result = await api.preview({
          protocolVersion,
          assistantId: commandAssistantId,
          commandId: command.commandId,
          action: 'recover'
        })
        if (!isCurrentOperation(generation)) return
        if (!result.ok) {
          setError(result.error.message)
          if (result.error.code !== 'STORAGE_UNAVAILABLE') releaseCommand(command)
          return
        }
        let recoveredAction: ConfirmationAction = result.data.replacementContent
          ? 'replace-content'
          : 'delete'
        try {
          const descriptor = JSON.parse(command.key) as { action?: unknown }
          if (descriptor.action === 'preview:replace-links') recoveredAction = 'replace-links'
          if (descriptor.action === 'preview:replace-content') recoveredAction = 'replace-content'
        } catch {
          // Recovered external commands have no local payload; replacement content is shown in full.
        }
        setConfirmationAction(actionHint ?? recoveredAction)
        setConfirmationPreview(result.data)
        setReceipt(result.data.receipt)
        setUnknownCommandId('')
      } catch {
        if (!isCurrentOperation(generation)) return
        setUnknownCommandId(command.commandId)
        setError('原确认范围暂时无法恢复；同一操作仍保留，可稍后再次核查。')
      }
    },
    [api, assistantId, isCurrentOperation, releaseCommand]
  )

  async function shouldDispatch(
    command: PendingCommand,
    generation: number,
    commandAssistantId = assistantId
  ): Promise<boolean> {
    if (!command.reused) return true
    try {
      const result = await api.operation({
        protocolVersion,
        assistantId: commandAssistantId,
        commandId: command.commandId
      })
      if (!isCurrentOperation(generation)) return false
      if (!result.ok) {
        setError(result.error.message)
        return false
      }
      if (result.data.state === 'CONFIRMED_NOT_APPLIED') return true
      if (result.data.state === 'PENDING_CONFIRMATION' && result.data.confirmationId) {
        await recoverConfirmation(command, generation, commandAssistantId)
        return false
      }
      applyReceipt(result.data, command, generation)
      return false
    } catch {
      if (isCurrentOperation(generation)) {
        setUnknownCommandId(command.commandId)
        setError('本地状态仍无法核查；不会自动重放原操作。')
      }
      return false
    }
  }

  const load = useCallback(async (): Promise<void> => {
    if (!assistantId) return
    const requestVersion = ++queryVersion.current
    const requestAssistantId = assistantId
    setLoading(true)
    setError('')
    try {
      const result = await api.query({
        protocolVersion,
        assistantId: requestAssistantId,
        query,
        kind,
        status,
        view,
        cursor,
        limit: 30
      })
      if (requestVersion !== queryVersion.current || requestAssistantId !== assistantId) return
      if (!result.ok) {
        setError(result.error.message)
        return
      }
      setItems(result.data.items)
      setProposals(result.data.proposals)
      setFormalCount(result.data.formalCount)
      setNextCursor(result.data.nextCursor)
    } catch {
      if (requestVersion !== queryVersion.current || requestAssistantId !== assistantId) return
      setError('事项列表暂时无法读取，请稍后重试。')
    } finally {
      if (requestVersion === queryVersion.current && requestAssistantId === assistantId)
        setLoading(false)
    }
  }, [api, assistantId, cursor, kind, query, status, view])

  const loadPermissions = useCallback(async (): Promise<void> => {
    if (!assistantId) return
    const requestVersion = ++permissionVersion.current
    const requestAssistantId = assistantId
    try {
      const result = await api.permissions({ protocolVersion, assistantId: requestAssistantId })
      if (requestVersion !== permissionVersion.current || requestAssistantId !== assistantId) return
      if (result.ok) setPermissions(result.data)
      else setError(result.error.message)
    } catch {
      if (requestVersion === permissionVersion.current && requestAssistantId === assistantId)
        setError('事项权限暂时无法读取。')
    }
  }, [api, assistantId])

  useEffect(() => {
    queryVersion.current += 1
    inspectVersion.current += 1
    permissionVersion.current += 1
    operationGeneration.current += 1
    let active = true
    queueMicrotask(() => {
      if (!active) return
      setItems([])
      setProposals([])
      setFormalCount(0)
      setSelection(null)
      setSelectedItem(null)
      setSelectedProposal(null)
      setReceipts([])
      setEditor(blankContent())
      setDraft(blankContent())
      setConfirmationPreview(undefined)
      setConfirmationAction(null)
      setReceipt(null)
      setUnknownCommandId(recoverableCommandId(assistantId))
      setNotice('')
      setError('')
      setPermissions(null)
      setSettledProposalVersions(new Set())
      setCursor(0)
      setCursorHistory([])
      setBusyAction('')
      setPermissionsBusy(false)
    })
    return () => {
      active = false
      operationGeneration.current += 1
    }
  }, [assistantId, recoverableCommandId])

  useEffect(() => {
    if (
      !retentionChange ||
      retentionChange.reason === 'job-status' ||
      !retentionChange.assistantIds.includes(assistantId)
    )
      return
    queryVersion.current += 1
    inspectVersion.current += 1
    permissionVersion.current += 1
    operationGeneration.current += 1
    let active = true
    queueMicrotask(() => {
      if (!active) return
      setItems([])
      setProposals([])
      setFormalCount(0)
      setSelection(null)
      setSelectedItem(null)
      setSelectedProposal(null)
      setReceipts([])
      setEditor(blankContent())
      setDraft(blankContent())
      setConfirmationPreview(undefined)
      setConfirmationAction(null)
      setReceipt(null)
      setUnknownCommandId(recoverableCommandId(assistantId))
      setNotice('')
      setError('')
      setPermissions(null)
      setSettledProposalVersions(new Set())
      setCursor(0)
      setCursorHistory([])
      setBusyAction('')
      setPermissionsBusy(false)
      setLocalRefresh((value) => value + 1)
    })
    return () => {
      active = false
    }
  }, [assistantId, recoverableCommandId, retentionChange])

  useEffect(() => {
    let active = true
    queueMicrotask(() => {
      if (active) void load()
    })
    return () => {
      active = false
    }
  }, [load, localRefresh, refreshKey])

  useEffect(() => {
    let active = true
    queueMicrotask(() => {
      if (active) void loadPermissions()
    })
    return () => {
      active = false
    }
  }, [loadPermissions, refreshKey])

  useEffect(() => {
    if (!openItemTarget || openItemTarget.assistantId !== assistantId) return
    const openVersion = ++reminderOpenVersion.current
    // The new notification target also supersedes an older manual detail request.
    inspectVersion.current += 1
    const requestAssistantId = assistantId
    void Promise.all([
      api.permissions({ protocolVersion, assistantId: requestAssistantId }),
      api.inspect({
        protocolVersion,
        assistantId: requestAssistantId,
        id: openItemTarget.itemId,
        type: 'item'
      })
    ])
      .then(([permissionResult, inspectResult]) => {
        if (openVersion !== reminderOpenVersion.current || requestAssistantId !== assistantId)
          return
        if (!permissionResult.ok) {
          setError(permissionResult.error.message)
          return
        }
        if (!inspectResult.ok) {
          setError(inspectResult.error.message)
          return
        }
        if (!inspectResult.data.item) {
          setError('通知关联的正式事项已不存在或当前不可用。')
          return
        }
        setPermissions(permissionResult.data)
        setSelection({ type: 'item', id: inspectResult.data.item.id })
        setSelectedItem(inspectResult.data.item)
        setSelectedProposal(null)
        setReceipts(inspectResult.data.receipts)
        setEditor(inspectResult.data.item.content)
      })
      .catch(() => {
        if (openVersion === reminderOpenVersion.current && requestAssistantId === assistantId)
          setError('无法重新核验通知关联的当前事项与权限。')
      })
    return () => {
      reminderOpenVersion.current += 1
    }
  }, [api, assistantId, openItemTarget])

  useEffect(() => {
    if (!recoveryTarget || recoveryTarget.assistantId !== assistantId) return
    const generation = operationGeneration.current
    const command = registerRecoveredCommand(recoveryTarget.commandId)
    queueMicrotask(() => {
      if (isCurrentOperation(generation))
        void recoverConfirmation(
          command,
          generation,
          assistantId,
          recoveryTarget.confirmationAction
        )
    })
  }, [
    assistantId,
    isCurrentOperation,
    recoverConfirmation,
    recoveryTarget,
    registerRecoveredCommand
  ])

  async function inspect(next: Selection): Promise<void> {
    reminderOpenVersion.current += 1
    const requestVersion = ++inspectVersion.current
    const requestAssistantId = assistantId
    setSelection(next)
    setSelectedItem(null)
    setSelectedProposal(null)
    setReceipts([])
    setError('')
    try {
      const result = await api.inspect({
        protocolVersion,
        assistantId: requestAssistantId,
        id: next.id,
        type: next.type
      })
      if (requestVersion !== inspectVersion.current || requestAssistantId !== assistantId) return
      if (!result.ok) {
        setError(result.error.message)
        return
      }
      setSelectedItem(result.data.item)
      setSelectedProposal(result.data.proposal)
      setReceipts(result.data.receipts)
      const content = result.data.item?.content ?? result.data.proposal?.candidate
      if (content) setEditor(content)
    } catch {
      if (requestVersion === inspectVersion.current && requestAssistantId === assistantId)
        setError('事项详情暂时无法读取。')
    }
  }

  async function runMutation(
    actionKey: string,
    command: (generation: number) => Promise<void>
  ): Promise<void> {
    if (busyAction) return
    const generation = operationGeneration.current
    setBusyAction(actionKey)
    setError('')
    setNotice('')
    try {
      await command(generation)
    } finally {
      if (isCurrentOperation(generation)) setBusyAction('')
    }
  }

  function applyReceipt(
    next: ItemReceipt,
    command?: PendingCommand,
    generation = operationGeneration.current
  ): boolean {
    if (!isCurrentOperation(generation)) return false
    if (
      next.state === 'SUCCEEDED' &&
      next.objectType === 'item' &&
      next.objectId &&
      next.objectVersion > 0
    )
      onItemVersionChanged?.({ assistantId, id: next.objectId, version: next.objectVersion })
    setReceipt(next)
    setUnknownCommandId(next.state === 'RESULT_UNKNOWN' ? next.operationId : '')
    if (command && next.state !== 'RESULT_UNKNOWN' && next.state !== 'PENDING_CONFIRMATION')
      releaseCommand(command)
    if (next.state !== 'RESULT_UNKNOWN' && next.state !== 'PENDING_CONFIRMATION')
      setLocalRefresh((value) => value + 1)
    return true
  }

  function releaseCommandId(commandId: string): void {
    for (const [key, value] of commandRegistry) {
      if (value === commandId) commandRegistry.delete(key)
    }
  }

  function handleWriteError(
    result: Extract<Awaited<ReturnType<ItemApi['mutate']>>, { ok: false }>,
    command: PendingCommand
  ): void {
    setError(result.error.message)
    if (result.error.code !== 'STORAGE_UNAVAILABLE') releaseCommand(command)
  }

  async function createItem(): Promise<void> {
    if (!draft.title.trim()) return
    const content = { ...draft, title: draft.title.trim() }
    await runMutation('create', async (generation) => {
      const command = await commandFor('mutate:create', { action: 'create', content })
      if (!isCurrentOperation(generation)) return
      if (!(await shouldDispatch(command, generation))) return
      try {
        const result = await api.mutate({
          protocolVersion,
          assistantId,
          commandId: command.commandId,
          mutation: { action: 'create', content }
        })
        if (!isCurrentOperation(generation)) return
        if (!result.ok) {
          handleWriteError(result, command)
          return
        }
        applyReceipt(result.data, command, generation)
        if (result.data.state === 'SUCCEEDED') setDraft(blankContent())
      } catch {
        if (!isCurrentOperation(generation)) return
        setUnknownCommandId(command.commandId)
        setError('写入回执未确认；再次创建会先核查同一操作，不会直接重复写入。')
      }
    })
  }

  function removesExistingLink(current: ItemContent, next: ItemContent): boolean {
    if (current.parentId !== null && current.parentId !== next.parentId) return true
    const nextRelated = new Set(next.relatedIds)
    return current.relatedIds.some((id) => !nextRelated.has(id))
  }

  async function updateItem(content: ItemContent, statusOnly?: ItemStatus): Promise<void> {
    if (!selectedItem) return
    const current = selectedItem
    if (!statusOnly && removesExistingLink(current.content, content)) {
      await previewItem('replace-links', current, content)
      return
    }
    const mutation = statusOnly
      ? ({
          action: 'transition',
          id: current.id,
          expectedVersion: current.version,
          status: statusOnly
        } as const)
      : ({
          action: 'update',
          id: current.id,
          expectedVersion: current.version,
          content
        } as const)
    await runMutation('update', async (generation) => {
      const command = await commandFor(`mutate:${mutation.action}`, mutation)
      if (!isCurrentOperation(generation)) return
      if (!(await shouldDispatch(command, generation))) return
      try {
        const result = await api.mutate({
          protocolVersion,
          assistantId,
          commandId: command.commandId,
          mutation
        })
        if (!isCurrentOperation(generation)) return
        if (!result.ok) {
          handleWriteError(result, command)
          if (result.error.code === 'STALE_WRITE') {
            setNotice('事项已在别处更新，已重新读取当前版本；旧版本操作没有执行。')
            void inspect({ type: 'item', id: current.id })
            setLocalRefresh((value) => value + 1)
          }
          return
        }
        applyReceipt(result.data, command, generation)
        void inspect({ type: 'item', id: current.id })
      } catch {
        if (!isCurrentOperation(generation)) return
        setUnknownCommandId(command.commandId)
        setError('修改回执未确认；再次保存会先核查同一操作，不会直接重复提交。')
      }
    })
  }

  async function proposalAction(
    proposal: ItemProposal,
    action: 'accept' | 'reject' | 'defer' | 'resume' | 'discuss' | 'revise'
  ): Promise<void> {
    const commandAssistantId =
      action === 'discuss' || action === 'revise' ? proposal.originAssistantId : assistantId
    const actionPayload = {
      id: proposal.id,
      expectedVersion: proposal.version,
      action,
      ...(action === 'revise' ? { candidate: editor } : {})
    }
    await runMutation(`${action}:${proposal.id}`, async (generation) => {
      const command = await commandFor(`proposal:${action}`, actionPayload, commandAssistantId)
      if (!isCurrentOperation(generation)) return
      if (!(await shouldDispatch(command, generation, commandAssistantId))) return
      try {
        const result =
          action === 'discuss'
            ? await onDiscuss?.({
                originAssistantId: proposal.originAssistantId,
                proposalId: proposal.id,
                expectedVersion: proposal.version,
                commandId: command.commandId,
                restoreArchived: archivedAssistantIds.includes(proposal.originAssistantId)
              })
            : await api.proposalAction({
                protocolVersion,
                assistantId: commandAssistantId,
                commandId: command.commandId,
                id: proposal.id,
                expectedVersion: proposal.version,
                action,
                ...(action === 'revise' ? { candidate: editor } : {})
              })
        if (!result) {
          if (isCurrentOperation(generation)) setError('当前无法进入与发起助手的协商。')
          return
        }
        if (!result.ok) {
          if (isCurrentOperation(generation)) {
            setError(result.error.message)
            if (result.error.code !== 'STORAGE_UNAVAILABLE') releaseCommand(command)
            if (result.error.code === 'STALE_WRITE') {
              setNotice('提案版本已变化，旧版本操作没有执行；请检查最新内容。')
              void inspect({ type: 'proposal', id: proposal.id })
              setLocalRefresh((value) => value + 1)
            }
          }
          return
        }
        if (!isCurrentOperation(generation)) return
        if (action !== 'discuss' && result.data.state !== 'RESULT_UNKNOWN') releaseCommand(command)
        setSettledProposalVersions((values) => {
          const next = new Set(values)
          next.add(`${proposal.id}:${proposal.version}`)
          return next
        })
        applyReceipt(result.data, undefined, generation)
        if (action !== 'discuss') void inspect({ type: 'proposal', id: proposal.id })
      } catch {
        if (!isCurrentOperation(generation)) return
        setUnknownCommandId(command.commandId)
        setError('操作回执未确认；再次操作会先核查同一命令，不会直接重复执行。')
      }
    })
  }

  async function verifyUnknown(): Promise<void> {
    if (!unknownCommandId || busyAction) return
    const commandId = unknownCommandId
    await runMutation('verify', async (generation) => {
      try {
        const result = await api.operation({ protocolVersion, assistantId, commandId })
        if (!isCurrentOperation(generation)) return
        if (!result.ok) {
          setError(result.error.message)
          return
        }
        if (result.data.state === 'PENDING_CONFIRMATION' && result.data.confirmationId) {
          await recoverConfirmation(registerRecoveredCommand(commandId), generation)
          return
        }
        if (applyReceipt(result.data, undefined, generation)) {
          if (result.data.state !== 'RESULT_UNKNOWN') releaseCommandId(commandId)
        }
      } catch {
        if (isCurrentOperation(generation)) setError('本地状态仍无法核查；不会自动重放原操作。')
      }
    })
  }

  async function previewItem(
    action: 'delete' | 'replace-links',
    target: ItemRecord,
    content?: ItemContent
  ): Promise<void> {
    const targets = [{ id: target.id, expectedVersion: target.version }]
    const previewInput =
      action === 'replace-links'
        ? { action, targets, content: content ?? target.content }
        : { action, targets }
    await runMutation(`preview-${action}`, async (generation) => {
      const command = await commandFor(`preview:${action}`, previewInput)
      if (!isCurrentOperation(generation)) return
      if (!(await shouldDispatch(command, generation))) return
      try {
        const result = await api.preview({
          protocolVersion,
          assistantId,
          commandId: command.commandId,
          ...previewInput
        })
        if (!isCurrentOperation(generation)) return
        if (!result.ok) {
          setError(result.error.message)
          if (result.error.code !== 'STORAGE_UNAVAILABLE') releaseCommand(command)
          return
        }
        setConfirmationAction(action)
        setConfirmationPreview(result.data)
        setReceipt(result.data.receipt)
      } catch {
        if (!isCurrentOperation(generation)) return
        setUnknownCommandId(command.commandId)
        setError('确认预览结果未知；再次操作会先核查同一命令。')
      }
    })
  }

  async function previewDelete(): Promise<void> {
    if (selectedItem) await previewItem('delete', selectedItem)
  }

  async function confirmPreview(accept: boolean): Promise<void> {
    if (!confirmationPreview) return
    const preview = confirmationPreview
    const commandEntry = [...commandRegistry].find(
      ([, commandId]) => commandId === preview.receipt.operationId
    )
    const command = commandEntry
      ? { key: commandEntry[0], commandId: commandEntry[1], reused: true }
      : undefined
    await runMutation('confirm-preview', async (generation) => {
      try {
        const result = await api.confirm({
          protocolVersion,
          assistantId,
          confirmationId: preview.confirmationId,
          accept
        })
        if (!isCurrentOperation(generation)) return
        if (!result.ok) {
          setError(result.error.message)
          return
        }
        if (command && result.data.state !== 'RESULT_UNKNOWN') releaseCommand(command)
        applyReceipt(result.data, undefined, generation)
        setConfirmationPreview(undefined)
        setConfirmationAction(null)
        if (accept && result.data.state === 'SUCCEEDED') {
          const replacedLinks = Boolean(preview.replacementContent)
          if (replacedLinks) {
            void inspect({ type: 'item', id: preview.targets[0]!.id })
          } else {
            setSelection(null)
            setSelectedItem(null)
          }
        }
      } catch {
        if (isCurrentOperation(generation))
          setError('确认回执未返回；将保留本次确认，可再次提交同一确认编号。')
      }
    })
  }

  async function savePermissions(): Promise<void> {
    if (!permissions || permissionsBusy) return
    const generation = operationGeneration.current
    setPermissionsBusy(true)
    setError('')
    try {
      const result = await api.setPermissions({
        protocolVersion,
        assistantId,
        expectedVersion: permissions.version,
        read: permissions.read,
        write: permissions.write,
        propose: permissions.propose,
        receive: permissions.receive
      })
      if (!isCurrentOperation(generation)) return
      if (result.ok) {
        setPermissions(result.data)
        onPermissionsChanged?.(result.data)
        setNotice('事项权限已保存；后续读取、写入、提案和实际端点接收会分别检查。')
        setLocalRefresh((value) => value + 1)
      } else {
        setError(result.error.message)
        if (result.error.code === 'STALE_WRITE') void loadPermissions()
      }
    } catch {
      if (isCurrentOperation(generation)) setError('事项权限保存结果未确认，请重新读取后再决定。')
    } finally {
      if (isCurrentOperation(generation)) setPermissionsBusy(false)
    }
  }

  const transitionChoices = useMemo(() => {
    if (!selectedItem) return []
    const current = selectedItem.content.status
    const choices: ItemStatus[] = []
    if (current !== 'active') choices.push('active')
    if (current !== 'completed') choices.push('completed')
    if (current !== 'cancelled') choices.push('cancelled')
    if (current === 'completed' || current === 'cancelled') choices.unshift('open')
    return choices
  }, [selectedItem])

  return (
    <section className="item-panel" aria-label="事项与提案">
      <div className="item-heading">
        <div>
          <h2>事项</h2>
          <p className="scope-note">
            {assistantName || '当前助手'} · {formalCount} 个正式事项
          </p>
        </div>
        <button type="button" onClick={() => setLocalRefresh((value) => value + 1)}>
          刷新
        </button>
      </div>
      <nav className="item-tabs" aria-label="事项区域" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={view === 'items'}
          onClick={() => {
            setView('items')
            setCursor(0)
            setCursorHistory([])
          }}
        >
          正式事项
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'proposals'}
          onClick={() => {
            setView('proposals')
            setCursor(0)
            setCursorHistory([])
          }}
        >
          待确认
        </button>
      </nav>
      <details id="item-permissions" className="item-permissions" tabIndex={-1}>
        <summary>事项权限与实际接收方</summary>
        {permissions ? (
          <div className="item-permission-grid">
            {(
              [
                ['read', '允许此助手读取正式事项与提案'],
                ['write', '允许此助手执行明确的事项写入'],
                ['propose', '允许此助手保存待确认建议'],
                ['receive', '允许当前实际 Provider 端点接收事项上下文']
              ] as const
            ).map(([field, label]) => (
              <label key={field} className="inline-check">
                <input
                  type="checkbox"
                  checked={permissions[field]}
                  onChange={(event) =>
                    setPermissions({ ...permissions, [field]: event.target.checked })
                  }
                />
                {label}
              </label>
            ))}
            <p className="receiver">
              实际接收方：{permissions.endpointDisplay ?? '未绑定可用端点'}
            </p>
            <p className="scope-note">读取、写入、提案和端点接收是四项独立权限。</p>
            <button type="button" disabled={permissionsBusy} onClick={() => void savePermissions()}>
              保存事项权限
            </button>
          </div>
        ) : (
          <p>正在读取权限…</p>
        )}
      </details>
      {view === 'items' ? (
        <details className="item-create">
          <summary>新建正式事项</summary>
          <p className="scope-note">这是本地明确创建入口；推测内容应留在“待确认”。</p>
          <ContentFields content={draft} onChange={setDraft} />
          <button
            type="button"
            disabled={!draft.title.trim() || Boolean(busyAction)}
            onClick={() => void createItem()}
          >
            创建正式事项
          </button>
        </details>
      ) : null}
      <section className="item-browser" aria-label={view === 'items' ? '正式事项列表' : '提案列表'}>
        <form
          className="item-filters"
          onSubmit={(event) => {
            event.preventDefault()
            setCursor(0)
            setCursorHistory([])
            setLocalRefresh((value) => value + 1)
          }}
        >
          <label>
            搜索
            <input value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
          <label>
            类型筛选
            <select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}>
              <option value="all">全部类型</option>
              {Object.entries(kindLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            状态筛选
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as typeof status)}
            >
              <option value="all">全部状态</option>
              <option value="open">未开始</option>
              <option value="active">进行中</option>
              <option value="completed">已完成</option>
              <option value="cancelled">已取消</option>
            </select>
          </label>
          <button type="submit">应用筛选</button>
        </form>

        {loading ? <p>正在读取事项…</p> : null}
        {!loading && currentRows.length === 0 ? (
          <p>{view === 'items' ? '没有符合筛选条件的正式事项。' : '当前没有待处理提案。'}</p>
        ) : null}
        <div className="item-list">
          {view === 'items'
            ? items.map((item) => (
                <article
                  key={item.id}
                  className="item-card"
                  aria-label={`正式事项：${item.content.title}`}
                >
                  <div className="item-card-heading">
                    <div>
                      <small>{kindLabels[item.content.kind]}</small>
                      <h3>{item.content.title}</h3>
                    </div>
                    <span>{statusLabels[item.content.kind][item.content.status]}</span>
                  </div>
                  {item.content.description ? <p>{item.content.description}</p> : null}
                  <small>
                    版本 {item.version}
                    {item.content.dueAt
                      ? ` · 期限 ${new Date(item.content.dueAt).toLocaleString('zh-CN')} (${item.content.timeZone})`
                      : ''}
                  </small>
                  <div className="button-row">
                    <button
                      type="button"
                      onClick={() =>
                        onOpenConversation?.({
                          assistantId,
                          itemId: item.id,
                          expectedVersion: item.version
                        })
                      }
                    >
                      在对话中处理
                    </button>
                    <button
                      type="button"
                      onClick={() => void inspect({ type: 'item', id: item.id })}
                    >
                      查看与编辑
                    </button>
                  </div>
                </article>
              ))
            : proposals.map((proposal) => {
                const actionable =
                  !settledProposalVersions.has(`${proposal.id}:${proposal.version}`) &&
                  (proposal.state === 'DRAFT_PROPOSAL' ||
                    proposal.state === 'DISCUSSING' ||
                    proposal.state === 'DEFERRED')
                return (
                  <article
                    key={proposal.id}
                    className="item-card proposal-card"
                    aria-label={`待确认提案：${proposal.candidate.title}`}
                  >
                    <div className="item-card-heading">
                      <div>
                        <small>{kindLabels[proposal.candidate.kind]}</small>
                        <h3>{proposal.candidate.title}</h3>
                      </div>
                      <span>{proposalStateLabels[proposal.state]}</span>
                    </div>
                    <p className="proposal-boundary">建议，尚未成为正式事项</p>
                    {proposal.candidate.description ? (
                      <p>{proposal.candidate.description}</p>
                    ) : null}
                    <small>提案版本 {proposal.version}</small>
                    {proposal.sourceUnavailable ? (
                      <p className="scope-note">部分来源已撤回或删除，不能展开原私有正文。</p>
                    ) : null}
                    <div className="button-row">
                      <button
                        type="button"
                        disabled={!actionable || Boolean(busyAction)}
                        onClick={() => void proposalAction(proposal, 'accept')}
                      >
                        接受为正式事项
                      </button>
                      <button
                        type="button"
                        disabled={!actionable || Boolean(busyAction)}
                        onClick={() => void proposalAction(proposal, 'reject')}
                      >
                        否决
                      </button>
                      {proposal.state === 'DEFERRED' ? (
                        <button
                          type="button"
                          disabled={Boolean(busyAction)}
                          onClick={() => void proposalAction(proposal, 'resume')}
                        >
                          继续处理
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={!actionable || Boolean(busyAction)}
                          onClick={() => void proposalAction(proposal, 'defer')}
                        >
                          暂缓
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={!actionable || Boolean(busyAction)}
                        onClick={() => void proposalAction(proposal, 'discuss')}
                      >
                        {archivedAssistantIds.includes(proposal.originAssistantId)
                          ? '恢复原助手并协商'
                          : '与发起助手协商'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void inspect({ type: 'proposal', id: proposal.id })}
                      >
                        查看与修改建议
                      </button>
                    </div>
                    {proposal.acceptedItemId ? (
                      <p>已形成正式事项：{proposal.acceptedItemId}</p>
                    ) : null}
                  </article>
                )
              })}
        </div>
        <div className="button-row">
          <button
            type="button"
            disabled={cursorHistory.length === 0}
            onClick={() => {
              const previous = cursorHistory.at(-1)
              if (previous === undefined) return
              setCursorHistory((values) => values.slice(0, -1))
              setCursor(previous)
            }}
          >
            上一页
          </button>
          <button
            type="button"
            disabled={nextCursor === null}
            onClick={() => {
              if (nextCursor === null) return
              setCursorHistory((values) => [...values, cursor])
              setCursor(nextCursor)
            }}
          >
            下一页
          </button>
        </div>
      </section>
      {selectedItem || selectedProposal ? (
        <section className="item-detail" aria-label="事项详情">
          <div className="item-heading">
            <div>
              <h3>{selectedItem ? '编辑正式事项' : '修改待确认建议'}</h3>
              <small>
                对象 {selection?.id} · 版本 {selectedItem?.version ?? selectedProposal?.version}
              </small>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelection(null)
                setSelectedItem(null)
                setSelectedProposal(null)
              }}
            >
              关闭详情
            </button>
          </div>
          <ContentFields content={editor} onChange={setEditor} titleLabel="编辑标题" />
          {selectedItem ? (
            <>
              <div className="button-row">
                <button
                  type="button"
                  onClick={() =>
                    onOpenConversation?.({
                      assistantId,
                      itemId: selectedItem.id,
                      expectedVersion: selectedItem.version
                    })
                  }
                >
                  在对话中处理
                </button>
                <button
                  type="button"
                  disabled={Boolean(busyAction)}
                  onClick={() => void updateItem(editor)}
                >
                  保存修改
                </button>
                {transitionChoices.map((nextStatus) => (
                  <button
                    type="button"
                    key={nextStatus}
                    disabled={Boolean(busyAction)}
                    onClick={() => void updateItem(editor, nextStatus)}
                  >
                    {nextStatus === 'open'
                      ? '重新打开'
                      : `标为${statusLabels[selectedItem.content.kind][nextStatus]}`}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={Boolean(busyAction)}
                  onClick={() => void previewDelete()}
                >
                  永久删除此事项
                </button>
              </div>
              {reminderApi ? (
                <ReminderPanel
                  assistantId={assistantId}
                  assistantName={assistantName}
                  api={reminderApi}
                  itemApi={api}
                  item={selectedItem}
                  refreshKey={reminderRefreshKey}
                  pendingCommands={pendingReminderCommands}
                />
              ) : null}
            </>
          ) : selectedProposal ? (
            <>
              {selectedProposal.originAssistantId !== assistantId ? (
                <p className="scope-note">
                  只有发起这个提案的助手可以保存修改；可先从提案卡进入协商。
                </p>
              ) : null}
              <button
                type="button"
                disabled={Boolean(busyAction) || selectedProposal.originAssistantId !== assistantId}
                onClick={() => void proposalAction(selectedProposal, 'revise')}
              >
                保存建议修改
              </button>
            </>
          ) : null}

          <details className="item-governance">
            <summary>来源与治理记录</summary>
            {(selectedItem?.sourceUnavailable ?? selectedProposal?.sourceUnavailable) ? (
              <p className="scope-note">部分来源已撤回或原助手已删除，不能展开原私有正文。</p>
            ) : null}
            {(selectedItem?.sources ?? selectedProposal?.sources ?? []).length === 0 ? (
              <p>没有可显示的来源。</p>
            ) : (
              <ul>
                {(selectedItem?.sources ?? selectedProposal?.sources ?? []).map((source) => (
                  <li key={`${source.type}:${source.id}:${source.version}`}>
                    {sourceLabel(source)}
                  </li>
                ))}
              </ul>
            )}
            {receipts.length > 0 ? (
              <div>
                <h4>历史操作回执</h4>
                {receipts.map((entry) => (
                  <ReceiptNotice key={entry.operationId} receipt={entry} />
                ))}
              </div>
            ) : null}
          </details>
        </section>
      ) : null}
      {confirmationPreview ? (
        <section
          className="item-delete-confirmation"
          role="region"
          aria-label={
            confirmationAction === 'replace-content'
              ? '事项修改确认'
              : confirmationAction === 'replace-links'
                ? '事项关联变更确认'
                : '事项删除确认'
          }
        >
          <h3>
            {confirmationAction === 'replace-content'
              ? '确认修改正式事项'
              : confirmationAction === 'replace-links'
                ? '确认移除已有事项关联'
                : '确认永久删除'}
          </h3>
          <p>{confirmationPreview.receipt.summary}</p>
          <ul>
            {confirmationPreview.targets.map((target) => (
              <li key={target.id}>
                {kindLabels[target.content.kind]}：{target.content.title}（对象 {target.id} · 版本{' '}
                {target.version}）
              </li>
            ))}
          </ul>
          {confirmationPreview.replacementContent && confirmationPreview.targets[0] ? (
            <>
              <ItemContentDiff
                before={confirmationPreview.targets[0].content}
                after={confirmationPreview.replacementContent}
              />
              {confirmationAction === 'replace-links' ? (
                <p className="scope-note">这次保存会同时应用上面列出的内容与关联差异。</p>
              ) : null}
            </>
          ) : (
            <p>{confirmationPreview.relatedItemIds.length} 个关联事项不会被级联删除。</p>
          )}{' '}
          <div className="button-row">
            <button
              type="button"
              disabled={Boolean(busyAction)}
              onClick={() => void confirmPreview(true)}
            >
              {confirmationAction === 'replace-content'
                ? '确认修改此事项'
                : confirmationAction === 'replace-links'
                  ? '确认移除关联并保存'
                  : '确认永久删除'}
            </button>
            <button
              type="button"
              disabled={Boolean(busyAction)}
              onClick={() => void confirmPreview(false)}
            >
              取消
            </button>
          </div>
        </section>
      ) : null}{' '}
      {receipt ? <ReceiptNotice receipt={receipt} /> : null}
      {unknownCommandId ? (
        <button type="button" disabled={Boolean(busyAction)} onClick={() => void verifyUnknown()}>
          核查本地状态
        </button>
      ) : null}
      {notice ? <p role="status">{notice}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
    </section>
  )
}
