import { useCallback, useEffect, useRef, useState } from 'react'
import type { MemoryApi, MemoryRecord, MemorySource } from '../../../../shared/memory-contract'
import type {
  MemoryRoundChange,
  MemoryRoundProvided
} from '../../../../shared/memory-round-contract'
import type { ChatMode } from '../../../../shared/timeline-contract'

const protocolVersion = 1 as const
const pageSize = 20

type Section = 'provided' | 'changes'
type SectionEntry = MemoryRoundProvided | MemoryRoundChange
type SectionState = {
  entries: SectionEntry[]
  nextCursor: number | null
  loading: boolean
  loaded: boolean
  error: string
}

const emptySection: SectionState = {
  entries: [],
  nextCursor: null,
  loading: false,
  loaded: false,
  error: ''
}

const kindLabels: Record<MemoryRecord['kind'], string> = {
  user: '用户信息',
  relationship: '关系记忆',
  continuity: '连续性记忆',
  event: '个人事件'
}

const natureLabels: Record<MemoryRecord['nature'], string> = {
  'user-statement': '用户明确陈述',
  'faithful-summary': '忠实摘要',
  inference: '推测'
}

const sourceLabels: Record<MemorySource['type'], string> = {
  round: '正常对话轮次',
  'user-round': '本轮用户原话',
  memory: '记忆版本',
  manual: '用户在应用内创建',
  item: '事项',
  proposal: '提案'
}

const evidenceLabels: Record<MemoryRoundProvided['evidence'], string> = {
  PREPARED: '本地准备',
  DISPATCH_STARTED: '已开始派发，但接收未知',
  RESPONSE_OBSERVED: '已观察到 Provider 响应'
}

const actionLabels: Record<MemoryRoundChange['action'], string> = {
  remember: '记住',
  correct: '纠正',
  delete: '删除表示',
  withdraw: '撤回来源与信息',
  restore: '还原'
}

const changeStateLabels: Record<MemoryRoundChange['state'], string> = {
  SUCCEEDED: '已成功执行',
  PENDING_CONFIRMATION: '等待本机确认',
  NOT_APPLIED: '未执行',
  RESULT_UNKNOWN: '结果未知，请到记忆详情核查'
}

function formatTime(value: string): string {
  return new Date(value).toLocaleString('zh-CN')
}

function roundError(code: string, message: string): string {
  if (code === 'PERMISSION_DENIED') return '当前读取、来源或实际接收方权限不允许显示本轮详情。'
  if (code === 'NOT_FOUND') return '该轮次已清理、撤回或不属于当前助手。'
  if (code === 'STORAGE_UNAVAILABLE') return '本轮记忆详情暂时无法读取，请稍后重试。'
  return message || '本轮记忆请求不符合要求。'
}

function entryKey(entry: SectionEntry): string {
  return entry.kind === 'provided'
    ? `${entry.objectId}:${entry.objectVersion}:${entry.evidence}`
    : entry.operationId
}

function mergeEntries(current: SectionEntry[], incoming: SectionEntry[]): SectionEntry[] {
  const seen = new Set(current.map(entryKey))
  return [...current, ...incoming.filter((entry) => !seen.has(entryKey(entry)))]
}

function RecordVersion({ record }: { record: MemoryRecord }): React.JSX.Element {
  return (
    <div className="round-memory-record">
      <strong>{record.title}</strong>
      <p className="memory-markdown">{record.markdown || '此接受版本没有可显示的正文。'}</p>
      <small>
        {kindLabels[record.kind]} · {record.scope === 'global' ? '全局' : '本助手私有'} ·{' '}
        {natureLabels[record.nature]} · 接受版本 v{record.objectVersion} · 更新时间{' '}
        {formatTime(record.updatedAt)}
      </small>
      {record.sources.length > 0 ? (
        <ul aria-label="本轮记忆来源">
          {record.sources.map((source) => (
            <li key={`${source.type}:${source.id}:${source.version}`}>
              {sourceLabels[source.type]} · 来源版本 v{source.version}
            </li>
          ))}
        </ul>
      ) : (
        <p className="scope-note">此版本没有当前可显示的来源。</p>
      )}
    </div>
  )
}

function ObjectAction({
  entry,
  assistantId,
  onOpenMemory
}: {
  entry: SectionEntry
  assistantId: string
  onOpenMemory?: (target: { assistantId: string; id: string }) => void
}): React.JSX.Element | null {
  if (!entry.objectId || !entry.canInspect || !onOpenMemory) return null
  const label =
    entry.availability === 'obsolete' ? '打开当前版本（当时版本不可用）' : '打开记忆详情与操作'
  return (
    <button type="button" onClick={() => onOpenMemory({ assistantId, id: entry.objectId! })}>
      {label}
    </button>
  )
}

function Availability({ entry }: { entry: SectionEntry }): React.JSX.Element {
  if (entry.availability === 'obsolete') {
    return (
      <p className="scope-note">
        当时的 v{entry.objectVersion} 已不可用；可打开当前版本时，当前正文也不代表当时提供的正文。
      </p>
    )
  }
  if (entry.availability === 'unavailable') {
    return <p className="scope-note">该对象或版本当前不可用，正文、来源和操作入口已撤下。</p>
  }
  return entry.record ? (
    <RecordVersion record={entry.record} />
  ) : (
    <p className="scope-note">版本详情当前不可显示。</p>
  )
}

type RoundMemoryPanelProps = {
  assistantId: string
  requestId: string
  mode: ChatMode
  api?: MemoryApi
  refreshKey?: string | number
  onOpenMemory?: (target: { assistantId: string; id: string }) => void
}

export function RoundMemoryPanel(props: RoundMemoryPanelProps): React.JSX.Element | null {
  const { assistantId, requestId, mode, api, refreshKey } = props
  const [open, setOpen] = useState(false)
  if (!api || !assistantId || !requestId || mode !== 'normal') return null
  const route = `${assistantId}:${requestId}:${mode}:${String(refreshKey ?? '')}`
  return <RoundMemoryPanelContent key={route} {...props} open={open} onOpenChange={setOpen} />
}

function RoundMemoryPanelContent({
  assistantId,
  requestId,
  mode,
  api,
  refreshKey,
  onOpenMemory,
  open,
  onOpenChange
}: RoundMemoryPanelProps & {
  open: boolean
  onOpenChange: (open: boolean) => void
}): React.JSX.Element | null {
  const [provided, setProvided] = useState<SectionState>(emptySection)
  const [changes, setChanges] = useState<SectionState>(emptySection)
  const versions = useRef<Record<Section, number>>({ provided: 0, changes: 0 })
  const route = `${assistantId}:${requestId}:${mode}:${String(refreshKey ?? '')}`
  const routeRef = useRef(route)

  const loadSection = useCallback(
    async (section: Section, append = false, cursor?: number): Promise<void> => {
      if (!api || !assistantId || !requestId || mode !== 'normal') return
      const expectedRoute = route
      const version = ++versions.current[section]
      const update = section === 'provided' ? setProvided : setChanges
      update((current) => ({
        ...(append ? current : emptySection),
        loading: true,
        error: ''
      }))
      try {
        const result = await api.round({
          protocolVersion,
          assistantId,
          requestId,
          mode,
          section,
          ...(cursor === undefined ? {} : { cursor }),
          limit: pageSize
        })
        if (version !== versions.current[section] || routeRef.current !== expectedRoute) return
        if (!result.ok) {
          update({
            ...emptySection,
            loaded: true,
            error: roundError(result.error.code, result.error.message)
          })
          return
        }
        if (result.data.assistantId !== assistantId || result.data.requestId !== requestId) {
          update({
            ...emptySection,
            loaded: true,
            error: '本轮详情归属不一致，已拒绝显示。'
          })
          return
        }
        const expectedKind = section === 'provided' ? 'provided' : 'change'
        const incoming = result.data.entries.filter((entry) => entry.kind === expectedKind)
        update((current) => ({
          entries: append ? mergeEntries(current.entries, incoming) : incoming,
          nextCursor: result.data.nextCursor,
          loading: false,
          loaded: true,
          error: ''
        }))
      } catch {
        if (version !== versions.current[section] || routeRef.current !== expectedRoute) return
        update({
          ...emptySection,
          loaded: true,
          error: '本轮记忆详情暂时无法读取；已移除此前显示的详情。'
        })
      }
    },
    [api, assistantId, mode, requestId, route]
  )

  const invalidate = useCallback(() => {
    versions.current.provided += 1
    versions.current.changes += 1
    setProvided(emptySection)
    setChanges(emptySection)
  }, [])

  const loadInitial = useCallback(() => {
    invalidate()
    void loadSection('provided')
    void loadSection('changes')
  }, [invalidate, loadSection])

  useEffect(() => {
    let active = true
    routeRef.current = route
    if (open && api && assistantId && requestId && mode === 'normal') {
      queueMicrotask(() => {
        if (active) loadInitial()
      })
    }
    return () => {
      active = false
    }
  }, [assistantId, api, loadInitial, mode, open, requestId, route])

  if (!api || !assistantId || !requestId || mode !== 'normal') return null

  const noEvidence =
    provided.loaded &&
    changes.loaded &&
    !provided.loading &&
    !changes.loading &&
    provided.entries.length === 0 &&
    changes.entries.length === 0 &&
    !provided.error &&
    !changes.error

  return (
    <details
      className="round-memory"
      open={open}
      onToggle={(event) => {
        const nextOpen = event.currentTarget.open
        onOpenChange(nextOpen)
        if (!nextOpen) invalidate()
      }}
    >
      <summary>记忆来源与变更</summary>
      <p className="scope-note">
        这里按本轮真实请求记录显示。任何“提供”状态都不能证明模型实际采用了记忆。
      </p>

      {noEvidence ? (
        <p className="scope-note">
          此轮没有新式追踪记录。旧轮次没有记录不表示从未读取、提供或使用过记忆。
        </p>
      ) : null}

      <section aria-label="本轮实际提供的记忆">
        <h4>本轮实际提供的记忆</h4>
        <p className="scope-note">
          模型收到的正文可能是节选（最多 1000 字符）；下方展示该接受版本的正文，不代表完整外发内容。
        </p>
        {provided.loading ? <p>正在核查提供记录…</p> : null}
        {provided.error ? <p role="alert">{provided.error}</p> : null}
        {provided.loaded && provided.entries.length === 0 && !provided.error ? (
          <p className="scope-note">没有可显示的提供记录。</p>
        ) : null}
        <div className="round-memory-list">
          {provided.entries.map((raw) => {
            if (raw.kind !== 'provided') return null
            return (
              <article key={entryKey(raw)}>
                <div className="operation-title">
                  <strong>提供版本 v{raw.objectVersion}</strong>
                  <span className="operation-state">{evidenceLabels[raw.evidence]}</span>
                </div>
                <small>
                  {raw.dispatchedAt
                    ? `派发时间 ${formatTime(raw.dispatchedAt)}`
                    : '没有派发时间记录'}
                </small>
                <p className="scope-note">
                  {raw.evidence === 'PREPARED'
                    ? '只证明本机已准备，尚未开始派发。'
                    : raw.evidence === 'DISPATCH_STARTED'
                      ? '只证明应用已开始调用传输，不能确认 Provider 收到。'
                      : '只证明应用观察到响应，仍不能证明模型采用。'}
                </p>
                <Availability entry={raw} />
                <ObjectAction entry={raw} assistantId={assistantId} onOpenMemory={onOpenMemory} />
              </article>
            )
          })}
        </div>
        {provided.nextCursor !== null ? (
          <button
            type="button"
            disabled={provided.loading}
            onClick={() => void loadSection('provided', true, provided.nextCursor!)}
          >
            加载更多提供记录
          </button>
        ) : null}
      </section>

      <section aria-label="本轮记忆变更">
        <h4>本轮记忆变更</h4>
        {changes.loading ? <p>正在核查变更回执…</p> : null}
        {changes.error ? <p role="alert">{changes.error}</p> : null}
        {changes.loaded && changes.entries.length === 0 && !changes.error ? (
          <p className="scope-note">没有可显示的真实变更或待确认回执。</p>
        ) : null}
        <div className="round-memory-list">
          {changes.entries.map((raw) => {
            if (raw.kind !== 'change') return null
            return (
              <article key={entryKey(raw)}>
                <div className="operation-title">
                  <strong>{actionLabels[raw.action]}</strong>
                  <span className="operation-state">{changeStateLabels[raw.state]}</span>
                </div>
                <p>{raw.summary}</p>
                <small>
                  {formatTime(raw.createdAt)}
                  {raw.objectVersion !== null ? ` · 对象版本 v${raw.objectVersion}` : ''}
                </small>
                <Availability entry={raw} />
                <ObjectAction entry={raw} assistantId={assistantId} onOpenMemory={onOpenMemory} />
              </article>
            )
          })}
        </div>
        {changes.nextCursor !== null ? (
          <button
            type="button"
            disabled={changes.loading}
            onClick={() => void loadSection('changes', true, changes.nextCursor!)}
          >
            加载更多变更记录
          </button>
        ) : null}
      </section>

      <button type="button" disabled={provided.loading || changes.loading} onClick={loadInitial}>
        刷新本轮详情
      </button>
    </details>
  )
}
