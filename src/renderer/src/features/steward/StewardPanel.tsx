import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AssistantSnapshot } from '../../../../shared/assistant-contract'
import type { BackgroundUsage } from '../../../../shared/background-contract'
import type { MemoryApi, MemoryRecord, MemorySource } from '../../../../shared/memory-contract'
import type { ProviderApi, ProviderConnection } from '../../../../shared/provider-contract'
import type {
  DiscoveryConfiguration,
  StewardApi,
  StewardBranch,
  StewardConflict,
  StewardJob,
  StewardPending,
  StewardSnapshot
} from '../../../../shared/steward-contract'

const protocolVersion = 1 as const

type ConfigurationRole = 'assistant' | 'steward'
type Budget = NonNullable<StewardSnapshot['configuration']['budget']>
type DraftBudget = { enabled: boolean; calls: string; inputCharacters: string }
type DiscoveryDraft = {
  enabled: boolean
  connectionId: string
  model: string
  allowOwnCompletedRounds: boolean
  grantSelectedRecipient: boolean
  budget: DraftBudget
}
type StewardDraft = {
  enabled: boolean
  connectionId: string
  model: string
  assistantIds: string[]
  allowAcceptedMemories: boolean
  allowSharedCandidates: boolean
  allowWrite: boolean
  allowInferences: boolean
  grantSelectedRecipient: boolean
  budget: DraftBudget
}
type PendingInspection = { key: string; markdown: string }
type BranchDetail = {
  branch: StewardBranch
  members: MemoryRecord[]
  conflicts: StewardConflict[]
  markdown: string
  nextCursor: number | null
  stale: boolean
}
type MemberDraft = {
  branchId: string
  branchVersion: number
  record: MemoryRecord
  title: string
  markdown: string
}
type ReloadPreview = {
  branchId: string
  memoryId: string
  memoryVersion: number
  previewId: string
  currentMarkdown: string | null
  candidateMarkdown: string
  warning: string
}
type ConflictDraft = {
  conflictId: string
  conflictVersion: number
  side: 'left' | 'right'
  record: MemoryRecord
  title: string
  markdown: string
  corrected: { memoryId: string; memoryVersion: number } | null
}

const jobLabels: Record<StewardJob['state'], string> = {
  QUEUED: '待处理',
  RUNNING: '运行中',
  BUDGET_PAUSED: '预算暂停',
  CONFIGURATION_BLOCKED: '配置阻止',
  PERMISSION_BLOCKED: '权限阻止',
  FAILED_CONFIRMED: '确认失败',
  REMOTE_UNKNOWN: '远端结果未知',
  CANCELLED: '已取消',
  STALE: '已过期',
  PARTIAL: '部分完成',
  COMPLETED: '已完成'
}

const natureLabels: Record<StewardPending['nature'], string> = {
  'user-statement': '用户陈述',
  'faithful-summary': '忠实归纳',
  inference: '待核验推测'
}

const pendingStateLabels: Record<StewardPending['state'], string> = {
  pending: '待整理，尚未接受',
  completed: '已处理',
  dismissed: '已丢弃',
  stale: '来源已变化'
}

function localTime(value: string): string {
  return new Date(value).toLocaleString('zh-CN')
}

function budgetDraft(budget: Budget | null): DraftBudget {
  return {
    enabled: budget !== null,
    calls: budget ? String(budget.calls) : '',
    inputCharacters: budget ? String(budget.inputCharacters) : ''
  }
}

function discoveryDraft(configuration: DiscoveryConfiguration): DiscoveryDraft {
  return {
    enabled: configuration.enabled,
    connectionId: configuration.connectionId ?? '',
    model: configuration.model ?? '',
    allowOwnCompletedRounds: configuration.allowOwnCompletedRounds,
    grantSelectedRecipient: false,
    budget: budgetDraft(configuration.budget)
  }
}

function stewardDraft(configuration: StewardSnapshot['configuration']): StewardDraft {
  return {
    enabled: configuration.enabled,
    connectionId: configuration.connectionId ?? '',
    model: configuration.model ?? '',
    assistantIds: configuration.assistantIds,
    allowAcceptedMemories: configuration.allowAcceptedMemories,
    allowSharedCandidates: configuration.allowSharedCandidates,
    allowWrite: configuration.allowWrite,
    allowInferences: configuration.allowInferences,
    grantSelectedRecipient: false,
    budget: budgetDraft(configuration.budget)
  }
}

function validBudget(value: DraftBudget): boolean {
  return (
    !value.enabled ||
    (/^\d+$/.test(value.calls) &&
      /^\d+$/.test(value.inputCharacters) &&
      Number(value.calls) >= 1 &&
      Number(value.calls) <= 1000 &&
      Number(value.inputCharacters) >= 1 &&
      Number(value.inputCharacters) <= 10_000_000)
  )
}

function savedBudget(value: DraftBudget): Budget | null {
  return value.enabled
    ? {
        window: 'utc-day',
        calls: Number(value.calls),
        inputCharacters: Number(value.inputCharacters)
      }
    : null
}

function mergeByVersion<T extends { id: string; version: number }>(
  current: T[],
  incoming: T[]
): T[] {
  const values = new Map(current.map((value) => [value.id, value]))
  for (const value of incoming) {
    const previous = values.get(value.id)
    if (!previous || previous.version <= value.version) values.set(value.id, value)
  }
  return [...values.values()]
}

function mergeMemoryRecords(current: MemoryRecord[], incoming: MemoryRecord[]): MemoryRecord[] {
  const values = new Map(current.map((value) => [value.id, value]))
  for (const value of incoming) {
    const previous = values.get(value.id)
    if (!previous || previous.objectVersion <= value.objectVersion) values.set(value.id, value)
  }
  return [...values.values()]
}

function sourceLabel(source: MemorySource): string {
  const labels: Record<MemorySource['type'], string> = {
    round: '对话轮次',
    'user-round': '用户轮次',
    memory: '记忆',
    manual: '手动输入',
    item: '事项',
    proposal: '提案'
  }
  return `${labels[source.type]} · v${source.version}`
}

function usageView(title: string, usage: BackgroundUsage, budget: Budget | null) {
  return (
    <section className="steward-usage" aria-label={title}>
      <h3>
        {title} · {usage.windowId}
      </h3>
      <dl>
        <div>
          <dt>调用</dt>
          <dd>
            {usage.calls}
            {budget ? ` / ${budget.calls}` : ' / 未配置'}
          </dd>
        </div>
        <div>
          <dt>输入字符</dt>
          <dd>
            {usage.inputCharacters}
            {budget ? ` / ${budget.inputCharacters}` : ' / 未配置'}
          </dd>
        </div>
        <div>
          <dt>已知 token</dt>
          <dd>{usage.knownTotalTokens}</dd>
        </div>
        <div>
          <dt>用量未知次数</dt>
          <dd>{usage.unknownAttempts}</dd>
        </div>
      </dl>
    </section>
  )
}

function BudgetFields({
  value,
  onChange
}: {
  value: DraftBudget
  onChange: (value: DraftBudget) => void
}): React.JSX.Element {
  return (
    <>
      <label className="inline-check">
        <input
          type="checkbox"
          checked={value.enabled}
          onChange={(event) => onChange({ ...value, enabled: event.currentTarget.checked })}
        />
        设置 UTC 日硬预算
      </label>
      {value.enabled ? (
        <div className="steward-budget-grid">
          <label>
            每日最多调用次数
            <input
              value={value.calls}
              inputMode="numeric"
              onChange={(event) => onChange({ ...value, calls: event.currentTarget.value })}
            />
          </label>
          <label>
            每日最多输入字符
            <input
              value={value.inputCharacters}
              inputMode="numeric"
              onChange={(event) =>
                onChange({ ...value, inputCharacters: event.currentTarget.value })
              }
            />
          </label>
        </div>
      ) : null}
    </>
  )
}

export function StewardPanel({
  assistantSnapshot,
  api,
  memoryApi,
  providerApi,
  onMemoryChanged
}: {
  assistantSnapshot: AssistantSnapshot | null
  api: StewardApi
  memoryApi: MemoryApi
  providerApi: ProviderApi
  onMemoryChanged?: () => void
}): React.JSX.Element {
  const assistantId = assistantSnapshot?.currentAssistantId ?? ''
  const assistants = useMemo(
    () => assistantSnapshot?.assistants.filter((assistant) => !assistant.isArchived) ?? [],
    [assistantSnapshot?.assistants]
  )
  const [snapshot, setSnapshot] = useState<StewardSnapshot | null>(null)
  const snapshotRef = useRef<StewardSnapshot | null>(null)
  const [connections, setConnections] = useState<ProviderConnection[]>([])
  const [discovery, setDiscovery] = useState<DiscoveryDraft | null>(null)
  const [steward, setSteward] = useState<StewardDraft | null>(null)
  const [discoveryDirty, setDiscoveryDirty] = useState(false)
  const [stewardDirty, setStewardDirty] = useState(false)
  const discoveryDirtyRef = useRef(false)
  const stewardDirtyRef = useRef(false)
  const discoveryVersion = useRef(0)
  const stewardVersion = useRef(0)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [pendingInspection, setPendingInspection] = useState<Record<string, PendingInspection>>({})
  const [branchDetails, setBranchDetails] = useState<Record<string, BranchDetail>>({})
  const [branchTitles, setBranchTitles] = useState<Record<string, string>>({})
  const [memberDraft, setMemberDraft] = useState<MemberDraft | null>(null)
  const [reloadPreview, setReloadPreview] = useState<ReloadPreview | null>(null)
  const [conflictDraft, setConflictDraft] = useState<ConflictDraft | null>(null)
  const [exportingBranchId, setExportingBranchId] = useState('')
  const routeRef = useRef('')
  const routeGeneration = useRef(0)
  const readVersion = useRef(0)
  const operationVersion = useRef(0)
  const branchReadVersions = useRef(new Map<string, number>())
  const exportVersions = useRef(new Map<string, number>())
  const pendingCommands = useRef(new Map<string, string>())

  const syncDiscovery = useCallback((configuration: DiscoveryConfiguration) => {
    discoveryVersion.current = configuration.version
    setDiscovery(discoveryDraft(configuration))
    setDiscoveryDirty(false)
    discoveryDirtyRef.current = false
  }, [])

  const syncSteward = useCallback((configuration: StewardSnapshot['configuration']) => {
    stewardVersion.current = configuration.version
    setSteward(stewardDraft(configuration))
    setStewardDirty(false)
    stewardDirtyRef.current = false
  }, [])

  const acceptSnapshot = useCallback(
    (value: StewardSnapshot, append = false, forceRole?: ConfigurationRole) => {
      if (value.discovery.assistantId !== routeRef.current) return
      const current = snapshotRef.current
      if (current && value.discovery.version < current.discovery.version) return
      const next =
        append && current
          ? {
              ...value,
              pending: mergeByVersion(current.pending, value.pending),
              jobs: mergeByVersion(current.jobs, value.jobs),
              branches: mergeByVersion(current.branches, value.branches),
              conflicts: mergeByVersion(current.conflicts, value.conflicts)
            }
          : value
      const invalidatedBranchIds = new Set(
        (current?.branches ?? [])
          .filter((previous) => {
            const branch = next.branches.find((candidate) => candidate.id === previous.id)
            return !branch || branch.version !== previous.version
          })
          .map((branch) => branch.id)
      )
      for (const id of invalidatedBranchIds) {
        branchReadVersions.current.set(id, (branchReadVersions.current.get(id) ?? 0) + 1)
        exportVersions.current.set(id, (exportVersions.current.get(id) ?? 0) + 1)
      }
      if (invalidatedBranchIds.size > 0) {
        setExportingBranchId((id) => (invalidatedBranchIds.has(id) ? '' : id))
        setReloadPreview(null)
      }
      snapshotRef.current = next
      setSnapshot(next)
      setBranchDetails((details) =>
        Object.fromEntries(
          Object.entries(details).map(([id, detail]) => {
            const branch = next.branches.find((candidate) => candidate.id === id)
            const invalidated = !branch || branch.version !== detail.branch.version
            return [
              id,
              invalidated
                ? {
                    ...detail,
                    members: [],
                    conflicts: [],
                    markdown: '',
                    nextCursor: null,
                    stale: true
                  }
                : detail
            ]
          })
        )
      )
      setConflictDraft((draft) => {
        if (!draft) return null
        const conflict = next.conflicts.find((candidate) => candidate.id === draft.conflictId)
        return !conflict ||
          conflict.version !== draft.conflictVersion ||
          conflict.state === 'RESOLVED'
          ? { ...draft, conflictVersion: -1 }
          : draft
      })
      if (forceRole === 'assistant' || !discoveryDirtyRef.current) syncDiscovery(value.discovery)
      if (forceRole === 'steward' || !stewardDirtyRef.current) syncSteward(value.configuration)
    },
    [syncDiscovery, syncSteward]
  )

  const load = useCallback(
    async (targetAssistantId: string, cursor = 0): Promise<StewardSnapshot | null> => {
      const version = ++readVersion.current
      const route = targetAssistantId
      setLoading(true)
      setError('')
      try {
        const result = await api.query({ protocolVersion, assistantId: targetAssistantId, cursor })
        if (version !== readVersion.current || routeRef.current !== route) return null
        if (!result.ok) {
          setError(result.error.message)
          return null
        }
        acceptSnapshot(result.data, cursor > 0)
        return result.data
      } catch {
        if (version === readVersion.current && routeRef.current === route)
          setError('资料整理暂时无法读取，当前草稿仍保留。')
        return null
      } finally {
        if (version === readVersion.current && routeRef.current === route) setLoading(false)
      }
    },
    [acceptSnapshot, api]
  )

  useEffect(() => {
    routeRef.current = assistantId
    routeGeneration.current += 1
    readVersion.current += 1
    operationVersion.current += 1
    branchReadVersions.current.clear()
    for (const id of exportVersions.current.keys())
      exportVersions.current.set(id, (exportVersions.current.get(id) ?? 0) + 1)
    snapshotRef.current = null
    discoveryDirtyRef.current = false
    stewardDirtyRef.current = false
    let active = true
    queueMicrotask(() => {
      if (!active) return
      setSnapshot(null)
      setConnections([])
      setDiscovery(null)
      setSteward(null)
      setDiscoveryDirty(false)
      setStewardDirty(false)
      setLoading(false)
      setBusy('')
      setError('')
      setNotice('')
      setPendingInspection({})
      setBranchDetails({})
      setBranchTitles({})
      setMemberDraft(null)
      setReloadPreview(null)
      setConflictDraft(null)
      setExportingBranchId('')
      if (!assistantId) return
      void load(assistantId)
      void providerApi
        .list()
        .then((result) => {
          if (active && routeRef.current === assistantId && result.ok)
            setConnections(result.data.connections)
        })
        .catch(() => {
          if (active && routeRef.current === assistantId)
            setError('Provider 连接列表暂时无法读取；配置尚未更改。')
        })
    })
    return () => {
      active = false
      routeGeneration.current += 1
    }
  }, [assistantId, load, providerApi])

  useEffect(() => {
    if (!assistantId) return
    return api.onChanged(() => {
      void load(routeRef.current)
    })
  }, [api, assistantId, load])

  const markDiscoveryDirty = (): void => {
    discoveryDirtyRef.current = true
    setDiscoveryDirty(true)
    setNotice('')
  }
  const markStewardDirty = (): void => {
    stewardDirtyRef.current = true
    setStewardDirty(true)
    setNotice('')
  }

  const discoveryReady =
    discovery !== null &&
    (!discovery.enabled ||
      (Boolean(discovery.connectionId) &&
        Boolean(discovery.model.trim()) &&
        discovery.allowOwnCompletedRounds &&
        discovery.budget.enabled &&
        validBudget(discovery.budget)))
  const stewardReady =
    steward !== null &&
    (!steward.enabled ||
      (Boolean(steward.connectionId) &&
        Boolean(steward.model.trim()) &&
        steward.assistantIds.length > 0 &&
        (steward.allowAcceptedMemories || steward.allowSharedCandidates) &&
        steward.budget.enabled &&
        validBudget(steward.budget)))

  async function saveConfiguration(role: ConfigurationRole): Promise<void> {
    if (!assistantId || busy || !snapshotRef.current) return
    if (role === 'assistant' && (!discovery || !discoveryReady)) return
    if (role === 'steward' && (!steward || !stewardReady)) return
    const route = assistantId
    const op = ++operationVersion.current
    setBusy(`save:${role}`)
    setError('')
    setNotice('')
    try {
      const result =
        role === 'assistant'
          ? await api.configure({
              protocolVersion,
              assistantId: route,
              role,
              expectedVersion: discoveryVersion.current,
              settings: {
                enabled: discovery!.enabled,
                connectionId: discovery!.connectionId || null,
                model: discovery!.model.trim() || null,
                allowOwnCompletedRounds: discovery!.allowOwnCompletedRounds,
                budget: savedBudget(discovery!.budget)
              },
              grantSelectedRecipient: discovery!.enabled && discovery!.grantSelectedRecipient
            })
          : await api.configure({
              protocolVersion,
              assistantId: route,
              role,
              expectedVersion: stewardVersion.current,
              settings: {
                enabled: steward!.enabled,
                connectionId: steward!.connectionId || null,
                model: steward!.model.trim() || null,
                assistantIds: steward!.assistantIds,
                allowAcceptedMemories: steward!.allowAcceptedMemories,
                allowSharedCandidates: steward!.allowSharedCandidates,
                allowWrite: steward!.allowWrite,
                allowInferences: steward!.allowWrite && steward!.allowInferences,
                budget: savedBudget(steward!.budget)
              },
              grantSelectedRecipient: steward!.enabled && steward!.grantSelectedRecipient
            })
      if (op !== operationVersion.current || routeRef.current !== route) return
      if (!result.ok) {
        setError(
          result.error.code === 'STALE_WRITE'
            ? '配置版本已变化，当前草稿和原 CAS 版本仍保留。请核对后明确重新载入已保存配置。'
            : result.error.message
        )
        return
      }
      acceptSnapshot(result.data, false, role)
      setNotice(
        role === 'assistant' ? '当前助手的共享增量识别配置已保存。' : '全局仓储员配置已保存。'
      )
    } catch {
      if (op === operationVersion.current && routeRef.current === route) {
        setError('保存回执未确认，可能已经生效；不会自动重复提交，请先刷新核对。')
      }
    } finally {
      if (op === operationVersion.current && routeRef.current === route) setBusy('')
    }
  }

  async function run(role: ConfigurationRole): Promise<void> {
    if (!assistantId || busy) return
    const route = assistantId
    const op = ++operationVersion.current
    setBusy(`run:${role}`)
    setError('')
    try {
      const result = await api.run({ protocolVersion, assistantId: route, role })
      if (op !== operationVersion.current || routeRef.current !== route) return
      if (!result.ok) {
        setError(result.error.message)
        return
      }
      acceptSnapshot(result.data)
      setNotice(role === 'assistant' ? '已检查当前助手的新完整轮次。' : '仓储员已检查待整理区。')
    } catch {
      if (op === operationVersion.current && routeRef.current === route)
        setError('启动回执未确认，可能已入队；不会自动重复启动。')
    } finally {
      if (op === operationVersion.current && routeRef.current === route) setBusy('')
    }
  }

  function command(key: string): string {
    const existing = pendingCommands.current.get(key)
    if (existing) return existing
    const value = crypto.randomUUID()
    pendingCommands.current.set(key, value)
    return value
  }

  async function control(
    job: StewardJob,
    action: 'cancel' | 'retry' | 'retry-unknown' | 'inspect'
  ): Promise<void> {
    if (busy) return
    const route = assistantId
    const key = `job:${route}:${job.id}:${job.version}:${action}`
    const op = ++operationVersion.current
    setBusy(key)
    setError('')
    try {
      const result = await api.control({
        protocolVersion,
        assistantId: route,
        jobId: job.id,
        expectedVersion: job.version,
        commandId: command(key),
        action
      })
      if (op !== operationVersion.current || routeRef.current !== route) return
      if (!result.ok) {
        setError(result.error.message)
        return
      }
      pendingCommands.current.delete(key)
      acceptSnapshot(result.data)
      setNotice(action === 'inspect' ? '已核查当前作业状态。' : '作业操作已有明确回执。')
    } catch {
      if (op === operationVersion.current && routeRef.current === route)
        setError('作业操作回执未确认；再次操作会复用同一命令身份。')
    } finally {
      if (op === operationVersion.current && routeRef.current === route) setBusy('')
    }
  }

  async function inspectPending(entry: StewardPending): Promise<void> {
    const route = assistantId
    const key = `pending:${route}:${entry.id}:${entry.version}:inspect`
    const generation = routeGeneration.current
    setBusy(key)
    setError('')
    try {
      const result = await api.pending({
        protocolVersion,
        assistantId: route,
        id: entry.id,
        expectedVersion: entry.version,
        action: 'inspect',
        commandId: command(key)
      })
      if (generation !== routeGeneration.current || routeRef.current !== route) return
      if (!result.ok) {
        setError(result.error.message)
        return
      }
      pendingCommands.current.delete(key)
      const current = snapshotRef.current?.pending.find((value) => value.id === entry.id)
      if (!current || current.version !== entry.version || current.state !== entry.state) return
      setPendingInspection((values) => ({
        ...values,
        [entry.id]: { key: `${entry.version}:${entry.state}`, markdown: result.data.markdown }
      }))
    } catch {
      if (generation === routeGeneration.current && routeRef.current === route)
        setError('候选正文暂时无法读取。')
    } finally {
      if (generation === routeGeneration.current && routeRef.current === route) setBusy('')
    }
  }

  async function dismissPending(entry: StewardPending): Promise<void> {
    if (busy || entry.state !== 'pending') return
    const route = assistantId
    const key = `pending:${route}:${entry.id}:${entry.version}:dismiss`
    const op = ++operationVersion.current
    setBusy(key)
    setError('')
    try {
      const result = await api.pending({
        protocolVersion,
        assistantId: route,
        id: entry.id,
        expectedVersion: entry.version,
        action: 'dismiss',
        commandId: command(key)
      })
      if (op !== operationVersion.current || routeRef.current !== route) return
      if (!result.ok) {
        setError(result.error.message)
        return
      }
      pendingCommands.current.delete(key)
      setPendingInspection((values) => {
        const next = { ...values }
        delete next[entry.id]
        return next
      })
      await load(route)
      setNotice('候选已明确丢弃；同一来源版本不会被静默重建。')
    } catch {
      if (op === operationVersion.current && routeRef.current === route)
        setError('丢弃回执未确认；再次操作会复用同一命令身份。')
    } finally {
      if (op === operationVersion.current && routeRef.current === route) setBusy('')
    }
  }

  async function readBranch(branch: StewardBranch, cursor = 0, append = false): Promise<void> {
    const route = assistantId
    const generation = routeGeneration.current
    const serial = (branchReadVersions.current.get(branch.id) ?? 0) + 1
    branchReadVersions.current.set(branch.id, serial)
    const stillCurrent = () =>
      generation === routeGeneration.current &&
      routeRef.current === route &&
      branchReadVersions.current.get(branch.id) === serial
    setBusy(`branch:${branch.id}`)
    setError('')
    try {
      const result = await api.branch({
        protocolVersion,
        assistantId: route,
        id: branch.id,
        expectedVersion: branch.version,
        cursor
      })
      if (!stillCurrent()) return
      if (!result.ok) {
        setError(result.error.message)
        return
      }
      const currentBranch = snapshotRef.current?.branches.find((value) => value.id === branch.id)
      if (
        !currentBranch ||
        currentBranch.version !== branch.version ||
        result.data.branch.version !== branch.version
      )
        return
      setBranchDetails((values) => {
        const previous = values[branch.id]
        const next: BranchDetail = {
          branch: result.data.branch,
          members:
            append && previous
              ? mergeMemoryRecords(previous.members, result.data.members)
              : result.data.members,
          conflicts:
            append && previous
              ? mergeByVersion(previous.conflicts, result.data.conflicts)
              : result.data.conflicts,
          markdown:
            append && previous
              ? [previous.markdown, result.data.markdown].filter(Boolean).join('\n\n')
              : result.data.markdown,
          nextCursor: result.data.nextCursor,
          stale: false
        }
        return { ...values, [branch.id]: next }
      })
      if (!append)
        setBranchTitles((values) => ({ ...values, [branch.id]: result.data.branch.title }))
    } catch {
      if (stillCurrent()) setError('分支正文暂时无法读取。')
    } finally {
      if (stillCurrent()) setBusy('')
    }
  }

  async function organizeBranch(detail: BranchDetail): Promise<void> {
    if (busy || detail.stale) return
    const title = branchTitles[detail.branch.id]?.trim() ?? ''
    if (!title) return
    const route = assistantId
    const key = `organize:${route}:${detail.branch.id}:${detail.branch.version}:${title}`
    const op = ++operationVersion.current
    setBusy(key)
    setError('')
    try {
      const result = await api.organize({
        protocolVersion,
        assistantId: route,
        commandId: command(key),
        branchId: detail.branch.id,
        expectedVersion: detail.branch.version,
        title,
        memoryId: null,
        memoryVersion: null
      })
      if (op !== operationVersion.current || routeRef.current !== route) return
      if (!result.ok) {
        setError(result.error.message)
        return
      }
      pendingCommands.current.delete(key)
      acceptSnapshot(result.data)
      const nextBranch = result.data.branches.find((value) => value.id === detail.branch.id)
      setBranchDetails((values) => {
        const next = { ...values }
        delete next[detail.branch.id]
        return next
      })
      if (nextBranch) await readBranch(nextBranch)
      setNotice('分支标题已按当前版本更新。')
    } catch {
      if (op === operationVersion.current && routeRef.current === route)
        setError('分支操作回执未确认；再次保存会复用同一命令身份。')
    } finally {
      if (op === operationVersion.current && routeRef.current === route) setBusy('')
    }
  }

  async function saveMemberDraft(): Promise<{ memoryId: string; memoryVersion: number } | null> {
    const draft = memberDraft
    if (!draft || busy) return null
    const detail = branchDetails[draft.branchId]
    const liveBranch = snapshotRef.current?.branches.find((value) => value.id === draft.branchId)
    const liveMember = detail?.members.find((value) => value.id === draft.record.id)
    if (
      !detail ||
      detail.stale ||
      !liveBranch ||
      liveBranch.version !== draft.branchVersion ||
      !liveMember ||
      liveMember.objectVersion !== draft.record.objectVersion ||
      liveMember.state !== 'active'
    ) {
      setError('分支或成员版本已变化，草稿仍按原版本保留；请明确重新载入分支后再编辑。')
      return null
    }
    const route = assistantId
    const key = `memory:${route}:${draft.record.id}:${draft.record.objectVersion}`
    const op = ++operationVersion.current
    setBusy(key)
    setError('')
    try {
      const result = await memoryApi.mutate({
        protocolVersion,
        assistantId: route,
        commandId: command(key),
        mutation: {
          action: 'correct',
          targetId: draft.record.id,
          expectedVersion: draft.record.objectVersion,
          kind: draft.record.kind,
          scope: draft.record.scope,
          title: draft.title.trim(),
          markdown: draft.markdown.trim(),
          nature: draft.record.nature,
          event: draft.record.event
        }
      })
      if (op !== operationVersion.current || routeRef.current !== route) return null
      if (!result.ok) {
        setError(result.error.message)
        return null
      }
      if (
        result.data.state !== 'SUCCEEDED' ||
        result.data.objectId !== draft.record.id ||
        result.data.objectVersion <= draft.record.objectVersion
      ) {
        setError(result.data.summary)
        return null
      }
      pendingCommands.current.delete(key)
      setMemberDraft(null)
      setReloadPreview(null)
      onMemoryChanged?.()
      const refreshed = await load(route)
      const nextBranch = refreshed?.branches.find((value) => value.id === draft.branchId)
      if (nextBranch) await readBranch(nextBranch)
      setNotice('成员 Markdown 已通过记忆纠正保存，并重新读取当前分支。')
      return { memoryId: result.data.objectId, memoryVersion: result.data.objectVersion }
    } catch {
      if (op === operationVersion.current && routeRef.current === route)
        setError('记忆纠正回执未确认；再次保存会复用同一命令身份。')
      return null
    } finally {
      if (op === operationVersion.current && routeRef.current === route) setBusy('')
    }
  }

  async function previewExternal(draft: MemberDraft): Promise<void> {
    if (busy) return
    const route = assistantId
    const generation = routeGeneration.current
    setBusy(`preview:${draft.record.id}`)
    setError('')
    try {
      const result = await memoryApi.previewReload({
        protocolVersion,
        assistantId: route,
        id: draft.record.id,
        expectedVersion: draft.record.objectVersion
      })
      if (generation !== routeGeneration.current || routeRef.current !== route) return
      if (!result.ok) {
        setError(result.error.message)
        return
      }
      const currentDraft = memberDraft
      if (
        !currentDraft ||
        currentDraft.record.id !== draft.record.id ||
        currentDraft.record.objectVersion !== draft.record.objectVersion
      )
        return
      setReloadPreview({
        branchId: draft.branchId,
        memoryId: draft.record.id,
        memoryVersion: draft.record.objectVersion,
        ...result.data
      })
    } catch {
      if (generation === routeGeneration.current && routeRef.current === route)
        setError('外部修改预览暂时无法读取。')
    } finally {
      if (generation === routeGeneration.current && routeRef.current === route) setBusy('')
    }
  }

  async function acceptExternal(preview: ReloadPreview): Promise<void> {
    if (busy) return
    const draft = memberDraft
    if (
      !draft ||
      draft.record.id !== preview.memoryId ||
      draft.record.objectVersion !== preview.memoryVersion
    )
      return
    const route = assistantId
    const op = ++operationVersion.current
    setBusy(`accept-preview:${preview.previewId}`)
    setError('')
    try {
      const result = await memoryApi.acceptReload({
        protocolVersion,
        assistantId: route,
        previewId: preview.previewId
      })
      if (op !== operationVersion.current || routeRef.current !== route) return
      if (!result.ok) {
        setError(result.error.message)
        return
      }
      if (result.data.state !== 'SUCCEEDED') {
        setError(result.data.summary)
        return
      }
      setMemberDraft(null)
      setReloadPreview(null)
      onMemoryChanged?.()
      const refreshed = await load(route)
      const branch = refreshed?.branches.find((value) => value.id === preview.branchId)
      if (branch) await readBranch(branch)
      setNotice('外部修改已显式接受，并重新读取当前分支。')
    } catch {
      if (op === operationVersion.current && routeRef.current === route)
        setError('接受外部修改的回执未确认，请先刷新核对。')
    } finally {
      if (op === operationVersion.current && routeRef.current === route) setBusy('')
    }
  }

  async function startConflictCorrection(
    conflict: StewardConflict,
    side: 'left' | 'right'
  ): Promise<void> {
    if (busy || conflict.state === 'RESOLVED') return
    const source = conflict[side]
    const route = assistantId
    const generation = routeGeneration.current
    setBusy(`conflict-read:${conflict.id}`)
    setError('')
    try {
      const result = await memoryApi.inspect({ protocolVersion, assistantId: route, id: source.id })
      if (generation !== routeGeneration.current || routeRef.current !== route) return
      if (!result.ok) {
        setError(result.error.message)
        return
      }
      const currentConflict = snapshotRef.current?.conflicts.find(
        (value) => value.id === conflict.id
      )
      if (
        !currentConflict ||
        currentConflict.version !== conflict.version ||
        currentConflict.state === 'RESOLVED' ||
        result.data.record.id !== source.id ||
        result.data.record.state !== 'active'
      ) {
        setError('冲突或记忆当前版本已变化，请刷新后重新选择要纠正的一侧。')
        return
      }
      setConflictDraft({
        conflictId: conflict.id,
        conflictVersion: conflict.version,
        side,
        record: result.data.record,
        title: result.data.record.title,
        markdown: result.data.record.markdown,
        corrected: null
      })
    } catch {
      if (generation === routeGeneration.current && routeRef.current === route)
        setError('冲突侧的当前记忆暂时无法读取。')
    } finally {
      if (generation === routeGeneration.current && routeRef.current === route) setBusy('')
    }
  }

  async function resolveConflictDraft(): Promise<void> {
    const draft = conflictDraft
    if (!draft || busy || draft.conflictVersion < 0) return
    const conflict = snapshotRef.current?.conflicts.find((value) => value.id === draft.conflictId)
    if (!conflict || conflict.version !== draft.conflictVersion || conflict.state === 'RESOLVED') {
      setError('冲突版本已变化，当前纠正草稿仍保留；请刷新后重新核对。')
      return
    }
    const route = assistantId
    let corrected = draft.corrected
    if (!corrected) {
      const memoryKey = `conflict-memory:${route}:${draft.conflictId}:${draft.record.id}:${draft.record.objectVersion}`
      const op = ++operationVersion.current
      setBusy(memoryKey)
      setError('')
      try {
        const result = await memoryApi.mutate({
          protocolVersion,
          assistantId: route,
          commandId: command(memoryKey),
          mutation: {
            action: 'correct',
            targetId: draft.record.id,
            expectedVersion: draft.record.objectVersion,
            kind: draft.record.kind,
            scope: draft.record.scope,
            title: draft.title.trim(),
            markdown: draft.markdown.trim(),
            nature: draft.record.nature,
            event: draft.record.event
          }
        })
        if (op !== operationVersion.current || routeRef.current !== route) return
        if (!result.ok) {
          setError(result.error.message)
          return
        }
        if (
          result.data.state !== 'SUCCEEDED' ||
          result.data.objectId !== draft.record.id ||
          result.data.objectVersion <= draft.record.objectVersion
        ) {
          setError(result.data.summary)
          return
        }
        pendingCommands.current.delete(memoryKey)
        corrected = { memoryId: result.data.objectId, memoryVersion: result.data.objectVersion }
        setConflictDraft((value) =>
          value && value.conflictId === draft.conflictId ? { ...value, corrected } : value
        )
        onMemoryChanged?.()
      } catch {
        if (op === operationVersion.current && routeRef.current === route)
          setError('用户纠正回执未确认；再次提交会复用同一记忆命令身份。')
        return
      } finally {
        if (op === operationVersion.current && routeRef.current === route) setBusy('')
      }
    }
    if (!corrected) return
    const resolveKey = `resolve:${route}:${draft.conflictId}:${draft.conflictVersion}:${corrected.memoryId}:${corrected.memoryVersion}`
    const op = ++operationVersion.current
    setBusy(resolveKey)
    setError('')
    try {
      const result = await api.resolveConflict({
        protocolVersion,
        assistantId: route,
        commandId: command(resolveKey),
        conflictId: draft.conflictId,
        expectedVersion: draft.conflictVersion,
        resolutionMemoryId: corrected.memoryId,
        resolutionMemoryVersion: corrected.memoryVersion
      })
      if (op !== operationVersion.current || routeRef.current !== route) return
      if (!result.ok) {
        setError(result.error.message)
        return
      }
      pendingCommands.current.delete(resolveKey)
      acceptSnapshot(result.data)
      setConflictDraft(null)
      setNotice('即时纠正已接受，冲突已按该新记忆版本关闭。')
    } catch {
      if (op === operationVersion.current && routeRef.current === route)
        setError('冲突关闭回执未确认；已接受的纠正不会重写，再次提交只会复用关闭命令。')
    } finally {
      if (op === operationVersion.current && routeRef.current === route) setBusy('')
    }
  }

  async function downloadBranch(branch: StewardBranch): Promise<void> {
    const route = assistantId
    const generation = routeGeneration.current
    const serial = (exportVersions.current.get(branch.id) ?? 0) + 1
    exportVersions.current.set(branch.id, serial)
    setExportingBranchId(branch.id)
    setError('')
    const chunks: string[] = []
    let cursor = 0
    try {
      for (;;) {
        const result = await api.branch({
          protocolVersion,
          assistantId: route,
          id: branch.id,
          expectedVersion: branch.version,
          cursor
        })
        if (
          generation !== routeGeneration.current ||
          routeRef.current !== route ||
          exportVersions.current.get(branch.id) !== serial
        )
          return
        if (!result.ok) {
          setError(result.error.message)
          return
        }
        if (result.data.branch.version !== branch.version) {
          setError('导出期间分支版本已变化，已停止导出。')
          return
        }
        chunks.push(result.data.markdown)
        if (result.data.nextCursor === null) break
        if (result.data.nextCursor <= cursor) {
          setError('分支分页回执无效，已停止导出。')
          return
        }
        cursor = result.data.nextCursor
      }
      const blob = new Blob([chunks.filter(Boolean).join('\n\n')], {
        type: 'text/markdown;charset=utf-8'
      })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `${branch.title.replace(/[\\/:*?"<>|]/g, '_') || '资料分支'}.md`
      anchor.click()
      URL.revokeObjectURL(url)
      setNotice('完整分支 Markdown 已下载。')
    } catch {
      if (generation === routeGeneration.current && routeRef.current === route)
        setError('分支导出失败，未生成不完整文件。')
    } finally {
      if (
        generation === routeGeneration.current &&
        routeRef.current === route &&
        exportVersions.current.get(branch.id) === serial
      )
        setExportingBranchId('')
    }
  }

  if (!assistantId) return <p className="panel">请先创建并选择助手，再配置资料整理。</p>

  return (
    <section className="panel steward-panel" aria-label="资料整理与仓储员">
      <header>
        <p className="eyebrow">资料整理</p>
        <h2>仓储员</h2>
        <p>
          当前助手可识别适合共享的增量；独立仓储员在你明确的来源、接收授权和预算内整理全局资料。两项功能默认关闭。
        </p>
      </header>

      <div className="steward-config-grid">
        <section className="steward-configuration" aria-label="当前助手共享增量识别">
          <h3>
            {assistantSnapshot?.assistants.find((value) => value.id === assistantId)?.displayName ??
              '当前助手'}{' '}
            · 共享增量识别
          </h3>
          <p className="scope-note">
            只检查本助手新完成的正常对话。候选先进入待整理区，不会冒充已接受记忆。
          </p>
          {discovery ? (
            <>
              <label className="inline-check">
                <input
                  type="checkbox"
                  checked={discovery.enabled}
                  onChange={(event) => {
                    setDiscovery({ ...discovery, enabled: event.currentTarget.checked })
                    markDiscoveryDirty()
                  }}
                />
                启用共享增量识别
              </label>
              <label>
                识别连接
                <select
                  value={discovery.connectionId}
                  onChange={(event) => {
                    setDiscovery({
                      ...discovery,
                      connectionId: event.currentTarget.value,
                      grantSelectedRecipient: false
                    })
                    markDiscoveryDirty()
                  }}
                >
                  <option value="">未选择</option>
                  {connections
                    .filter((value) => value.enabled)
                    .map((value) => (
                      <option key={value.id} value={value.id}>
                        {value.displayName}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                识别模型
                <input
                  value={discovery.model}
                  onChange={(event) => {
                    setDiscovery({ ...discovery, model: event.currentTarget.value })
                    markDiscoveryDirty()
                  }}
                />
              </label>
              <label className="inline-check">
                <input
                  type="checkbox"
                  checked={discovery.allowOwnCompletedRounds}
                  onChange={(event) => {
                    setDiscovery({
                      ...discovery,
                      allowOwnCompletedRounds: event.currentTarget.checked
                    })
                    markDiscoveryDirty()
                  }}
                />
                允许读取本助手已完成的正常轮次
              </label>
              <BudgetFields
                value={discovery.budget}
                onChange={(budget) => {
                  setDiscovery({ ...discovery, budget })
                  markDiscoveryDirty()
                }}
              />
              <label className="inline-check recipient-grant">
                <input
                  type="checkbox"
                  disabled={!discovery.enabled || !discovery.connectionId}
                  checked={discovery.grantSelectedRecipient}
                  onChange={(event) => {
                    setDiscovery({
                      ...discovery,
                      grantSelectedRecipient: event.currentTarget.checked
                    })
                    markDiscoveryDirty()
                  }}
                />
                本次保存时授权所选识别接收方
              </label>
              <p className="scope-note">
                连接变化会清除此勾选；不会沿用旧连接的接收授权，也不会自动打开记忆读写或推测权限。
              </p>
              {!validBudget(discovery.budget) ? (
                <p role="alert">预算必须是范围内整数：调用 1–1000 次，输入 1–10,000,000 字符。</p>
              ) : null}
              {discovery.enabled && !discoveryReady ? (
                <p role="alert">启用前请明确连接、模型、轮次范围和 UTC 日硬预算。</p>
              ) : null}
              <div className="button-row">
                <button
                  type="button"
                  disabled={!discoveryDirty || !discoveryReady || Boolean(busy)}
                  onClick={() => void saveConfiguration('assistant')}
                >
                  {busy === 'save:assistant' ? '保存中…' : '保存识别配置'}
                </button>
                <button
                  type="button"
                  disabled={!discoveryDirty || Boolean(busy)}
                  onClick={() => {
                    if (snapshotRef.current) syncDiscovery(snapshotRef.current.discovery)
                    setNotice('已明确放弃识别配置草稿，重新载入已保存版本。')
                  }}
                >
                  重新载入已保存配置
                </button>
                <button
                  type="button"
                  disabled={!snapshot?.discovery.enabled || Boolean(busy)}
                  onClick={() => void run('assistant')}
                >
                  立即识别新轮次
                </button>
              </div>
            </>
          ) : (
            <p>正在读取识别配置…</p>
          )}
        </section>

        <section className="steward-configuration" aria-label="全局仓储员配置">
          <h3>全局仓储员 · 独立配置</h3>
          <p className="scope-note">
            仓储员使用独立连接、模型和预算。读取、写入与推测都必须由你明确选择。
          </p>
          {steward ? (
            <>
              <label className="inline-check">
                <input
                  type="checkbox"
                  checked={steward.enabled}
                  onChange={(event) => {
                    setSteward({ ...steward, enabled: event.currentTarget.checked })
                    markStewardDirty()
                  }}
                />
                启用仓储员
              </label>
              <label>
                仓储连接
                <select
                  value={steward.connectionId}
                  onChange={(event) => {
                    setSteward({
                      ...steward,
                      connectionId: event.currentTarget.value,
                      grantSelectedRecipient: false
                    })
                    markStewardDirty()
                  }}
                >
                  <option value="">未选择</option>
                  {connections
                    .filter((value) => value.enabled)
                    .map((value) => (
                      <option key={value.id} value={value.id}>
                        {value.displayName}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                仓储模型
                <input
                  value={steward.model}
                  onChange={(event) => {
                    setSteward({ ...steward, model: event.currentTarget.value })
                    markStewardDirty()
                  }}
                />
              </label>
              <fieldset>
                <legend>允许作为来源的助手</legend>
                {assistants.map((assistant) => (
                  <label className="inline-check" key={assistant.id}>
                    <input
                      type="checkbox"
                      checked={steward.assistantIds.includes(assistant.id)}
                      onChange={(event) => {
                        setSteward({
                          ...steward,
                          assistantIds: event.currentTarget.checked
                            ? [...new Set([...steward.assistantIds, assistant.id])]
                            : steward.assistantIds.filter((id) => id !== assistant.id)
                        })
                        markStewardDirty()
                      }}
                    />
                    {assistant.displayName}
                  </label>
                ))}
              </fieldset>
              <fieldset>
                <legend>本次整理允许的范围</legend>
                <label className="inline-check">
                  <input
                    type="checkbox"
                    checked={steward.allowSharedCandidates}
                    onChange={(event) => {
                      setSteward({ ...steward, allowSharedCandidates: event.currentTarget.checked })
                      markStewardDirty()
                    }}
                  />
                  读取待整理共享候选
                </label>
                <label className="inline-check">
                  <input
                    type="checkbox"
                    checked={steward.allowAcceptedMemories}
                    onChange={(event) => {
                      setSteward({ ...steward, allowAcceptedMemories: event.currentTarget.checked })
                      markStewardDirty()
                    }}
                  />
                  读取已接受的全局记忆
                </label>
                <label className="inline-check">
                  <input
                    type="checkbox"
                    checked={steward.allowWrite}
                    onChange={(event) => {
                      setSteward({
                        ...steward,
                        allowWrite: event.currentTarget.checked,
                        allowInferences: event.currentTarget.checked
                          ? steward.allowInferences
                          : false
                      })
                      markStewardDirty()
                    }}
                  />
                  允许写入忠实归纳和组织关系
                </label>
                <label className="inline-check">
                  <input
                    type="checkbox"
                    disabled={!steward.allowWrite}
                    checked={steward.allowInferences}
                    onChange={(event) => {
                      setSteward({ ...steward, allowInferences: event.currentTarget.checked })
                      markStewardDirty()
                    }}
                  />
                  允许写入待核验推测
                </label>
              </fieldset>
              <BudgetFields
                value={steward.budget}
                onChange={(budget) => {
                  setSteward({ ...steward, budget })
                  markStewardDirty()
                }}
              />
              <label className="inline-check recipient-grant">
                <input
                  type="checkbox"
                  disabled={
                    !steward.enabled || !steward.connectionId || steward.assistantIds.length === 0
                  }
                  checked={steward.grantSelectedRecipient}
                  onChange={(event) => {
                    setSteward({ ...steward, grantSelectedRecipient: event.currentTarget.checked })
                    markStewardDirty()
                  }}
                />
                本次保存同时授权所选仓储接收方读取这些已选来源
              </label>
              <p className="scope-note">
                此动作只写入所选范围所需的接收授权；不会批量授权其他助手，也不会把 read、write 或
                inference 从关闭改为开启。连接身份变化后必须再次明确授权。
              </p>
              {!validBudget(steward.budget) ? (
                <p role="alert">预算必须是范围内整数：调用 1–1000 次，输入 1–10,000,000 字符。</p>
              ) : null}
              {steward.enabled && !stewardReady ? (
                <p role="alert">
                  启用前请明确连接、模型、至少一个来源助手、读取范围和 UTC 日硬预算。
                </p>
              ) : null}
              <div className="button-row">
                <button
                  type="button"
                  disabled={!stewardDirty || !stewardReady || Boolean(busy)}
                  onClick={() => void saveConfiguration('steward')}
                >
                  {busy === 'save:steward' ? '保存中…' : '保存仓储配置'}
                </button>
                <button
                  type="button"
                  disabled={!stewardDirty || Boolean(busy)}
                  onClick={() => {
                    if (snapshotRef.current) syncSteward(snapshotRef.current.configuration)
                    setNotice('已明确放弃仓储配置草稿，重新载入已保存版本。')
                  }}
                >
                  重新载入已保存配置
                </button>
                <button
                  type="button"
                  disabled={!snapshot?.configuration.enabled || Boolean(busy)}
                  onClick={() => void run('steward')}
                >
                  立即整理待处理资料
                </button>
              </div>
            </>
          ) : (
            <p>正在读取仓储配置…</p>
          )}
        </section>
      </div>

      <div className="button-row">
        <button
          type="button"
          disabled={loading || Boolean(busy)}
          onClick={() => void load(assistantId)}
        >
          刷新全部
        </button>
      </div>
      {notice ? <p role="status">{notice}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      {loading && !snapshot ? <p>正在读取资料整理状态…</p> : null}

      {snapshot ? (
        <>
          <div className="steward-usage-grid">
            {usageView('共享增量识别用量', snapshot.discoveryUsage, snapshot.discovery.budget)}
            {usageView('仓储员用量', snapshot.usage, snapshot.configuration.budget)}
          </div>

          <section aria-label="全局待整理">
            <div className="steward-section-heading">
              <div>
                <h3>全局待整理</h3>
                <p>“待整理”只表示候选或接受版本等待组织，不代表内容已经接受。</p>
              </div>
              <span className="count-badge">
                {snapshot.pending.filter((value) => value.state === 'pending').length} 项待处理
              </span>
            </div>
            {snapshot.pending.length === 0 ? (
              <p>当前没有待整理资料。</p>
            ) : (
              snapshot.pending.map((entry) => {
                const inspection = pendingInspection[entry.id]
                return (
                  <article className={`steward-card pending-${entry.state}`} key={entry.id}>
                    <div className="steward-card-heading">
                      <div>
                        <strong>{entry.title || '未命名候选'}</strong>
                        <p>
                          {pendingStateLabels[entry.state]} · {natureLabels[entry.nature]} ·{' '}
                          {entry.entryKind === 'shared-candidate'
                            ? '共享增量候选'
                            : '已接受记忆待组织'}
                        </p>
                      </div>
                      <small>{localTime(entry.createdAt)}</small>
                    </div>
                    <details>
                      <summary>查看来源</summary>
                      {entry.sources.length === 0 ? (
                        <p>没有可展开的来源。</p>
                      ) : (
                        <ul>
                          {entry.sources.map((source, index) => (
                            <li key={`${source.type}:${source.id}:${source.version}:${index}`}>
                              {sourceLabel(source)} · 助手 {source.assistantId} ·{' '}
                              <code>{source.id}</code>
                            </li>
                          ))}
                        </ul>
                      )}
                    </details>
                    {inspection?.key === `${entry.version}:${entry.state}` ? (
                      <pre className="steward-markdown">{inspection.markdown}</pre>
                    ) : null}
                    <div className="button-row">
                      <button
                        type="button"
                        disabled={Boolean(busy) || !entry.available}
                        onClick={() => void inspectPending(entry)}
                      >
                        {busy.includes(entry.id) ? '读取中…' : '读取候选正文'}
                      </button>
                      {entry.state === 'pending' ? (
                        <button
                          type="button"
                          disabled={Boolean(busy)}
                          onClick={() => void dismissPending(entry)}
                        >
                          丢弃此候选
                        </button>
                      ) : null}
                    </div>
                  </article>
                )
              })
            )}
          </section>

          <section aria-label="仓储作业">
            <h3>仓储作业与真实回执</h3>
            {snapshot.jobs.length === 0 ? (
              <p>当前没有仓储作业。</p>
            ) : (
              snapshot.jobs.map((job) => (
                <article className={`steward-card state-${job.state.toLowerCase()}`} key={job.id}>
                  <div className="steward-card-heading">
                    <strong>
                      {jobLabels[job.state]} · {job.role === 'assistant' ? '增量识别' : '仓储整理'}
                    </strong>
                    <small>
                      尝试 {job.attempts} 次 · {localTime(job.updatedAt)}
                    </small>
                  </div>
                  <p>{job.reason || '暂无补充说明'}</p>
                  <details>
                    <summary>来源与分项回执</summary>
                    <p>
                      来源条目 <code>{job.entryId}</code> v{job.entryVersion}；权限锚点{' '}
                      {job.authorityAssistantId}；配置 v{job.configurationVersion}；作业 v
                      {job.version}。
                    </p>
                    {job.slots.length === 0 ? (
                      <p>尚无已冻结分项。</p>
                    ) : (
                      <ul>
                        {job.slots.map((slot) => (
                          <li key={slot.id}>
                            {slot.action} · {slot.state} · 命令 <code>{slot.commandId}</code>
                            {slot.memoryId ? ` · 记忆 ${slot.memoryId} v${slot.memoryVersion}` : ''}
                            {slot.reason ? ` · ${slot.reason}` : ''}
                            {slot.providedSources ? (
                              <div
                                className="steward-source-receipt"
                                role="group"
                                aria-label="提供给模型的来源"
                              >
                                <strong>提供给模型的来源</strong>
                                {slot.providedSources.length === 0 ? (
                                  <p>本分项没有提供来源。</p>
                                ) : (
                                  <ul>
                                    {slot.providedSources.map((source, index) => (
                                      <li
                                        key={`provided:${source.type}:${source.id}:${source.version}:${index}`}
                                      >
                                        {sourceLabel(source)} · 助手 {source.assistantId} ·{' '}
                                        <code>{source.id}</code>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                                <small>
                                  模型未明确引用不代表该来源没有产生影响；接受结果会保守保留全部提供来源。
                                </small>
                              </div>
                            ) : null}
                            {slot.citedSources ? (
                              <div
                                className="steward-source-receipt"
                                role="group"
                                aria-label="模型输出引用的来源"
                              >
                                <strong>模型输出引用的来源</strong>
                                {slot.citedSources.length === 0 ? (
                                  <p>模型输出未明确引用来源。</p>
                                ) : (
                                  <ul>
                                    {slot.citedSources.map((source, index) => (
                                      <li
                                        key={`cited:${source.type}:${source.id}:${source.version}:${index}`}
                                      >
                                        {sourceLabel(source)} · 助手 {source.assistantId} ·{' '}
                                        <code>{source.id}</code>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </details>
                  <div className="button-row">
                    <button
                      type="button"
                      disabled={Boolean(busy)}
                      onClick={() => void control(job, 'inspect')}
                    >
                      检查当前状态
                    </button>
                    {!['COMPLETED', 'CANCELLED'].includes(job.state) ? (
                      <button
                        type="button"
                        disabled={Boolean(busy)}
                        onClick={() => void control(job, 'cancel')}
                      >
                        取消作业
                      </button>
                    ) : null}
                    {[
                      'STALE',
                      'QUEUED',
                      'BUDGET_PAUSED',
                      'CONFIGURATION_BLOCKED',
                      'PERMISSION_BLOCKED',
                      'FAILED_CONFIRMED',
                      'PARTIAL'
                    ].includes(job.state) ? (
                      <button
                        type="button"
                        disabled={Boolean(busy)}
                        onClick={() => void control(job, 'retry')}
                      >
                        按当前条件重试
                      </button>
                    ) : null}
                    {job.state === 'REMOTE_UNKNOWN' ? (
                      <button
                        type="button"
                        disabled={Boolean(busy)}
                        onClick={() => void control(job, 'retry-unknown')}
                      >
                        核查后重试未知调用
                      </button>
                    ) : null}
                  </div>
                </article>
              ))
            )}
          </section>

          <section aria-label="资料分支">
            <h3>资料分支</h3>
            <p>
              分支展示真实 Markdown
              接受版本。成员正文可在应用内纠正；外部文件变化仍需先预览再明确接受。
            </p>
            {snapshot.branches.length === 0 ? (
              <p>尚无资料分支。</p>
            ) : (
              snapshot.branches.map((branch) => {
                const detail = branchDetails[branch.id]
                return (
                  <article className="steward-card" key={branch.id}>
                    <div className="steward-card-heading">
                      <strong>{branch.title}</strong>
                      <small>分支 v{branch.version}</small>
                    </div>
                    <div className="button-row">
                      <button
                        type="button"
                        disabled={Boolean(busy)}
                        onClick={() => void readBranch(branch)}
                      >
                        读取分支
                      </button>
                      <button
                        type="button"
                        disabled={
                          Boolean(busy) ||
                          (Boolean(exportingBranchId) && exportingBranchId !== branch.id)
                        }
                        onClick={() => {
                          if (exportingBranchId === branch.id) {
                            exportVersions.current.set(
                              branch.id,
                              (exportVersions.current.get(branch.id) ?? 0) + 1
                            )
                            setExportingBranchId('')
                            setNotice('已取消完整分支导出。')
                            return
                          }
                          void downloadBranch(branch)
                        }}
                      >
                        {exportingBranchId === branch.id ? '取消完整导出' : '下载完整分支 Markdown'}
                      </button>
                    </div>
                    {detail ? (
                      <section className="branch-detail" aria-label={`${branch.title}分支详情`}>
                        {detail.stale ? (
                          <p role="alert">
                            分支版本已变化，已清除旧版服务端正文；已有用户草稿仍绑定原版本，不能提交。请明确重新读取分支。
                          </p>
                        ) : null}
                        <label>
                          分支标题
                          <input
                            value={branchTitles[branch.id] ?? detail.branch.title}
                            onChange={(event) =>
                              setBranchTitles((values) => ({
                                ...values,
                                [branch.id]: event.currentTarget.value
                              }))
                            }
                          />
                        </label>
                        <button
                          type="button"
                          disabled={
                            Boolean(busy) || detail.stale || !(branchTitles[branch.id] ?? '').trim()
                          }
                          onClick={() => void organizeBranch(detail)}
                        >
                          保存分支标题
                        </button>
                        <pre className="steward-markdown">{detail.markdown}</pre>
                        <h4>真实成员（已加载 {detail.members.length}）</h4>
                        {detail.members.map((member) => (
                          <article
                            className="branch-member"
                            key={`${member.id}:${member.objectVersion}`}
                          >
                            <strong>{member.title}</strong>
                            <p>
                              {natureLabels[member.nature]} · 记忆 v{member.objectVersion} ·{' '}
                              {member.state}
                            </p>
                            <pre className="steward-markdown compact">{member.markdown}</pre>
                            <details>
                              <summary>成员来源</summary>
                              <ul>
                                {member.sources.map((source, index) => (
                                  <li key={`${source.id}:${source.version}:${index}`}>
                                    {sourceLabel(source)} · <code>{source.id}</code>
                                  </li>
                                ))}
                              </ul>
                            </details>
                            <button
                              type="button"
                              disabled={Boolean(busy) || detail.stale || member.state !== 'active'}
                              onClick={() => {
                                setMemberDraft({
                                  branchId: branch.id,
                                  branchVersion: detail.branch.version,
                                  record: member,
                                  title: member.title,
                                  markdown: member.markdown
                                })
                                setReloadPreview(null)
                              }}
                            >
                              在应用内编辑
                            </button>
                          </article>
                        ))}
                        {detail.nextCursor !== null ? (
                          <button
                            type="button"
                            disabled={Boolean(busy) || detail.stale}
                            onClick={() =>
                              void readBranch(detail.branch, detail.nextCursor ?? 0, true)
                            }
                          >
                            加载更多分支成员
                          </button>
                        ) : (
                          <p className="scope-note">已读取完整分支。</p>
                        )}
                      </section>
                    ) : null}
                  </article>
                )
              })
            )}
          </section>

          {memberDraft ? (
            <section className="steward-editor" aria-label="编辑分支成员">
              <h3>编辑分支成员</h3>
              <p>
                草稿绑定记忆 <code>{memberDraft.record.id}</code> v
                {memberDraft.record.objectVersion} 和分支 v{memberDraft.branchVersion}
                。刷新不会把新版本覆盖进此草稿。
              </p>
              <label>
                标题
                <input
                  value={memberDraft.title}
                  onChange={(event) =>
                    setMemberDraft({ ...memberDraft, title: event.currentTarget.value })
                  }
                />
              </label>
              <label>
                Markdown 正文
                <textarea
                  rows={10}
                  value={memberDraft.markdown}
                  onChange={(event) =>
                    setMemberDraft({ ...memberDraft, markdown: event.currentTarget.value })
                  }
                />
              </label>
              <div className="button-row">
                <button
                  type="button"
                  disabled={
                    Boolean(busy) || !memberDraft.title.trim() || !memberDraft.markdown.trim()
                  }
                  onClick={() => void saveMemberDraft()}
                >
                  保存纠正版本
                </button>
                <button
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() => void previewExternal(memberDraft)}
                >
                  预览外部修改
                </button>
                <button
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() => {
                    const detail = branchDetails[memberDraft.branchId]
                    const branch = snapshotRef.current?.branches.find(
                      (value) => value.id === memberDraft.branchId
                    )
                    setMemberDraft(null)
                    setReloadPreview(null)
                    if (detail && branch) void readBranch(branch)
                  }}
                >
                  放弃草稿并重新载入分支
                </button>
              </div>
              {reloadPreview && reloadPreview.memoryId === memberDraft.record.id ? (
                <section className="reload-preview" aria-label="分支成员外部修改预览">
                  <strong>{reloadPreview.warning}</strong>
                  <p>应用内当前正文</p>
                  <pre className="steward-markdown">
                    {reloadPreview.currentMarkdown ?? '当前可信正文无法读取'}
                  </pre>
                  <p>外部候选正文</p>
                  <pre className="steward-markdown">{reloadPreview.candidateMarkdown}</pre>
                  <div className="button-row">
                    <button
                      type="button"
                      disabled={Boolean(busy)}
                      onClick={() => void acceptExternal(reloadPreview)}
                    >
                      明确接受外部修改
                    </button>
                    <button
                      type="button"
                      disabled={Boolean(busy)}
                      onClick={() => setReloadPreview(null)}
                    >
                      取消
                    </button>
                  </div>
                </section>
              ) : null}
            </section>
          ) : null}

          <section aria-label="资料冲突">
            <h3>资料冲突</h3>
            <p>关闭冲突前必须先即时纠正一侧记忆；仓储员不能任选旧版本覆盖你的决定。</p>
            {snapshot.conflicts.length === 0 ? (
              <p>当前没有资料冲突。</p>
            ) : (
              snapshot.conflicts.map((conflict) => (
                <article
                  className={`steward-card conflict-${conflict.state.toLowerCase()}`}
                  key={conflict.id}
                >
                  <div className="steward-card-heading">
                    <strong>
                      {conflict.state === 'OPEN'
                        ? '待你核验'
                        : conflict.state === 'RESOLVED'
                          ? '已解决'
                          : '旧引用已变化，仍待核验'}{' '}
                      · 冲突 v{conflict.version}
                    </strong>
                    <small>{conflict.branchIds.length} 个相关分支</small>
                  </div>
                  <details>
                    <summary>查看冲突双方与来源</summary>
                    <p>
                      左侧：{sourceLabel(conflict.left)} · <code>{conflict.left.id}</code>
                    </p>
                    <p>
                      右侧：{sourceLabel(conflict.right)} · <code>{conflict.right.id}</code>
                    </p>
                    {conflict.resolution ? (
                      <p>
                        接受决议：{sourceLabel(conflict.resolution)} ·{' '}
                        <code>{conflict.resolution.id}</code>
                      </p>
                    ) : null}
                  </details>
                  {conflict.state !== 'RESOLVED' ? (
                    <div className="button-row">
                      <button
                        type="button"
                        disabled={Boolean(busy)}
                        onClick={() => void startConflictCorrection(conflict, 'left')}
                      >
                        纠正左侧后解决
                      </button>
                      <button
                        type="button"
                        disabled={Boolean(busy)}
                        onClick={() => void startConflictCorrection(conflict, 'right')}
                      >
                        纠正右侧后解决
                      </button>
                    </div>
                  ) : null}
                </article>
              ))
            )}
          </section>

          {conflictDraft ? (
            <section className="steward-editor conflict-editor" aria-label="冲突即时纠正">
              <h3>即时纠正并解决冲突</h3>
              <p>
                正在纠正{conflictDraft.side === 'left' ? '左侧' : '右侧'}记忆{' '}
                <code>{conflictDraft.record.id}</code> 的当前接受版本 v
                {conflictDraft.record.objectVersion}。只有这次纠正成功返回的新版本才会用于关闭冲突。
              </p>
              {conflictDraft.conflictVersion < 0 ? (
                <p role="alert">冲突已变化，草稿仍保留；请刷新后重新核对。</p>
              ) : null}
              <label>
                标题
                <input
                  disabled={conflictDraft.corrected !== null}
                  value={conflictDraft.title}
                  onChange={(event) =>
                    setConflictDraft({ ...conflictDraft, title: event.currentTarget.value })
                  }
                />
              </label>
              <label>
                Markdown 正文
                <textarea
                  disabled={conflictDraft.corrected !== null}
                  rows={10}
                  value={conflictDraft.markdown}
                  onChange={(event) =>
                    setConflictDraft({ ...conflictDraft, markdown: event.currentTarget.value })
                  }
                />
              </label>
              {conflictDraft.corrected ? (
                <p role="status">
                  纠正已接受为 v{conflictDraft.corrected.memoryVersion}；尚待确认冲突关闭回执。
                </p>
              ) : null}
              <div className="button-row">
                <button
                  type="button"
                  disabled={
                    Boolean(busy) ||
                    conflictDraft.conflictVersion < 0 ||
                    !conflictDraft.title.trim() ||
                    !conflictDraft.markdown.trim()
                  }
                  onClick={() => void resolveConflictDraft()}
                >
                  {conflictDraft.corrected ? '重试关闭冲突' : '保存即时纠正并关闭冲突'}
                </button>
                <button
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() => setConflictDraft(null)}
                >
                  取消
                </button>
              </div>
            </section>
          ) : null}

          {snapshot.nextCursor !== null ? (
            <button
              type="button"
              disabled={loading || Boolean(busy)}
              onClick={() => void load(assistantId, snapshot.nextCursor ?? 0)}
            >
              {loading ? '正在加载…' : '加载更多整理记录'}
            </button>
          ) : null}
        </>
      ) : null}
    </section>
  )
}
