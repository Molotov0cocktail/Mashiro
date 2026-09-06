import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ContextIntent } from '../../../../shared/provider-contract'
import type {
  ChatMode,
  HistoryPermissions,
  TimelineApi,
  TimelineMessage
} from '../../../../shared/timeline-contract'

const protocolVersion = 1 as const

type HistoryView = {
  draft: string
  query: string
  messages: TimelineMessage[]
  nextCursor: number | null
  loading: boolean
  error: string
}

type ViewMap = Record<string, HistoryView>
type PermissionMap = Record<string, HistoryPermissions | undefined>
type BooleanMap = Record<string, boolean>
type TextMap = Record<string, string>

const emptyView: HistoryView = {
  draft: '',
  query: '',
  messages: [],
  nextCursor: null,
  loading: false,
  error: ''
}

function messageError(code: string, correlationId: string): string {
  const messages: Record<string, string> = {
    INVALID_INPUT: '历史请求不符合要求',
    NOT_FOUND: '助手或历史不存在',
    STALE_WRITE: '权限已被其他操作更新，请重试',
    PERMISSION_DENIED: '当前历史权限不足',
    STORAGE_UNAVAILABLE: '本地历史暂时无法读取',
    INTERNAL_ERROR: '历史服务发生内部错误'
  }
  return (messages[code] ?? '历史操作失败') + ' · 关联编号 ' + correlationId
}

function mergeMessages(older: TimelineMessage[], newer: TimelineMessage[]): TimelineMessage[] {
  const seen = new Set<string>()
  return [...older, ...newer].filter((message) => {
    if (seen.has(message.id)) return false
    seen.add(message.id)
    return true
  })
}

type HistoryTurn = {
  requestId: string
  user?: TimelineMessage
  assistant?: TimelineMessage
  index: number
}

function historyTurns(messages: TimelineMessage[]): HistoryTurn[] {
  const pairs = new Map<string, HistoryTurn>()
  messages.forEach((message, index) => {
    const pair = pairs.get(message.requestId) ?? { requestId: message.requestId, index }
    if (message.role === 'user') pair.user = message
    else pair.assistant = message
    pairs.set(message.requestId, pair)
  })
  return [...pairs.values()].sort((left, right) => left.index - right.index)
}

function historyStatusText(status: TimelineMessage['status']): string {
  switch (status) {
    case 'pending':
      return '生成中'
    case 'completed':
      return '完成'
    case 'failed':
      return '失败'
    case 'cancelled':
      return '已取消'
    case 'interrupted':
      return '响应中断'
  }
}

function selectionLabel(content: string): string {
  const compact = content.replace(/\s+/g, ' ').trim()
  return compact.length > 60 ? compact.slice(0, 60) + '…' : compact || '无正文'
}

export function HistoryContextPanel({
  assistantId,
  mode,
  bindingKey,
  timelineApi,
  contextIntent,
  selectedRequestIds,
  onContextIntentChange,
  onSelectedRequestIdsChange
}: {
  assistantId: string
  mode: ChatMode
  bindingKey: string
  timelineApi: TimelineApi
  contextIntent: ContextIntent
  selectedRequestIds: string[]
  onContextIntentChange: (value: ContextIntent) => void
  onSelectedRequestIdsChange: (value: string[]) => void
}): React.JSX.Element | null {
  const [views, setViews] = useState<ViewMap>({})
  const [permissionByAssistant, setPermissionByAssistant] = useState<PermissionMap>({})
  const [permissionLoading, setPermissionLoading] = useState<BooleanMap>({})
  const [permissionErrors, setPermissionErrors] = useState<TextMap>({})
  const historyVersion = useRef(0)
  const permissionVersion = useRef(0)
  const routeRef = useRef('')

  useEffect(() => {
    routeRef.current = assistantId + ':' + mode
    historyVersion.current += 1
    permissionVersion.current += 1
  }, [assistantId, mode])

  const view = views[assistantId] ?? emptyView
  const permission = permissionByAssistant[assistantId]
  const turns = useMemo(() => historyTurns(view.messages), [view.messages])
  const selected = useMemo(() => new Set(selectedRequestIds), [selectedRequestIds])

  const loadHistory = useCallback(
    async (
      targetAssistantId: string,
      query: string,
      before?: number,
      prepend = false
    ): Promise<void> => {
      if (typeof timelineApi.query !== 'function') return
      const version = ++historyVersion.current
      const route = targetAssistantId + ':normal'
      setViews((values) => ({
        ...values,
        [targetAssistantId]: {
          ...(values[targetAssistantId] ?? emptyView),
          loading: true,
          error: ''
        }
      }))
      try {
        const result = await timelineApi.query({
          protocolVersion,
          assistantId: targetAssistantId,
          query,
          ...(before === undefined ? {} : { before })
        })
        if (version !== historyVersion.current || routeRef.current !== route) return
        if (!result.ok) {
          setViews((values) => ({
            ...values,
            [targetAssistantId]: {
              ...(values[targetAssistantId] ?? emptyView),
              loading: false,
              error: messageError(result.error.code, result.error.correlationId)
            }
          }))
          return
        }
        setViews((values) => {
          const current = values[targetAssistantId] ?? emptyView
          return {
            ...values,
            [targetAssistantId]: {
              ...current,
              query,
              messages: prepend
                ? mergeMessages(result.data.messages, current.messages)
                : result.data.messages,
              nextCursor: result.data.nextCursor,
              loading: false,
              error: ''
            }
          }
        })
      } catch {
        if (version !== historyVersion.current || routeRef.current !== route) return
        setViews((values) => ({
          ...values,
          [targetAssistantId]: {
            ...(values[targetAssistantId] ?? emptyView),
            loading: false,
            error: '本地历史暂时无法读取，当前结果已保留'
          }
        }))
      }
    },
    [timelineApi]
  )

  const loadPermissions = useCallback(
    async (targetAssistantId: string): Promise<void> => {
      if (typeof timelineApi.permissions !== 'function') return
      const version = ++permissionVersion.current
      const route = targetAssistantId + ':normal'
      setPermissionLoading((values) => ({ ...values, [targetAssistantId]: true }))
      setPermissionErrors((values) => ({ ...values, [targetAssistantId]: '' }))
      try {
        const result = await timelineApi.permissions({
          protocolVersion,
          assistantId: targetAssistantId
        })
        if (version !== permissionVersion.current || routeRef.current !== route) return
        if (!result.ok) {
          setPermissionErrors((values) => ({
            ...values,
            [targetAssistantId]: messageError(result.error.code, result.error.correlationId)
          }))
          return
        }
        setPermissionByAssistant((values) => ({
          ...values,
          [targetAssistantId]: result.data
        }))
      } catch {
        if (version === permissionVersion.current && routeRef.current === route) {
          setPermissionErrors((values) => ({
            ...values,
            [targetAssistantId]: '历史权限暂时无法读取'
          }))
        }
      } finally {
        if (version === permissionVersion.current && routeRef.current === route) {
          setPermissionLoading((values) => ({ ...values, [targetAssistantId]: false }))
        }
      }
    },
    [timelineApi]
  )

  useEffect(() => {
    if (!assistantId || mode !== 'normal') return
    let active = true
    queueMicrotask(() => {
      if (active) void loadHistory(assistantId, '')
    })
    return () => {
      active = false
    }
  }, [assistantId, mode, loadHistory])

  useEffect(() => {
    if (!assistantId || mode !== 'normal') return
    let active = true
    queueMicrotask(() => {
      if (active) void loadPermissions(assistantId)
    })
    return () => {
      active = false
    }
  }, [assistantId, mode, bindingKey, loadPermissions])

  async function updatePermission(readHistory: boolean, sendHistory: boolean): Promise<void> {
    if (!permission || typeof timelineApi.setPermissions !== 'function') return
    const targetAssistantId = assistantId
    const version = ++permissionVersion.current
    setPermissionLoading((values) => ({ ...values, [targetAssistantId]: true }))
    setPermissionErrors((values) => ({ ...values, [targetAssistantId]: '' }))
    try {
      const result = await timelineApi.setPermissions({
        protocolVersion,
        assistantId: targetAssistantId,
        connectionId: permission.connectionId,
        endpointFingerprint: permission.endpointFingerprint,
        expectedVersion: permission.version,
        readHistory,
        sendHistory
      })
      if (
        version !== permissionVersion.current ||
        routeRef.current !== targetAssistantId + ':normal'
      )
        return
      if (!result.ok) {
        setPermissionErrors((values) => ({
          ...values,
          [targetAssistantId]: messageError(result.error.code, result.error.correlationId)
        }))
        if (result.error.code === 'STALE_WRITE') void loadPermissions(targetAssistantId)
        return
      }
      setPermissionByAssistant((values) => ({
        ...values,
        [targetAssistantId]: result.data
      }))
    } catch {
      if (
        version === permissionVersion.current &&
        routeRef.current === targetAssistantId + ':normal'
      ) {
        setPermissionErrors((values) => ({
          ...values,
          [targetAssistantId]: '权限保存失败，现有设置未改变'
        }))
      }
    } finally {
      if (
        version === permissionVersion.current &&
        routeRef.current === targetAssistantId + ':normal'
      ) {
        setPermissionLoading((values) => ({ ...values, [targetAssistantId]: false }))
      }
    }
  }

  function toggleRequest(requestId: string): void {
    if (selected.has(requestId)) {
      const next = selectedRequestIds.filter((value) => value !== requestId)
      onSelectedRequestIdsChange(next)
      if (next.length === 0 && contextIntent.kind === 'selected') {
        onContextIntentChange({ kind: 'recent' })
      }
      return
    }
    if (selectedRequestIds.length >= 16) return
    onSelectedRequestIdsChange([...selectedRequestIds, requestId])
  }

  if (mode !== 'normal' || !assistantId) return null

  return (
    <section className="history-context" aria-label="浏览正常历史">
      <div className="history-heading">
        <div>
          <h3>完整正常历史</h3>
          <p className="scope-note">
            这里是本机浏览结果，与上方实时消息时间线分开；浏览不会把历史发给模型。
          </p>
        </div>
        <form
          className="history-search"
          onSubmit={(event) => {
            event.preventDefault()
            void loadHistory(assistantId, view.draft)
          }}
        >
          <label>
            搜索本助手历史
            <input
              value={view.draft}
              maxLength={200}
              onChange={(event) => {
                const draft = event.currentTarget.value
                setViews((values) => ({
                  ...values,
                  [assistantId]: { ...(values[assistantId] ?? emptyView), draft }
                }))
              }}
            />
          </label>
          <div className="button-row">
            <button type="submit" disabled={view.loading}>
              搜索
            </button>
            <button
              type="button"
              disabled={view.loading || (!view.query && !view.draft)}
              onClick={() => {
                setViews((values) => ({
                  ...values,
                  [assistantId]: { ...(values[assistantId] ?? emptyView), draft: '' }
                }))
                void loadHistory(assistantId, '')
              }}
            >
              清除搜索
            </button>
          </div>
        </form>
      </div>

      {view.error ? <p role="alert">{view.error}</p> : null}
      {view.loading && view.messages.length === 0 ? <p>正在读取历史…</p> : null}
      {!view.loading && view.messages.length === 0 ? (
        <p className="scope-note">
          {view.query ? '没有找到匹配的正常历史。' : '此助手还没有正常历史。'}
        </p>
      ) : null}
      <div className="history-results">
        {turns.map((turn) => {
          const selectable =
            turn.user?.status === 'completed' && turn.assistant?.status === 'completed'
          const timestamp = turn.user?.createdAt ?? turn.assistant?.createdAt
          return (
            <article key={turn.requestId} className="history-turn">
              {selectable && turn.user ? (
                <label className="inline-check">
                  <input
                    type="checkbox"
                    checked={selected.has(turn.requestId)}
                    disabled={!selected.has(turn.requestId) && selectedRequestIds.length >= 16}
                    onChange={() => toggleRequest(turn.requestId)}
                  />
                  {'选择此轮：' + selectionLabel(turn.user.content)}
                </label>
              ) : (
                <p className="scope-note">此条记录尚未形成可选的完整完成轮次。</p>
              )}
              {turn.user ? (
                <p>
                  <strong>你：</strong>
                  {turn.user.content}
                </p>
              ) : null}
              {turn.assistant ? (
                <p>
                  <strong>助手：</strong>
                  {turn.assistant.content || '未返回正文'}
                </p>
              ) : null}
              <small>
                {timestamp ? new Date(timestamp).toLocaleString('zh-CN') + ' · ' : ''}
                {turn.user ? '你：' + historyStatusText(turn.user.status) : ''}
                {turn.user && turn.assistant ? ' · ' : ''}
                {turn.assistant ? '助手：' + historyStatusText(turn.assistant.status) : ''}
              </small>
            </article>
          )
        })}
      </div>
      {view.nextCursor !== null ? (
        <button
          type="button"
          disabled={view.loading}
          onClick={() =>
            void loadHistory(assistantId, view.query, view.nextCursor ?? undefined, true)
          }
        >
          {view.loading ? '正在加载…' : '加载更早'}
        </button>
      ) : null}

      <fieldset className="context-choice">
        <legend>发送上下文</legend>
        <label className="inline-check">
          <input
            type="radio"
            name={'context-' + assistantId}
            checked={contextIntent.kind === 'recent'}
            onChange={() => onContextIntentChange({ kind: 'recent' })}
          />
          近期合格历史（最多 16 轮）
        </label>
        <label className="inline-check">
          <input
            type="radio"
            name={'context-' + assistantId}
            checked={contextIntent.kind === 'none'}
            onChange={() => onContextIntentChange({ kind: 'none' })}
          />
          仅本次输入
        </label>
        <label className="inline-check">
          <input
            type="radio"
            name={'context-' + assistantId}
            checked={contextIntent.kind === 'selected'}
            disabled={selectedRequestIds.length === 0}
            onChange={() =>
              onContextIntentChange({ kind: 'selected', requestIds: selectedRequestIds })
            }
          />
          已选轮次（最多 16 轮）
        </label>
        <p className="scope-note">
          已选 {selectedRequestIds.length} 轮。近期历史与已选轮次都受 64,000 UTF-16
          字符总输入预算限制；服务不会静默删掉显式选择。
        </p>
      </fieldset>

      <section className="history-permissions" aria-label="历史权限">
        <h3>历史权限</h3>
        <p className="scope-note">
          助手读取自己的正常历史，与向实际 Provider 地址发送历史，是两个独立权限。
        </p>
        {permission ? (
          <>
            <label className="inline-check">
              <input
                type="checkbox"
                checked={permission.readHistory}
                disabled={permissionLoading[assistantId]}
                onChange={(event) =>
                  void updatePermission(event.currentTarget.checked, permission.sendHistory)
                }
              />
              允许助手读取自己的正常历史
            </label>
            <label className="inline-check">
              <input
                type="checkbox"
                checked={permission.sendHistory}
                disabled={
                  permissionLoading[assistantId] ||
                  permission.connectionId === null ||
                  permission.endpointFingerprint === null
                }
                onChange={(event) =>
                  void updatePermission(permission.readHistory, event.currentTarget.checked)
                }
              />
              允许向当前实际接收方发送历史
            </label>
            <p className="receiver">
              {permission.endpointDisplay
                ? '历史实际接收地址：' + permission.endpointDisplay
                : '当前没有可授权的实际接收地址'}
            </p>
            <p className="scope-note">
              {permission.readHistory && permission.sendHistory
                ? '近期或已选历史可在发送时交给上述地址。撤销任一权限会立即停止后续历史外发；已经发出的内容无法从对方收回。'
                : '当前发送不会携带正常历史；选择“已选轮次”发送会明确报权限不足，选择近期历史时只发送本次输入。'}
            </p>
          </>
        ) : permissionLoading[assistantId] ? (
          <p>正在读取权限…</p>
        ) : (
          <p className="scope-note">权限状态暂不可用；你仍可在本机浏览历史。</p>
        )}
        {permissionErrors[assistantId] ? <p role="alert">{permissionErrors[assistantId]}</p> : null}
      </section>
    </section>
  )
}
