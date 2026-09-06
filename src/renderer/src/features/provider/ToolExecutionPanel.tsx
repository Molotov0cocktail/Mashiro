import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  MemoryApi,
  MemoryPermissions,
  MemoryReceipt
} from '../../../../shared/memory-contract'
import type { RetentionChanged, RetentionIntent } from '../../../../shared/retention-contract'
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

function toolLabel(toolName: ToolOperation['toolName']): string {
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
  }
}

function operationAriaLabel(toolName: ToolOperation['toolName']): string {
  if (toolName === 'get_current_time') return '时钟读取操作'
  if (toolName === 'search_conversation_history') return '历史检索操作'
  return toolLabel(toolName) + '操作'
}

function operationStateText(operation: ToolOperation, receipt?: MemoryReceipt): string {
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

function MemoryReceiptCard({
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

export function ToolExecutionPanel({
  assistantId,
  mode,
  contextIntent,
  memoryApi,
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
  onLocateMemorySource,
  retentionChange,
  onPrepareRetention
}: {
  assistantId: string
  mode: ChatMode
  contextIntent: ContextIntent
  memoryApi?: MemoryApi
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
  onLocateMemorySource?: (source: { assistantId: string; id: string }) => Promise<void>
  retentionChange?: RetentionChanged | null
  onPrepareRetention?: (intent: RetentionIntent) => void
}): React.JSX.Element {
  const [memoryPermissions, setMemoryPermissions] = useState<MemoryPermissions[]>([])
  const [memoryPermissionLoading, setMemoryPermissionLoading] = useState(false)
  const [memoryPermissionError, setMemoryPermissionError] = useState('')
  const memoryPermissionVersion = useRef(0)
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
            ? '严格临时只可使用本机时钟。临时工具不会读取正常历史，也不会形成可重启的协议或操作记录；同时不会读取或写入记忆、个人事件。'
            : visibleScope === 'clock-and-history'
              ? contextIntent.kind === 'selected'
                ? '你已明确允许本轮模型仅按关键词检索所选轮次；仍须同时具备历史读取与当前实际接收方发送权限。未选择的历史不会进入工具检索范围。'
                : '你已明确允许本轮模型按关键词检索本助手完整正常历史；仍须同时具备历史读取与当前实际接收方发送权限。近期上下文仍只控制随请求直接发送的近期轮次，不会暗中扩成全部历史。'
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
