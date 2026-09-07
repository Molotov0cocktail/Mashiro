import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  MemoryApi,
  MemoryPermissions,
  MemoryReceipt,
  MemoryRecord
} from '../../../../shared/memory-contract'
import type {
  RetentionChanged,
  RetentionIntent,
  RetentionPreview
} from '../../../../shared/retention-contract'

const protocolVersion = 1 as const

function localEventInput(instant: string | null): string {
  if (!instant) return ''
  const date = new Date(instant)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 23)
}

type ScopeFilter = 'all' | 'global' | 'assistant'
type KindFilter = 'all' | MemoryRecord['kind']
type PermissionField = 'read' | 'write' | 'writeInferences' | 'receive'
type RoundTarget = { assistantId: string; id: string }
type InspectData = Extract<Awaited<ReturnType<MemoryApi['inspect']>>, { ok: true }>['data']
type ReloadData = Extract<Awaited<ReturnType<MemoryApi['previewReload']>>, { ok: true }>['data']

const kindLabels: Record<MemoryRecord['kind'], string> = {
  user: '用户记忆',
  relationship: '关系记忆',
  continuity: '连续性记忆',
  event: '个人事件'
}
const natureLabels: Record<MemoryRecord['nature'], string> = {
  'user-statement': '用户陈述',
  'faithful-summary': '忠实归纳',
  inference: '推测'
}
const stateLabels: Record<MemoryRecord['state'], string> = {
  active: '生效中',
  pending: '待整理',
  suppressed: '已停止召回',
  'integrity-blocked': '完整性异常，已阻止使用'
}
const retentionLabels: Record<MemoryRecord['retention'], string> = {
  persistent: '持久区',
  staging: '暂存区',
  trash: '垃圾区'
}
const eventLabels: Record<NonNullable<MemoryRecord['event']>['status'], string> = {
  intention: '意向',
  planned: '计划中',
  arranged: '已安排',
  'reported-happened': '用户报告已发生',
  completed: '已完成',
  cancelled: '已取消',
  unknown: '状态未知'
}
const permissionLabels: Record<PermissionField, string> = {
  read: '允许助手读取',
  write: '允许正常对话写入',
  writeInferences: '允许正常对话写入推测',
  receive: '允许发送给当前实际接收方'
}

function memoryError(result: { error: { code: string; message: string } }): string {
  const prefix: Record<string, string> = {
    INVALID_INPUT: '输入不符合要求',
    NOT_FOUND: '记录不存在或已不可用',
    STALE_WRITE: '记录或授权已变化，请刷新后再操作',
    PERMISSION_DENIED: '当前领域授权不允许此操作',
    INTEGRITY: '正文完整性校验失败，已阻止读取或写入',
    CONFLICT: '同一操作位置已有不同业务操作',
    STORAGE_UNAVAILABLE: '本地记忆存储暂时不可用'
  }
  return (prefix[result.error.code] ?? '操作失败') + '：' + result.error.message
}

function newCommandId(): string {
  return crypto.randomUUID()
}

async function mutationRegistryKey(input: Parameters<MemoryApi['mutate']>[0]): Promise<string> {
  const payload = new TextEncoder().encode(JSON.stringify(input.mutation))
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', payload))
  const payloadSha256 = Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return JSON.stringify({
    domain: 'memory-mutation',
    assistantId: input.assistantId,
    targetId: input.mutation.targetId,
    payloadSha256
  })
}

function formatTime(value: string): string {
  return new Date(value).toLocaleString('zh-CN')
}

export function MemoryPanel({
  assistantId,
  assistantName,
  api,
  onLocateRound,
  refreshKey,
  pendingCommands,
  retentionChange,
  onPrepareRetention,
  configurationFocusNonce
}: {
  assistantId: string
  assistantName: string
  api: MemoryApi
  onLocateRound: (source: RoundTarget) => Promise<void>
  refreshKey?: number
  pendingCommands?: Map<string, string>
  retentionChange?: RetentionChanged | null
  onPrepareRetention?: (
    assistantId: string,
    target: RetentionIntent['target'],
    intent?: RetentionPreview['intent']
  ) => void
  configurationFocusNonce?: number | null
}): React.JSX.Element {
  const [records, setRecords] = useState<MemoryRecord[]>([])
  const [nextCursor, setNextCursor] = useState<number | null>(null)
  const [queryDraft, setQueryDraft] = useState('')
  const [appliedQuery, setAppliedQuery] = useState('')
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('all')
  const [kindFilter, setKindFilter] = useState<KindFilter>('all')
  const [includeTrash, setIncludeTrash] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [inspection, setInspection] = useState<InspectData | null>(null)
  const [inspectLoading, setInspectLoading] = useState(false)
  const [permissions, setPermissions] = useState<
    Partial<Record<'global' | 'assistant', MemoryPermissions>>
  >({})
  const [permissionLoading, setPermissionLoading] = useState(false)
  const [permissionError, setPermissionError] = useState('')

  useEffect(() => {
    if (
      configurationFocusNonce == null ||
      permissionLoading ||
      !permissions.global ||
      !permissions.assistant
    ) {
      return
    }
    const element = document.getElementById('memory-permissions')
    if (!element) return
    element.focus()
    element.scrollIntoView?.({ block: 'start' })
  }, [configurationFocusNonce, permissionLoading, permissions])

  const [action, setAction] = useState<'remember' | 'correct'>('remember')
  const [editTarget, setEditTarget] = useState<MemoryRecord | null>(null)
  const [title, setTitle] = useState('')
  const [markdown, setMarkdown] = useState('')
  const [kind, setKind] = useState<MemoryRecord['kind']>('user')
  const [scope, setScope] = useState<MemoryRecord['scope']>('global')
  const [nature, setNature] = useState<MemoryRecord['nature']>('user-statement')
  const [eventStatus, setEventStatus] =
    useState<NonNullable<MemoryRecord['event']>['status']>('unknown')
  const [occurredAt, setOccurredAt] = useState('')
  const [timeZone, setTimeZone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone)
  const [mutationBusy, setMutationBusy] = useState(false)
  const [pendingReceipt, setPendingReceipt] = useState<MemoryReceipt | null>(null)
  const [reloadPreview, setReloadPreview] = useState<ReloadData | null>(null)
  const localPendingCommands = useRef(new Map<string, string>())
  const readVersion = useRef(0)
  const inspectVersion = useRef(0)
  const permissionVersion = useRef(0)
  const governanceVersion = useRef(0)
  const lastRefreshKey = useRef(refreshKey)
  const lastAssistantId = useRef<string | undefined>(undefined)

  const loadRecords = useCallback(
    async (append = false, cursor?: number): Promise<void> => {
      if (!assistantId) return
      const version = ++readVersion.current
      setLoading(true)
      setError('')
      try {
        const result = await api.query({
          protocolVersion,
          assistantId,
          query: appliedQuery,
          scope: scopeFilter,
          kind: kindFilter,
          includeTrash,
          ...(append && cursor !== undefined ? { cursor } : {}),
          limit: 30
        })
        if (version !== readVersion.current) return
        if (!result.ok) {
          setError(memoryError(result))
          return
        }
        setRecords((current) =>
          append ? [...current, ...result.data.records] : result.data.records
        )
        setNextCursor(result.data.nextCursor)
      } catch {
        if (version === readVersion.current) setError('记忆列表暂时无法读取，已保留当前显示内容')
      } finally {
        if (version === readVersion.current) setLoading(false)
      }
    },
    [api, appliedQuery, assistantId, includeTrash, kindFilter, scopeFilter]
  )

  const loadInspection = useCallback(
    async (id: string): Promise<void> => {
      if (!assistantId || !id) return
      const version = ++inspectVersion.current
      setInspectLoading(true)
      setError('')
      try {
        const result = await api.inspect({ protocolVersion, assistantId, id })
        if (version !== inspectVersion.current) return
        if (!result.ok) {
          setError(memoryError(result))
          return
        }
        setInspection(result.data)
      } catch {
        if (version === inspectVersion.current) setError('记录详情暂时无法读取')
      } finally {
        if (version === inspectVersion.current) setInspectLoading(false)
      }
    },
    [api, assistantId]
  )

  const loadPermissions = useCallback(async (): Promise<void> => {
    if (!assistantId) return
    const version = ++permissionVersion.current
    setPermissionLoading(true)
    setPermissionError('')
    try {
      const [globalResult, assistantResult] = await Promise.all([
        api.permissions({ protocolVersion, assistantId, scope: 'global' }),
        api.permissions({ protocolVersion, assistantId, scope: 'assistant' })
      ])
      if (version !== permissionVersion.current) return
      if (!globalResult.ok) {
        setPermissionError(memoryError(globalResult))
        return
      }
      if (!assistantResult.ok) {
        setPermissionError(memoryError(assistantResult))
        return
      }
      setPermissions({ global: globalResult.data, assistant: assistantResult.data })
    } catch {
      if (version === permissionVersion.current) setPermissionError('记忆授权暂时无法读取')
    } finally {
      if (version === permissionVersion.current) setPermissionLoading(false)
    }
  }, [api, assistantId])

  useEffect(() => {
    readVersion.current += 1
    inspectVersion.current += 1
    permissionVersion.current += 1
    let active = true
    queueMicrotask(() => {
      if (!active) return
      const assistantChanged = lastAssistantId.current !== assistantId
      lastAssistantId.current = assistantId
      if (assistantChanged) {
        setRecords([])
        setNextCursor(null)
        setSelectedId('')
        setInspection(null)
        setPendingReceipt(null)
        setReloadPreview(null)
        setAction('remember')
        setTitle('')
        setMarkdown('')
        setNotice('')
        setError('')
      }
      if (!assistantId) return
      void loadRecords()
      void loadPermissions()
    })
    return () => {
      active = false
    }
  }, [
    assistantId,
    appliedQuery,
    scopeFilter,
    kindFilter,
    includeTrash,
    loadPermissions,
    loadRecords
  ])

  useEffect(() => {
    if (
      !retentionChange ||
      retentionChange.reason === 'job-status' ||
      !retentionChange.assistantIds.includes(assistantId)
    )
      return
    governanceVersion.current += 1
    readVersion.current += 1
    inspectVersion.current += 1
    permissionVersion.current += 1
    let active = true
    queueMicrotask(() => {
      if (!active) return
      setPendingReceipt(null)
      setReloadPreview(null)
      setInspection(null)
      setSelectedId('')
      if (retentionChange.reason === 'cleanup' || retentionChange.reason === 'purge') {
        setRecords([])
        setEditTarget(null)
        setAction('remember')
        setTitle('')
        setMarkdown('')
        setNotice('已按新的清理确认丢弃受影响的编辑、预览和本机正文缓存。')
      }
      if (assistantId) {
        void loadRecords()
        void loadPermissions()
      }
    })
    return () => {
      active = false
    }
  }, [assistantId, loadPermissions, loadRecords, retentionChange])

  useEffect(() => {
    if (refreshKey === undefined || lastRefreshKey.current === refreshKey) return
    lastRefreshKey.current = refreshKey
    if (!assistantId) return
    let active = true
    queueMicrotask(() => {
      if (!active) return
      void loadRecords()
      void loadPermissions()
      if (action === 'correct') {
        setNotice('列表与授权已刷新；正在编辑的版本未自动替换，保存时会校验版本以避免覆盖新修改。')
      }
    })
    return () => {
      active = false
    }
  }, [action, assistantId, loadPermissions, loadRecords, refreshKey])

  async function refreshAfterMutation(
    objectId: string,
    expectedGovernance = governanceVersion.current
  ): Promise<void> {
    await loadRecords()
    if (expectedGovernance !== governanceVersion.current) return
    setSelectedId(objectId)
    await loadInspection(objectId)
  }

  async function mutateTracked(
    input: Parameters<MemoryApi['mutate']>[0],
    expectedGovernance = governanceVersion.current
  ) {
    const registry = pendingCommands ?? localPendingCommands.current
    const key = await mutationRegistryKey(input)
    if (expectedGovernance !== governanceVersion.current) {
      throw new Error('Governance changed before dispatch')
    }
    const existing = registry.get(key)
    if (!existing && registry.size >= 64) throw new Error('Pending operation limit')
    const commandId = existing ?? input.commandId
    registry.set(key, commandId)
    const result = await api.mutate({ ...input, commandId })
    return {
      result,
      release: (): void => {
        if (
          expectedGovernance === governanceVersion.current &&
          result.ok &&
          registry.get(key) === commandId
        ) {
          registry.delete(key)
        }
      }
    }
  }

  async function submitWrite(): Promise<void> {
    if (!assistantId || !title.trim() || !markdown.trim()) return
    const target = action === 'correct' ? editTarget : null
    if (action === 'correct' && (!target || target.id !== selectedId)) return
    const governance = governanceVersion.current
    setMutationBusy(true)
    setError('')
    setNotice('')
    setPendingReceipt(null)
    try {
      const tracked = await mutateTracked(
        {
          protocolVersion,
          assistantId,
          commandId: newCommandId(),
          mutation: {
            action,
            targetId: target?.id ?? null,
            expectedVersion: target?.objectVersion ?? null,
            kind,
            scope: kind === 'relationship' || kind === 'continuity' ? 'assistant' : scope,
            title: title.trim(),
            markdown: markdown.trim(),
            nature,
            event:
              kind === 'event'
                ? {
                    status: eventStatus,
                    occurredAt:
                      target?.event && occurredAt === localEventInput(target.event.occurredAt)
                        ? target.event.occurredAt
                        : occurredAt
                          ? new Date(occurredAt).toISOString()
                          : null,
                    timeZone: timeZone.trim() || null
                  }
                : null
          }
        },
        governance
      )
      if (governance !== governanceVersion.current) return
      const result = tracked.result
      if (!result.ok) {
        setError(memoryError(result))
        return
      }
      tracked.release()
      setNotice(result.data.summary)
      await refreshAfterMutation(result.data.objectId, governance)
      if (governance !== governanceVersion.current) return
      if (action === 'remember') {
        setTitle('')
        setMarkdown('')
      }
    } catch {
      if (governance !== governanceVersion.current) return
      setError('写入回执未确认，请刷新记录核查；界面不会自动重试')
    } finally {
      setMutationBusy(false)
    }
  }

  async function requestRemoval(actionName: 'delete' | 'withdraw' | 'restore'): Promise<void> {
    const record = inspection?.record
    if (!record) return
    const governance = governanceVersion.current
    setMutationBusy(true)
    setError('')
    setNotice('')
    try {
      const tracked = await mutateTracked(
        {
          protocolVersion,
          assistantId,
          commandId: newCommandId(),
          mutation: {
            action: actionName,
            targetId: record.id,
            expectedVersion: record.objectVersion
          }
        },
        governance
      )
      if (governance !== governanceVersion.current) return
      const result = tracked.result
      if (!result.ok) {
        setError(memoryError(result))
        return
      }
      tracked.release()
      if (result.data.state === 'PENDING_CONFIRMATION') {
        setPendingReceipt(result.data)
        setNotice('操作尚未执行，请核对下面的范围后确认或取消。')
        return
      }
      setPendingReceipt(null)
      setNotice(result.data.summary)
      await refreshAfterMutation(result.data.objectId, governance)
    } catch {
      if (governance !== governanceVersion.current) return
      setError('操作回执未确认，请刷新记录核查；界面不会自动重试')
    } finally {
      setMutationBusy(false)
    }
  }

  async function confirmRemoval(accept: boolean): Promise<void> {
    if (!pendingReceipt?.confirmationId) return
    const governance = governanceVersion.current
    setMutationBusy(true)
    setError('')
    try {
      const result = await api.confirm({
        protocolVersion,
        assistantId,
        confirmationId: pendingReceipt.confirmationId,
        accept
      })
      if (governance !== governanceVersion.current) return
      if (!result.ok) {
        setError(memoryError(result))
        return
      }
      setPendingReceipt(null)
      setNotice(result.data.summary)
      if (accept && result.data.state === 'SUCCEEDED')
        await refreshAfterMutation(result.data.objectId, governance)
    } catch {
      if (governance !== governanceVersion.current) return
      setError('确认结果未返回，请刷新记录核查；界面不会自动重复确认')
    } finally {
      setMutationBusy(false)
    }
  }

  async function updatePermission(
    permissionScope: 'global' | 'assistant',
    field: PermissionField,
    checked: boolean
  ): Promise<void> {
    const current = permissions[permissionScope]
    if (!current) return
    const version = ++permissionVersion.current
    setPermissionLoading(true)
    setPermissionError('')
    try {
      const next = { ...current, [field]: checked }
      const result = await api.setPermissions({
        protocolVersion,
        assistantId,
        scope: permissionScope,
        expectedVersion: current.version,
        read: next.read,
        write: next.write,
        writeInferences: next.writeInferences,
        receive: next.receive
      })
      if (version !== permissionVersion.current) return
      if (!result.ok) {
        setPermissionError(memoryError(result))
        void loadPermissions()
        return
      }
      setPermissions((values) => ({ ...values, [permissionScope]: result.data }))
    } catch {
      if (version === permissionVersion.current)
        setPermissionError('授权更新结果未确认，请刷新后核查')
    } finally {
      if (version === permissionVersion.current) setPermissionLoading(false)
    }
  }

  async function previewReload(): Promise<void> {
    const record = inspection?.record
    if (!record) return
    const governance = governanceVersion.current
    setMutationBusy(true)
    setError('')
    setReloadPreview(null)
    try {
      const result = await api.previewReload({
        protocolVersion,
        assistantId,
        id: record.id,
        expectedVersion: record.objectVersion
      })
      if (governance !== governanceVersion.current) return
      if (!result.ok) setError(memoryError(result))
      else setReloadPreview(result.data)
    } catch {
      if (governance !== governanceVersion.current) return
      setError('无法读取外部修改候选，当前接受版本保持不变')
    } finally {
      setMutationBusy(false)
    }
  }

  async function acceptReload(): Promise<void> {
    if (!reloadPreview) return
    const governance = governanceVersion.current
    setMutationBusy(true)
    setError('')
    try {
      const result = await api.acceptReload({
        protocolVersion,
        assistantId,
        previewId: reloadPreview.previewId
      })
      if (governance !== governanceVersion.current) return
      if (!result.ok) {
        setError(memoryError(result))
        return
      }
      setReloadPreview(null)
      setNotice(result.data.summary)
      await refreshAfterMutation(result.data.objectId, governance)
    } catch {
      if (governance !== governanceVersion.current) return
      setError('重新载入回执未确认，请刷新记录核查；当前候选不会自动采用')
    } finally {
      setMutationBusy(false)
    }
  }

  function editRecord(record: MemoryRecord): void {
    setAction('correct')
    setEditTarget(record)
    setInspection(null)
    setPendingReceipt(null)
    setReloadPreview(null)
    setSelectedId(record.id)
    setTitle(record.title)
    setMarkdown(record.markdown)
    setKind(record.kind)
    setScope(record.scope)
    setNature(record.nature)
    if (record.event) {
      setEventStatus(record.event.status)
      setOccurredAt(localEventInput(record.event.occurredAt))
      setTimeZone(record.event.timeZone ?? '')
    }
    void loadInspection(record.id)
  }

  const deletedSourceAssistantIds = new Set(
    (inspection?.record as (MemoryRecord & { deletedSourceAssistantIds?: string[] }) | undefined)
      ?.deletedSourceAssistantIds ?? []
  )

  return (
    <section className="memory-panel" aria-labelledby="memory-heading">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">可追溯的本地长期信息</p>
          <h1 id="memory-heading">记忆与个人事件</h1>
        </div>
        <p className="privacy-note">当前助手：{assistantName || '请先创建助手'}</p>
      </div>
      <p className="scope-note">
        正常对话可在你授予对应领域写入权后直接记住、纠正或记录事件；可信回执才表示实际保存。严格临时交流不会读取或写入这里。
      </p>
      {error ? <p role="alert">{error}</p> : null}
      {notice ? <p role="status">{notice}</p> : null}

      <section
        id="memory-permissions"
        className="memory-permissions"
        aria-label="记忆授权"
        tabIndex={-1}
      >
        <div>
          <h2>助手与实际接收方授权</h2>
          <p className="scope-note">全局用户记忆和本助手私有记忆分别授权；新授权默认关闭。</p>
        </div>
        {permissionError ? <p role="alert">{permissionError}</p> : null}
        <div className="permission-grid">
          {(['global', 'assistant'] as const).map((permissionScope) => {
            const current = permissions[permissionScope]
            return (
              <fieldset key={permissionScope} disabled={permissionLoading || !current}>
                <legend>{permissionScope === 'global' ? '全局用户记忆' : '本助手私有记忆'}</legend>
                {(Object.keys(permissionLabels) as PermissionField[]).map((field) => (
                  <label className="inline-check" key={field}>
                    <input
                      type="checkbox"
                      checked={current?.[field] ?? false}
                      onChange={(event) =>
                        void updatePermission(permissionScope, field, event.currentTarget.checked)
                      }
                    />
                    {permissionLabels[field]}
                  </label>
                ))}
                <p className="receiver">
                  实际接收方：{current?.endpointDisplay ?? '当前没有可确认的实际接收方'}
                </p>
              </fieldset>
            )
          })}
        </div>
      </section>

      <div className="memory-grid">
        <section className="memory-browser" aria-label="浏览记忆与事件">
          <h2>浏览与搜索</h2>
          <form
            className="memory-search"
            onSubmit={(event) => {
              event.preventDefault()
              setAppliedQuery(queryDraft)
            }}
          >
            <label>
              字面搜索
              <input
                value={queryDraft}
                maxLength={200}
                onChange={(event) => setQueryDraft(event.currentTarget.value)}
              />
            </label>
            <label>
              归属范围
              <select
                value={scopeFilter}
                onChange={(event) => setScopeFilter(event.currentTarget.value as ScopeFilter)}
              >
                <option value="all">全部</option>
                <option value="global">全局用户记忆</option>
                <option value="assistant">本助手私有</option>
              </select>
            </label>
            <label>
              类型
              <select
                value={kindFilter}
                onChange={(event) => setKindFilter(event.currentTarget.value as KindFilter)}
              >
                <option value="all">全部</option>
                {Object.entries(kindLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="inline-check">
              <input
                type="checkbox"
                checked={includeTrash}
                onChange={(event) => setIncludeTrash(event.currentTarget.checked)}
              />
              包含垃圾区
            </label>
            <div className="button-row">
              <button type="submit" disabled={!assistantId || loading}>
                搜索
              </button>
              <button
                type="button"
                disabled={!appliedQuery || loading}
                onClick={() => {
                  setQueryDraft('')
                  setAppliedQuery('')
                }}
              >
                清除搜索
              </button>
              <button
                type="button"
                disabled={!assistantId || loading}
                onClick={() => void loadRecords()}
              >
                刷新
              </button>
            </div>
          </form>
          {loading && records.length === 0 ? <p>正在读取记忆…</p> : null}
          {!loading && records.length === 0 ? (
            <p className="scope-note">当前筛选下没有记录。</p>
          ) : null}
          <div className="memory-list">
            {records.map((record) => (
              <article
                key={record.id}
                className={selectedId === record.id ? 'memory-card selected' : 'memory-card'}
              >
                <div className="operation-title">
                  <strong>{record.title}</strong>
                  <span className="operation-state">{stateLabels[record.state]}</span>
                </div>
                <p className="memory-markdown">{record.markdown || '正文因完整性问题不可显示'}</p>
                <small>
                  {kindLabels[record.kind]} · {record.scope === 'global' ? '全局' : '本助手私有'} ·{' '}
                  {natureLabels[record.nature]} · v{record.objectVersion} ·{' '}
                  {retentionLabels[record.retention]}
                </small>
                {record.event ? (
                  <small>
                    事件状态：{eventLabels[record.event.status]}
                    {record.event.occurredAt ? ' · ' + formatTime(record.event.occurredAt) : ''}
                  </small>
                ) : null}
                <div className="button-row">
                  <button type="button" onClick={() => editRecord(record)}>
                    查看与纠正
                  </button>
                </div>
              </article>
            ))}
          </div>
          {nextCursor !== null ? (
            <button
              type="button"
              disabled={loading}
              onClick={() => void loadRecords(true, nextCursor)}
            >
              加载更多
            </button>
          ) : null}
        </section>

        <section className="memory-editor" aria-label="写入或纠正记忆">
          <div className="operation-title">
            <h2>{action === 'remember' ? '新增记忆或事件' : '纠正当前版本'}</h2>
            {action === 'correct' ? (
              <button
                type="button"
                onClick={() => {
                  setAction('remember')
                  setTitle('')
                  setMarkdown('')
                  setSelectedId('')
                  setInspection(null)
                  setReloadPreview(null)
                }}
              >
                改为新增
              </button>
            ) : null}
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void submitWrite()
            }}
          >
            <label>
              标题
              <input
                value={title}
                maxLength={160}
                onChange={(event) => setTitle(event.currentTarget.value)}
              />
            </label>
            <label>
              类型
              <select
                value={kind}
                onChange={(event) => {
                  const next = event.currentTarget.value as MemoryRecord['kind']
                  setKind(next)
                  if (next === 'relationship' || next === 'continuity') setScope('assistant')
                }}
              >
                {Object.entries(kindLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              归属
              <select
                value={scope}
                disabled={kind === 'relationship' || kind === 'continuity'}
                onChange={(event) => setScope(event.currentTarget.value as MemoryRecord['scope'])}
              >
                <option value="global">全局用户记忆</option>
                <option value="assistant">本助手私有</option>
              </select>
            </label>
            <label>
              性质
              <select
                value={nature}
                onChange={(event) => setNature(event.currentTarget.value as MemoryRecord['nature'])}
              >
                {Object.entries(natureLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {kind === 'event' ? (
              <fieldset className="event-fields">
                <legend>事件语义</legend>
                <label>
                  状态
                  <select
                    value={eventStatus}
                    onChange={(event) =>
                      setEventStatus(
                        event.currentTarget.value as NonNullable<MemoryRecord['event']>['status']
                      )
                    }
                  >
                    {Object.entries(eventLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  发生时间（本机时区，可空）
                  <input
                    type="datetime-local"
                    step="0.001"
                    value={occurredAt}
                    onChange={(event) => setOccurredAt(event.currentTarget.value)}
                  />
                </label>
                <label>
                  时区（可空）
                  <input
                    value={timeZone}
                    maxLength={100}
                    onChange={(event) => setTimeZone(event.currentTarget.value)}
                  />
                </label>
              </fieldset>
            ) : null}
            <label>
              Markdown 正文
              <textarea
                value={markdown}
                maxLength={16000}
                onChange={(event) => setMarkdown(event.currentTarget.value)}
              />
            </label>
            <p className="scope-note">
              这里按纯文本编辑 Markdown，不加载正文中的 HTML、脚本、本地文件或网络资源。
            </p>
            <button
              type="submit"
              disabled={!assistantId || mutationBusy || !title.trim() || !markdown.trim()}
            >
              {mutationBusy ? '正在处理…' : action === 'remember' ? '保存新记录' : '保存纠正版本'}
            </button>
          </form>

          {inspection ? (
            <section className="memory-inspection" aria-label="当前记录详情">
              <h3>当前记录 v{inspection.record.objectVersion}</h3>
              {inspection.record.state === 'integrity-blocked' ? (
                <p role="alert">
                  接受正文缺失或已被改动，当前记录已阻止召回和外发。请先预览外部修改。
                </p>
              ) : null}
              <div className="button-row">
                {inspection.record.retention !== 'trash' ? (
                  <>
                    <button
                      type="button"
                      disabled={mutationBusy}
                      onClick={() =>
                        onPrepareRetention?.(
                          assistantId,
                          {
                            type: 'memories',
                            objects: [
                              {
                                id: inspection.record.id,
                                version: inspection.record.objectVersion
                              }
                            ]
                          },
                          'delete-representation'
                        )
                      }
                    >
                      删除此表示
                    </button>
                    <button
                      type="button"
                      disabled={mutationBusy}
                      onClick={() =>
                        onPrepareRetention?.(
                          assistantId,
                          {
                            type: 'memories',
                            objects: [
                              {
                                id: inspection.record.id,
                                version: inspection.record.objectVersion
                              }
                            ]
                          },
                          'withdraw-information'
                        )
                      }
                    >
                      撤回来源与信息
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    disabled={mutationBusy}
                    onClick={() => void requestRemoval('restore')}
                  >
                    还原为新版本
                  </button>
                )}
                <button type="button" disabled={mutationBusy} onClick={() => void previewReload()}>
                  预览外部修改
                </button>
              </div>
              <p className="scope-note">
                删除与撤回会先进入“保留与清理”的完整可信预览；只有本机确认后才执行，并在作业区显示受管副本的真实清理状态。
              </p>
              {inspection.organizationPending ? (
                <p>此记录有真实待整理增量，尚未完成后台归并。</p>
              ) : null}
              {inspection.cleanupPending ? (
                <p>已撤回并停止使用；原文/历史副本清理待生命周期处理。</p>
              ) : null}
              <details>
                <summary>来源与变更</summary>
                <h4>来源</h4>
                {inspection.record.sources.length === 0 ? (
                  <p>没有可显示的来源。</p>
                ) : (
                  <ul>
                    {inspection.record.sources.map((source) => (
                      <li key={source.type + source.id + source.version}>
                        {source.type === 'round'
                          ? '正常对话轮次'
                          : source.type === 'user-round'
                            ? '本轮用户原话'
                            : source.type === 'memory'
                              ? '记忆版本'
                              : '用户在应用内创建'}{' '}
                        · v{source.version}
                        {deletedSourceAssistantIds.has(source.assistantId) ? (
                          <span>原助手已删除，私有原文不可展开</span>
                        ) : source.type === 'round' || source.type === 'user-round' ? (
                          <button type="button" onClick={() => void onLocateRound(source)}>
                            定位原轮次
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
                <h4>版本变更</h4>
                {inspection.changes.length === 0 ? (
                  <p>暂无变更记录。</p>
                ) : (
                  <ul>
                    {inspection.changes.map((change) => (
                      <li key={change.operationId}>
                        {change.action} · v{change.objectVersion} ·{' '}
                        {change.actor === 'user'
                          ? '用户'
                          : change.actor === 'background'
                            ? '后台整理'
                            : change.actor === 'steward'
                              ? '仓储员'
                              : '助手'}{' '}
                        · {formatTime(change.createdAt)}
                      </li>
                    ))}
                  </ul>
                )}
                <h4>可信业务回执</h4>
                {inspection.receipts.length === 0 ? (
                  <p>暂无回执。</p>
                ) : (
                  <ul>
                    {inspection.receipts.map((receipt) => (
                      <li key={receipt.operationId}>
                        {receipt.summary} · {receipt.state}
                      </li>
                    ))}
                  </ul>
                )}
                <h4>提供给模型的请求</h4>
                <p className="scope-note">
                  这里只表示应用曾把此版本提供给这些请求，不能证明模型实际使用了它。
                </p>
                {inspection.providedToRequests.length === 0 ? (
                  <p>尚无提供记录。</p>
                ) : (
                  <ul>
                    {inspection.providedToRequests.map((id) => (
                      <li key={id}>{id}</li>
                    ))}
                  </ul>
                )}
              </details>
            </section>
          ) : inspectLoading ? (
            <p>正在读取记录详情…</p>
          ) : null}

          {pendingReceipt ? (
            <section className="confirmation-card" aria-label="记忆删除确认">
              <h3>确认操作范围</h3>
              <p>{pendingReceipt.summary}</p>
              {pendingReceipt.impact ? (
                <section aria-label="本次操作影响">
                  <p>
                    受影响：{pendingReceipt.impact.totalMemories} 条记忆或事件 ·{' '}
                    {pendingReceipt.impact.totalRounds} 个来源或派生轮次
                  </p>
                  {pendingReceipt.impact.memoryIds.length > 0 ? (
                    <p className="scope-note">
                      记忆/事件编号：{pendingReceipt.impact.memoryIds.join('、')}
                    </p>
                  ) : null}
                  {pendingReceipt.impact.roundIds.length > 0 ? (
                    <p className="scope-note">
                      受影响轮次编号：{pendingReceipt.impact.roundIds.join('、')}
                    </p>
                  ) : null}
                  {pendingReceipt.impact.sourceRounds.length > 0 ? (
                    <div className="button-row">
                      {pendingReceipt.impact.sourceRounds.map((round) => (
                        <button
                          key={round.assistantId + round.requestId}
                          type="button"
                          onClick={() =>
                            void onLocateRound({
                              assistantId: round.assistantId,
                              id: round.requestId
                            })
                          }
                        >
                          定位受影响来源轮次
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {pendingReceipt.impact.truncated ? (
                    <p role="alert">影响数量超过当前预览上限；以上编号只是有界摘要。</p>
                  ) : null}
                </section>
              ) : null}
              <p className="scope-note">
                此时尚未删除或撤回。请只在范围符合你的意图时确认。确认时会重新核对完整影响集合；预览后新增派生会要求重新预览。
              </p>
              <div className="button-row">
                <button
                  type="button"
                  disabled={mutationBusy}
                  onClick={() => void confirmRemoval(true)}
                >
                  确认执行
                </button>
                <button
                  type="button"
                  disabled={mutationBusy}
                  onClick={() => void confirmRemoval(false)}
                >
                  取消操作
                </button>
              </div>
            </section>
          ) : null}

          {reloadPreview ? (
            <section className="reload-preview" aria-label="外部修改预览">
              <h3>外部修改尚未采用</h3>
              <p>{reloadPreview.warning}</p>
              <div className="reload-columns">
                <div>
                  <h4>当前接受正文</h4>
                  <pre>
                    {reloadPreview.currentMarkdown ??
                      '原接受文件已变化或缺失，无法作为可信当前正文显示'}
                  </pre>
                </div>
                <div>
                  <h4>磁盘候选正文</h4>
                  <pre>{reloadPreview.candidateMarkdown}</pre>
                </div>
              </div>
              <p className="scope-note">
                接纳只会创建新版本；正文或 frontmatter 不会扩大归属、来源或权限。
              </p>
              <div className="button-row">
                <button type="button" disabled={mutationBusy} onClick={() => void acceptReload()}>
                  接纳为新版本
                </button>
                <button
                  type="button"
                  disabled={mutationBusy}
                  onClick={() => setReloadPreview(null)}
                >
                  放弃候选
                </button>
              </div>
            </section>
          ) : null}
        </section>
      </div>
    </section>
  )
}
