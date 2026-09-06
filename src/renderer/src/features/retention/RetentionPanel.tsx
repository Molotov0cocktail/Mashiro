import { useCallback, useEffect, useRef, useState } from 'react'
import type { AssistantSnapshot } from '../../../../shared/assistant-contract'
import type { MemoryApi, MemoryRecord } from '../../../../shared/memory-contract'
import type {
  RetentionApi,
  RetentionChanged,
  RetentionIntent,
  RetentionJob,
  RetentionPreview
} from '../../../../shared/retention-contract'

const protocolVersion = 1 as const
type Target = RetentionIntent['target']
type Overview = Extract<Awaited<ReturnType<RetentionApi['overview']>>, { ok: true }>['data']
type ConversationTarget = Target

const intentLabels: Record<RetentionPreview['intent'], string> = {
  'delete-representation': '删除这份表示',
  'withdraw-information': '撤回信息及派生副本',
  'recycle-original': '整理回收原文',
  'restore-original': '恢复已回收原文',
  'empty-trash': '永久清理垃圾区',
  'purge-assistant': '永久删除助手'
}
const zoneLabels: Record<MemoryRecord['retention'], string> = {
  persistent: '持久区',
  staging: '暂存区',
  trash: '垃圾区'
}
const memoryKindLabels: Record<MemoryRecord['kind'], string> = {
  user: '用户记忆',
  relationship: '关系记忆',
  continuity: '连续性记忆',
  event: '事件'
}
const jobLabels: Record<RetentionJob['state'], string> = {
  CLEANUP_PENDING: '已停止使用，等待清理',
  CLEANING: '正在清理受管副本',
  FAILED_RETRYABLE: '清理失败，可重试',
  COMPLETED: '受管副本清理完成'
}

function retentionError(result: { error: { code: string; message: string } }): string {
  const labels: Record<string, string> = {
    INVALID_INPUT: '输入不符合要求',
    NOT_FOUND: '对象或预览已不存在',
    STALE_PREVIEW: '预览已过期，请重新预览',
    PERMISSION_DENIED: '当前权限不允许此操作',
    DEPENDENCY_BLOCKED: '依赖尚未满足',
    NOT_RECOVERABLE: '正文已经清理，不能恢复',
    CONFLICT: '同一位置已有不同操作',
    STORAGE_UNAVAILABLE: '本地数据存储暂时不可用'
  }
  return `${labels[result.error.code] ?? '操作失败'}：${result.error.message}`
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`
  return `${(value / 1024 / 1024).toFixed(1)} MiB`
}

export function RetentionPanel({
  api,
  memoryApi,
  assistantSnapshot,
  fallbackAssistantId,
  preparedTarget,
  changed,
  pendingCommands,
  onRefreshAssistants
}: {
  api: RetentionApi
  memoryApi: MemoryApi
  assistantSnapshot: AssistantSnapshot | null
  fallbackAssistantId: string
  preparedTarget?: {
    assistantId: string
    target: ConversationTarget
    intent?: RetentionPreview['intent']
    nonce: number
  } | null
  changed?: RetentionChanged | null
  pendingCommands: Map<string, string>
  onRefreshAssistants: () => Promise<void>
}): React.JSX.Element {
  const currentAssistantId = assistantSnapshot?.currentAssistantId ?? fallbackAssistantId
  const [assistantId, setAssistantId] = useState(currentAssistantId)
  const [overview, setOverview] = useState<Overview | null>(null)
  const [records, setRecords] = useState<MemoryRecord[]>([])
  const [nextCursor, setNextCursor] = useState<number | null>(null)
  const [selectedMemoryIds, setSelectedMemoryIds] = useState<string[]>([])
  const [intent, setIntent] = useState<RetentionPreview['intent']>('delete-representation')
  const [conversationTarget, setConversationTarget] = useState<ConversationTarget>({
    type: 'timeline'
  })
  const [hasPreparedConversationTarget, setHasPreparedConversationTarget] = useState(false)
  const [purgeAssistantId, setPurgeAssistantId] = useState(currentAssistantId)
  const [replacementAssistantId, setReplacementAssistantId] = useState<string>('')
  const [preview, setPreview] = useState<RetentionPreview | null>(null)
  const [understood, setUnderstood] = useState(false)
  const [jobs, setJobs] = useState<RetentionJob[]>([])
  const [jobNextCursor, setJobNextCursor] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const readVersion = useRef(0)
  const previewVersion = useRef(0)
  const actionVersion = useRef(0)
  const lastPreparedNonce = useRef(0)

  useEffect(() => {
    let active = true
    queueMicrotask(() => {
      if (active && currentAssistantId) {
        setAssistantId(currentAssistantId)
        setHasPreparedConversationTarget(false)
      }
    })
    return () => {
      active = false
    }
  }, [currentAssistantId])

  useEffect(() => {
    if (!preparedTarget || preparedTarget.nonce === lastPreparedNonce.current) return
    lastPreparedNonce.current = preparedTarget.nonce
    previewVersion.current += 1
    actionVersion.current += 1
    queueMicrotask(() => {
      setAssistantId(preparedTarget.assistantId)
      setConversationTarget(preparedTarget.target)
      setHasPreparedConversationTarget(true)
      setSelectedMemoryIds([])
      setIntent(preparedTarget.intent ?? 'delete-representation')
      setPurgeAssistantId(preparedTarget.assistantId)
      if (preparedTarget.target.type === 'assistant') {
        setReplacementAssistantId(preparedTarget.target.replacementAssistantId ?? '')
      }
      setPreview(null)
      setUnderstood(false)
      setNotice('已从对话带入清理范围。请先选择意图并查看可信预览。')
    })
  }, [preparedTarget])

  const load = useCallback(
    async (targetAssistantId: string, append = false, cursor?: number): Promise<void> => {
      if (!targetAssistantId) {
        const version = ++readVersion.current
        setOverview(null)
        setRecords([])
        setNextCursor(null)
        try {
          const jobsResult = await api.jobs({ protocolVersion })
          if (version !== readVersion.current) return
          if (!jobsResult.ok) setError(retentionError(jobsResult))
          else {
            setJobs(jobsResult.data.jobs)
            setJobNextCursor(jobsResult.data.nextCursor)
          }
        } catch {
          if (version === readVersion.current) setError('清理作业暂时无法读取')
        }
        return
      }
      const version = ++readVersion.current
      setError('')
      try {
        const [overviewResult, recordsResult, jobsResult] = await Promise.all([
          api.overview({ protocolVersion, assistantId: targetAssistantId }),
          memoryApi.query({
            protocolVersion,
            assistantId: targetAssistantId,
            query: '',
            scope: 'all',
            kind: 'all',
            includeTrash: true,
            ...(append && cursor !== undefined ? { cursor } : {}),
            limit: 100
          }),
          api.jobs({ protocolVersion, assistantId: targetAssistantId })
        ])
        if (version !== readVersion.current) return
        if (!overviewResult.ok) setError(retentionError(overviewResult))
        else setOverview(overviewResult.data)
        if (!recordsResult.ok) setError(retentionError(recordsResult))
        else {
          setRecords((values) =>
            append ? [...values, ...recordsResult.data.records] : recordsResult.data.records
          )
          setNextCursor(recordsResult.data.nextCursor)
        }
        if (!jobsResult.ok) setError(retentionError(jobsResult))
        else {
          setJobs(jobsResult.data.jobs)
          setJobNextCursor(jobsResult.data.nextCursor)
        }
      } catch {
        if (version === readVersion.current) setError('保留与清理状态暂时无法读取')
      }
    },
    [api, memoryApi]
  )

  useEffect(() => {
    readVersion.current += 1
    previewVersion.current += 1
    actionVersion.current += 1
    let active = true
    queueMicrotask(() => {
      if (!active) return
      setBusy(false)
      setPreview(null)
      setUnderstood(false)
      setSelectedMemoryIds([])
      setJobNextCursor(null)
      void load(assistantId)
    })
    return () => {
      active = false
    }
  }, [assistantId, load])

  useEffect(() => {
    if (!changed || !changed.assistantIds.includes(assistantId)) return
    if (changed.reason === 'job-status') {
      queueMicrotask(() => void load(assistantId))
      return
    }
    readVersion.current += 1
    previewVersion.current += 1
    actionVersion.current += 1
    queueMicrotask(() => {
      setBusy(false)
      setPreview(null)
      setUnderstood(false)
      setSelectedMemoryIds((values) => values.filter((id) => !changed.memoryIds.includes(id)))
      setNotice('数据已变化，旧预览已经失效。请重新查看完整影响。')
      void load(assistantId)
    })
  }, [api, assistantId, changed, load])

  function targetForPreview(): Target | null {
    if (intent === 'purge-assistant') {
      return {
        type: 'assistant',
        replacementAssistantId: replacementAssistantId || null
      }
    }
    if (selectedMemoryIds.length > 0) {
      const objects = selectedMemoryIds.flatMap((id) => {
        const record = records.find((item) => item.id === id)
        if (!record || (intent === 'empty-trash' && record.retention !== 'trash')) return []
        return [{ id: record.id, version: record.objectVersion }]
      })
      return objects.length > 0 ? { type: 'memories', objects } : null
    }
    if (intent === 'empty-trash' && !hasPreparedConversationTarget) return null
    return conversationTarget
  }

  function invalidatePreview(): void {
    previewVersion.current += 1
    setPreview(null)
    setUnderstood(false)
  }

  async function requestPreview(): Promise<void> {
    const target = targetForPreview()
    const targetAssistantId = intent === 'purge-assistant' ? purgeAssistantId : assistantId
    if (!targetAssistantId) return
    if (!target) {
      setError(
        intent === 'empty-trash'
          ? '请选择垃圾区中的具体记忆；这里只会清理勾选的精确版本。'
          : '请选择要治理的记忆或对话范围。'
      )
      return
    }
    const version = ++previewVersion.current
    setBusy(true)
    setError('')
    setNotice('')
    setPreview(null)
    setUnderstood(false)
    try {
      const result = await api.preview({
        protocolVersion,
        assistantId: targetAssistantId,
        intent,
        target
      })
      if (version !== previewVersion.current) return
      if (!result.ok) setError(retentionError(result))
      else setPreview(result.data)
    } catch {
      if (version === previewVersion.current) setError('预览结果未返回，没有执行任何清理')
    } finally {
      if (version === previewVersion.current) setBusy(false)
    }
  }

  async function confirmPreview(accept: boolean): Promise<void> {
    if (!preview) return
    const targetAssistantId = preview.intent === 'purge-assistant' ? purgeAssistantId : assistantId
    const registryKey = JSON.stringify({
      domain: 'retention-confirm',
      assistantId: targetAssistantId,
      previewId: preview.id,
      nonce: preview.nonce
    })
    const commandId = pendingCommands.get(registryKey) ?? crypto.randomUUID()
    pendingCommands.set(registryKey, commandId)
    const version = previewVersion.current
    setBusy(true)
    setError('')
    try {
      const result = await api.confirm({
        protocolVersion,
        assistantId: targetAssistantId,
        commandId,
        previewId: preview.id,
        nonce: preview.nonce,
        accept
      })
      if (result.ok && preview.intent === 'purge-assistant' && accept) {
        await onRefreshAssistants()
      }
      if (version !== previewVersion.current) return
      if (!result.ok) {
        setError(retentionError(result))
        if (result.error.code !== 'STORAGE_UNAVAILABLE') pendingCommands.delete(registryKey)
        if (result.error.code === 'STALE_PREVIEW') {
          setPreview(null)
          setUnderstood(false)
        }
        return
      }
      pendingCommands.delete(registryKey)
      setPreview(null)
      setUnderstood(false)
      setNotice(
        result.data.state === 'CLEANUP_PENDING'
          ? '内容已停止使用，受管副本仍在清理；请在作业区查看真实进度。'
          : result.data.state === 'CANCELLED'
            ? '已取消，没有执行清理。'
            : '操作已由可信服务完成。'
      )
      await load(targetAssistantId)
    } catch {
      if (version === previewVersion.current) {
        setError('确认回执未知。相同预览会复用同一次操作标识；请重试或查看作业状态。')
      }
    } finally {
      if (version === previewVersion.current) setBusy(false)
    }
  }

  async function move(record: MemoryRecord, zone: MemoryRecord['retention']): Promise<void> {
    if (!overview || zone === record.retention) return
    const action = actionVersion.current
    const targetAssistantId = assistantId
    const registryKey = JSON.stringify({
      domain: 'retention-move',
      assistantId: targetAssistantId,
      id: record.id,
      expectedVersion: record.objectVersion,
      zone,
      expectedEpoch: overview.epoch
    })
    const commandId = pendingCommands.get(registryKey) ?? crypto.randomUUID()
    pendingCommands.set(registryKey, commandId)
    setBusy(true)
    setError('')
    try {
      const result = await api.move({
        protocolVersion,
        assistantId: targetAssistantId,
        commandId,
        id: record.id,
        expectedVersion: record.objectVersion,
        zone,
        expectedEpoch: overview.epoch
      })
      if (action !== actionVersion.current) return
      if (!result.ok) {
        setError(retentionError(result))
        if (result.error.code !== 'STORAGE_UNAVAILABLE') pendingCommands.delete(registryKey)
        return
      }
      pendingCommands.delete(registryKey)
      setNotice(`“${record.title}”已移动到${zoneLabels[zone]}，性质、归属和权限保持不变。`)
      await load(targetAssistantId)
    } catch {
      if (action === actionVersion.current) {
        setError('移动回执未知。再次操作会复用同一次操作标识，避免重复执行。')
      }
    } finally {
      if (action === actionVersion.current) setBusy(false)
    }
  }

  async function retry(job: RetentionJob): Promise<void> {
    const action = actionVersion.current
    setBusy(true)
    setError('')
    try {
      const result = await api.retry({ protocolVersion, jobId: job.id })
      if (action !== actionVersion.current) return
      if (!result.ok) setError(retentionError(result))
      else {
        setNotice('已请求继续核查并清理；完成前仍以作业真实状态为准。')
        await load(assistantId)
      }
    } catch {
      if (action === actionVersion.current) setError('重试请求结果未知，请刷新作业状态核查')
    } finally {
      if (action === actionVersion.current) setBusy(false)
    }
  }

  async function loadMoreJobs(): Promise<void> {
    if (jobNextCursor === null) return
    const version = ++readVersion.current
    setBusy(true)
    setError('')
    try {
      const result = await api.jobs({
        protocolVersion,
        ...(assistantId ? { assistantId } : {}),
        cursor: jobNextCursor
      })
      if (version !== readVersion.current) return
      if (!result.ok) setError(retentionError(result))
      else {
        setJobs((values) => [...values, ...result.data.jobs])
        setJobNextCursor(result.data.nextCursor)
      }
    } catch {
      if (version === readVersion.current) setError('更多清理作业暂时无法读取')
    } finally {
      if (version === readVersion.current) setBusy(false)
    }
  }

  const activeAssistants = assistantSnapshot?.assistants.filter((item) => !item.isArchived) ?? []
  const purgeTarget = assistantSnapshot?.assistants.find((item) => item.id === purgeAssistantId)
  const selectedTrashCount = selectedMemoryIds.filter(
    (id) => records.find((record) => record.id === id)?.retention === 'trash'
  ).length

  return (
    <section className="retention-panel" aria-labelledby="retention-heading">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">本机数据治理</p>
          <h1 id="retention-heading">保留、恢复与清理</h1>
        </div>
        <p className="privacy-note">先看完整影响，再由你在本机确认执行。</p>
      </div>
      <p className="scope-note">
        当前只提供手动操作。自动容量上限、暂存期限和垃圾自动清空策略尚未配置；这里的计量不代表总磁盘占用上限。
      </p>
      {error ? <p role="alert">{error}</p> : null}
      {notice ? <p role="status">{notice}</p> : null}

      <label>
        查看助手的数据
        <select
          value={assistantId}
          onChange={(event) => {
            setAssistantId(event.currentTarget.value)
            setHasPreparedConversationTarget(false)
          }}
        >
          {!assistantId && (assistantSnapshot?.assistants ?? []).length === 0 ? (
            <option value="">全部已删除助手的清理作业</option>
          ) : null}
          {(assistantSnapshot?.assistants ?? []).map((assistant) => (
            <option key={assistant.id} value={assistant.id}>
              {assistant.displayName}
              {assistant.isArchived ? '（已归档）' : ''}
            </option>
          ))}
          {fallbackAssistantId &&
          !(assistantSnapshot?.assistants ?? []).some((item) => item.id === fallbackAssistantId) ? (
            <option value={fallbackAssistantId}>已删除助手的清理作业</option>
          ) : null}
        </select>
      </label>

      {overview ? (
        <section aria-label="容量与分区" className="retention-overview">
          <h2>容量与分区</h2>
          <p>
            受管 Markdown 文件占用：{formatBytes(overview.managedFileBytes)} ·
            数据库及运行文件占用：{formatBytes(overview.databaseBytes)} · 自动策略：未配置
          </p>
          <div className="retention-zones">
            {overview.zones.map((zone) => (
              <article key={zone.zone}>
                <strong>{zoneLabels[zone.zone]}</strong>
                <span>
                  {zone.objects} 项 · 当前有效正文 {formatBytes(zone.acceptedBytes)}
                </span>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section aria-label="三区记忆浏览" className="retention-browser">
        <h2>三区记忆与事件</h2>
        {records.length === 0 ? <p className="scope-note">当前没有可显示的记录。</p> : null}
        <div className="retention-records">
          {records.map((record) => (
            <article className="retention-record" key={record.id}>
              <label className="inline-check">
                <input
                  type="checkbox"
                  checked={selectedMemoryIds.includes(record.id)}
                  onChange={(event) => {
                    const checked = event.currentTarget.checked
                    invalidatePreview()
                    setSelectedMemoryIds((values) =>
                      checked ? [...values, record.id] : values.filter((id) => id !== record.id)
                    )
                  }}
                />
                选择“{record.title}” v{record.objectVersion}
              </label>
              <small>
                {zoneLabels[record.retention]} ·{' '}
                {record.scope === 'global' ? '全局共享' : '本助手私有'}
              </small>
              <p>{record.markdown}</p>
              <div className="button-row">
                {(['persistent', 'staging', 'trash'] as const)
                  .filter((zone) => zone !== record.retention)
                  .map((zone) => (
                    <button
                      key={zone}
                      type="button"
                      disabled={busy || !overview}
                      onClick={() => void move(record, zone)}
                    >
                      {zone === 'trash' ? '移入垃圾区' : `移到${zoneLabels[zone]}`}
                    </button>
                  ))}
              </div>
            </article>
          ))}
        </div>
        {nextCursor !== null ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void load(assistantId, true, nextCursor)}
          >
            加载更多记录
          </button>
        ) : null}
      </section>

      <section aria-label="清理预览" className="retention-preview-builder">
        <h2>清理与永久删除</h2>
        <label>
          操作意图
          <select
            value={intent}
            onChange={(event) => {
              const nextIntent = event.currentTarget.value as RetentionPreview['intent']
              setIntent(nextIntent)
              if (nextIntent === 'empty-trash') {
                setSelectedMemoryIds((values) =>
                  values.filter(
                    (id) => records.find((record) => record.id === id)?.retention === 'trash'
                  )
                )
              }
              invalidatePreview()
            }}
          >
            {Object.entries(intentLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {intent === 'purge-assistant' ? (
          <div className="retention-purge-options">
            <label>
              永久删除助手
              <select
                value={purgeAssistantId}
                onChange={(event) => {
                  setPurgeAssistantId(event.currentTarget.value)
                  invalidatePreview()
                }}
              >
                {(assistantSnapshot?.assistants ?? []).map((assistant) => (
                  <option key={assistant.id} value={assistant.id}>
                    {assistant.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              删除后的主要/当前助手
              <select
                value={replacementAssistantId}
                onChange={(event) => {
                  setReplacementAssistantId(event.currentTarget.value)
                  invalidatePreview()
                }}
              >
                <option value="">没有其他可用助手时设为空</option>
                {activeAssistants
                  .filter((assistant) => assistant.id !== purgeAssistantId)
                  .map((assistant) => (
                    <option key={assistant.id} value={assistant.id}>
                      {assistant.displayName}
                    </option>
                  ))}
              </select>
            </label>
            <p className="scope-note">
              将删除“{purgeTarget?.displayName ?? '所选助手'}
              ”的私有聊天、关系和连续性记忆；全局共享记忆保留，并标明原助手已删除且不再展开私有来源。
            </p>
          </div>
        ) : intent === 'empty-trash' ? (
          <p className="scope-note">
            {selectedTrashCount > 0
              ? `范围：已选择 ${selectedTrashCount} 个垃圾区记忆/事件的精确当前版本。`
              : hasPreparedConversationTarget
                ? '范围：从对话带入的原文垃圾范围；可信预览会列出实际纳入的完整轮次和副本。'
                : '请选择垃圾区中的具体记忆；这里只会清理勾选的精确版本，不会把当前页当作全部垃圾。'}
          </p>
        ) : selectedMemoryIds.length > 0 ? (
          <p className="scope-note">
            范围：已选择 {selectedMemoryIds.length} 个记忆/事件的精确当前版本。
          </p>
        ) : (
          <p className="scope-note">
            范围：
            {conversationTarget.type === 'message'
              ? `消息 ${conversationTarget.messageId}`
              : conversationTarget.type === 'range'
                ? `消息区段 ${conversationTarget.firstMessageId} 至 ${conversationTarget.lastMessageId}`
                : conversationTarget.type === 'memories'
                  ? `${conversationTarget.objects.length} 个精确记忆版本`
                  : conversationTarget.type === 'assistant'
                    ? '所选助手'
                    : '所选助手整条正常时间线'}
            。
          </p>
        )}
        <button
          type="button"
          disabled={
            busy ||
            !assistantId ||
            (intent === 'purge-assistant' && !purgeAssistantId) ||
            (intent === 'empty-trash' && selectedTrashCount === 0 && !hasPreparedConversationTarget)
          }
          onClick={() => void requestPreview()}
        >
          查看完整影响
        </button>
      </section>

      {preview ? (
        <section className="retention-confirmation" aria-label="可信清理确认">
          <h2>{intentLabels[preview.intent]}</h2>
          <p>{preview.warning}</p>
          <dl>
            <div>
              <dt>数据状态</dt>
              <dd>生成预览时已锁定</dd>
            </div>
            <div>
              <dt>记忆/事件</dt>
              <dd>{preview.memoryIds.length}</dd>
            </div>
            <div>
              <dt>受影响对话轮次</dt>
              <dd>{preview.rounds.length}</dd>
            </div>
            <div>
              <dt>受管文件</dt>
              <dd>{preview.files}</dd>
            </div>
          </dl>
          {preview.expandedToRounds ? (
            <p role="alert">
              消息粒度无法独立安全清理，可信服务已把范围扩大到完整轮次及相关派生物。只有接受下面完整范围才可执行。
            </p>
          ) : null}
          {preview.irreversible ? (
            <p role="alert">
              其中包含不可恢复的物理清理。已停止使用不代表受管物理副本已经全部清完，请继续查看作业状态。
            </p>
          ) : null}
          <h3>
            记忆与事件范围（影响 {preview.memoryIds.length} 项，明确保留{' '}
            {preview.retainedMemoryIds.length} 项）
          </h3>
          <ul className="impact-list">
            {preview.memories.map((memory) => {
              const ownerName = assistantSnapshot?.assistants.find(
                (assistant) => assistant.id === memory.ownerAssistantId
              )?.displayName
              const retained = preview.retainedMemoryIds.includes(memory.id)
              return (
                <li key={memory.id}>
                  <strong>{memory.title ?? '当前不可展示标题'}</strong>
                  <span>
                    {memoryKindLabels[memory.kind]} ·{' '}
                    {memory.scope === 'global' ? '全局共享' : '助手私有'} · 归属{' '}
                    {ownerName ?? '已删除或当前不可见的助手'} · v{memory.version} ·
                    {retained ? '明确保留' : '将受影响'}
                  </span>
                  <details>
                    <summary>查看识别信息</summary>
                    <code>{memory.id}</code> · 归属助手 <code>{memory.ownerAssistantId}</code>
                  </details>
                </li>
              )
            })}
          </ul>
          <h3>将受影响的对话轮次（{preview.rounds.length}）</h3>
          <ul className="impact-list">
            {preview.rounds.map((round) => {
              const assistantName = assistantSnapshot?.assistants.find(
                (assistant) => assistant.id === round.assistantId
              )?.displayName
              return (
                <li key={round.assistantId + round.requestId}>
                  <strong>{round.summary ?? '当前不可展示摘要（可能跨助手或已停止使用）'}</strong>
                  <span>
                    {assistantName ?? '已删除或当前不可见的助手'}
                    {round.createdAt
                      ? ` · ${new Date(round.createdAt).toLocaleString('zh-CN')}`
                      : ' · 时间当前不可展示'}
                  </span>
                  <details>
                    <summary>查看识别信息</summary>
                    请求 <code>{round.requestId}</code> · 助手 <code>{round.assistantId}</code>
                  </details>
                </li>
              )
            })}
          </ul>
          {preview.blockers.length > 0 ? (
            <>
              <h3>当前阻断</h3>
              <ul>
                {preview.blockers.map((blocker) => (
                  <li key={blocker}>{blocker}</li>
                ))}
              </ul>
              <p role="alert">阻断解除并重新生成预览前不会执行。</p>
            </>
          ) : null}
          <label className="inline-check">
            <input
              type="checkbox"
              checked={understood}
              disabled={preview.blockers.length > 0}
              onChange={(event) => setUnderstood(event.currentTarget.checked)}
            />
            我已核对上述全部范围、保留对象和不可恢复提示
          </label>
          <div className="button-row">
            <button
              type="button"
              disabled={busy || !understood || preview.blockers.length > 0}
              onClick={() => void confirmPreview(true)}
            >
              本机确认执行
            </button>
            <button type="button" disabled={busy} onClick={() => void confirmPreview(false)}>
              取消预览
            </button>
          </div>
        </section>
      ) : null}

      <section aria-label="清理作业" className="retention-jobs">
        <h2>受管副本清理作业</h2>
        {jobs.length === 0 ? (
          <p className="scope-note">当前没有清理作业。</p>
        ) : (
          <ul>
            {jobs.map((job) => (
              <li key={job.id}>
                <strong>{jobLabels[job.state]}</strong> · {job.completed}/{job.total} ·{' '}
                {new Date(job.createdAt).toLocaleString('zh-CN')}
                {job.error ? ` · ${job.error}` : ''}
                {job.state === 'FAILED_RETRYABLE' ? (
                  <button type="button" disabled={busy} onClick={() => void retry(job)}>
                    重试核查与清理
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {jobNextCursor !== null ? (
          <button type="button" disabled={busy} onClick={() => void loadMoreJobs()}>
            加载更多清理作业
          </button>
        ) : null}
        <p className="scope-note">
          “已停止使用”只表示正文不会再被召回或发送；只有作业显示完成，才表示列入清单的在线受管副本已处理。SQLite
          残页、备份和你自行复制的文件不在此完成口径内。
        </p>
      </section>
    </section>
  )
}
