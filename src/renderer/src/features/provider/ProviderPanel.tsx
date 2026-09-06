import { useEffect, useMemo, useState } from 'react'
import type { AssistantSnapshot } from '../../../../shared/assistant-contract'
import type {
  ProviderApi,
  ProviderResult,
  ProviderSnapshot
} from '../../../../shared/provider-contract'

const protocolVersion = 1 as const
const errorMessages: Record<string, string> = {
  INVALID_INPUT: '输入不符合要求，请检查后重试',
  NOT_FOUND: '连接或助手绑定不存在',
  STALE_WRITE: '设置已变化，请刷新后重试',
  ASSISTANT_ARCHIVED: '已归档助手不能发起临时交流',
  CONNECTION_DISABLED: '当前连接已停用',
  CREDENTIAL_MISSING: '请先为连接设置 API Key',
  CREDENTIAL_PROTECTION_UNAVAILABLE: 'Windows 凭据保护不可用，无法持久保存 Key',
  REQUEST_IN_PROGRESS: '这个助手已有请求正在进行',
  AUTHENTICATION: 'Provider 认证失败，请检查 Key',
  QUOTA: 'Provider 额度不足或不可用',
  CONFIGURATION: '连接地址或模型配置无效',
  TEMPORARY: 'Provider 暂时不可用，请稍后手动重试',
  PROTOCOL: 'Provider 返回不完整或格式异常，已保留部分输出',
  TIMEOUT: '请求超时，已保留部分输出',
  LIMIT: '临时上下文或响应达到安全上限，请清空本助手的临时会话后继续',
  CANCELLED: '请求已取消',
  STORAGE_UNAVAILABLE: 'Provider 设置暂时无法读取',
  INTERNAL_ERROR: 'Provider 服务发生内部错误'
}
type Transcript = {
  role: 'user' | 'assistant'
  text: string
  requestId?: string
  status?: string
  usage?: string
}
type TranscriptMap = Record<string, Transcript[]>
type RequestMap = Record<string, string>

function errorText(result: Extract<ProviderResult, { ok: false }>): string {
  return `${errorMessages[result.error.code] ?? '操作失败'} · 关联编号 ${result.error.correlationId}`
}

export function ProviderPanel({
  assistantSnapshot,
  api
}: {
  assistantSnapshot: AssistantSnapshot | null
  api: ProviderApi
}): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<ProviderSnapshot | null>(null)
  const [selectedId, setSelectedId] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [baseUrl, setBaseUrl] = useState('https://open.bigmodel.cn/api/paas/v4')
  const [enabled, setEnabled] = useState(true)
  const [apiKey, setApiKey] = useState('')
  const [persistent, setPersistent] = useState(false)
  const [modelDrafts, setModelDrafts] = useState<Record<string, string>>({})
  const [textDrafts, setTextDrafts] = useState<Record<string, string>>({})
  const [stream, setStream] = useState(true)
  const [transcripts, setTranscripts] = useState<TranscriptMap>({})
  const [activeRequests, setActiveRequests] = useState<RequestMap>({})
  const [error, setError] = useState<string | null>(null)

  const currentAssistantId = assistantSnapshot?.currentAssistantId ?? ''
  const selected = snapshot?.connections.find((item) => item.id === selectedId)
  const binding = snapshot?.bindings.find((item) => item.assistantId === currentAssistantId)
  const executionConnection = snapshot?.connections.find(
    (item) => item.id === binding?.connectionId
  )
  const model = modelDrafts[currentAssistantId] ?? binding?.model ?? 'GLM-5.3-FLASH'
  const text = textDrafts[currentAssistantId] ?? ''
  const transcript = transcripts[currentAssistantId] ?? []
  const activeRequestId = activeRequests[currentAssistantId]

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
      } else setError(errorText(result))
    })
    const remove = api.onEvent((event) => {
      setActiveRequests((requests) => {
        if (requests[event.assistantId] !== event.requestId) return requests
        if (event.type === 'delta') {
          setTranscripts((items) =>
            updateRequest(items, event.assistantId, event.requestId, (last) => ({
              ...last,
              text: last.text + event.text,
              status: '生成中'
            }))
          )
          return requests
        }
        const next = { ...requests }
        delete next[event.assistantId]
        return next
      })
    })
    return () => {
      active = false
      remove()
    }
  }, [api])

  const receiver = useMemo(() => {
    if (!executionConnection || !binding) return null
    return `${executionConnection.displayName} · ${executionConnection.baseUrl} · ${binding.model}`
  }, [executionConnection, binding])

  async function apply(operation: () => Promise<ProviderResult>): Promise<void> {
    setError(null)
    try {
      const result = await operation()
      if (result.ok) {
        setSnapshot(result.data)
        if (!selectedId) setSelectedId(result.data.connections.at(-1)?.id ?? '')
      } else setError(errorText(result))
    } catch {
      setError('Provider 服务暂时不可用')
    }
  }

  async function send(): Promise<void> {
    if (!currentAssistantId || !text.trim() || activeRequestId) return
    const requestId = crypto.randomUUID()
    const assistantId = currentAssistantId
    const submitted = text
    setTextDrafts((items) => ({ ...items, [assistantId]: '' }))
    setError(null)
    setTranscripts((items) => ({
      ...items,
      [assistantId]: [
        ...(items[assistantId] ?? []),
        { role: 'user', text: submitted },
        { role: 'assistant', text: '', requestId, status: '正在发送' }
      ]
    }))
    setActiveRequests((items) => ({ ...items, [assistantId]: requestId }))
    const result = await api.startChat({
      protocolVersion,
      requestId,
      assistantId,
      text: submitted,
      stream
    })
    setActiveRequests((items) => {
      if (items[assistantId] !== requestId) return items
      const next = { ...items }
      delete next[assistantId]
      return next
    })
    if (!result.ok) {
      setError(
        `${errorMessages[result.error.code] ?? '请求失败'} · 关联编号 ${result.error.correlationId}`
      )
      setTranscripts((items) =>
        updateRequest(items, assistantId, requestId, (last) => ({ ...last, status: '失败' }))
      )
      return
    }
    setTranscripts((items) =>
      updateRequest(items, assistantId, requestId, (last) => ({
        ...last,
        text: result.data.text,
        status:
          result.data.status === 'completed'
            ? '完成'
            : result.data.status === 'cancelled'
              ? '已取消'
              : '响应中断，部分输出已保留',
        usage: result.data.usage
          ? `输入 ${result.data.usage.promptTokens} / 输出 ${result.data.usage.completionTokens} / 合计 ${result.data.usage.totalTokens} tokens`
          : '用量未知'
      }))
    )
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
          <p className="eyebrow">严格临时交流</p>
          <h1 id="provider-heading">连接与临时文本</h1>
        </div>
        <p className="privacy-note">正文仅在本次运行内存中保留，不写入时间线或长期记忆</p>
      </div>
      {error ? <p role="alert">{error}</p> : null}

      <div className="provider-grid">
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

        <div className="temporary-chat">
          <h2>本次运行的临时会话</h2>
          <label>
            当前助手
            <select value={currentAssistantId} disabled>
              <option value={currentAssistantId}>
                {assistantSnapshot?.assistants.find((item) => item.id === currentAssistantId)
                  ?.displayName ?? '请先创建助手'}
              </option>
            </select>
          </label>
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
            {receiver ? `实际接收方：${receiver}` : '请先保存连接并绑定当前助手'}
          </p>

          <div className="transcript" aria-live="polite">
            {transcript.map((item, index) => (
              <article key={index} className={item.role}>
                <strong>{item.role === 'user' ? '你' : '助手'}</strong>
                <p>{item.text || '…'}</p>
                {item.status ? (
                  <small>
                    {item.status}
                    {item.usage ? ` · ${item.usage}` : ''}
                  </small>
                ) : null}
              </article>
            ))}
          </div>
          <button
            type="button"
            disabled={!currentAssistantId || Boolean(activeRequestId)}
            onClick={() => {
              void apply(() => api.clearChat({ protocolVersion, assistantId: currentAssistantId }))
              setTranscripts((items) => ({ ...items, [currentAssistantId]: [] }))
            }}
          >
            清空本助手的临时会话
          </button>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void send()
            }}
          >
            <label>
              临时消息
              <textarea
                value={text}
                maxLength={16000}
                onChange={(event) => {
                  const value = event.currentTarget.value
                  setTextDrafts((items) => ({ ...items, [currentAssistantId]: value }))
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
              <button
                type="submit"
                disabled={!receiver || !text.trim() || Boolean(activeRequestId)}
              >
                发送
              </button>
              <button
                type="button"
                disabled={!activeRequestId}
                onClick={() =>
                  activeRequestId &&
                  void api.cancelChat({
                    protocolVersion,
                    requestId: activeRequestId,
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

function updateRequest(
  values: TranscriptMap,
  assistantId: string,
  requestId: string,
  update: (value: Transcript) => Transcript
): TranscriptMap {
  const items = [...(values[assistantId] ?? [])]
  let index = items.length - 1
  while (
    index >= 0 &&
    (items[index]?.role !== 'assistant' || items[index]?.requestId !== requestId)
  ) {
    index -= 1
  }
  if (index >= 0) items[index] = update(items[index]!)
  return { ...values, [assistantId]: items }
}
