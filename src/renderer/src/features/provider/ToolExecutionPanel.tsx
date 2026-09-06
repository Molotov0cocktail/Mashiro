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
  return toolName === 'get_current_time' ? '本机时钟' : '历史检索'
}

function operationAriaLabel(toolName: ToolOperation['toolName']): string {
  return toolName === 'get_current_time' ? '时钟读取操作' : '历史检索操作'
}

export function ToolExecutionPanel({
  assistantId,
  mode,
  contextIntent,
  capability,
  capabilityLoading,
  capabilityError,
  scope,
  operations,
  operationLoading,
  operationError,
  onScopeChange,
  onRefreshOperation,
  onLocateCitation
}: {
  assistantId: string
  mode: ChatMode
  contextIntent: ContextIntent
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
}): React.JSX.Element {
  const toolsAvailable = capability?.toolsAvailable === true
  const visibleScope = toolsAvailable ? scope : 'off'
  const historyDisabled =
    !assistantId || capabilityLoading || !toolsAvailable || contextIntent.kind === 'none'

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
        ) : null}
        <p className="scope-note">
          {mode === 'temporary'
            ? '严格临时只可使用本机时钟。临时工具不会读取正常历史，也不会形成可重启的协议或操作记录。'
            : visibleScope === 'clock-and-history'
              ? contextIntent.kind === 'selected'
                ? '你已明确允许本轮模型仅按关键词检索所选轮次；仍须同时具备历史读取与当前实际接收方发送权限。未选择的历史不会进入工具检索范围。'
                : '你已明确允许本轮模型按关键词检索本助手完整正常历史；仍须同时具备历史读取与当前实际接收方发送权限。近期上下文仍只控制随请求直接发送的近期轮次，不会暗中扩成全部历史。'
              : contextIntent.kind === 'none'
                ? '“仅本次输入”禁止历史检索工具；如需检索，请先选择近期或已选轮次，再明确开启历史工具。'
                : '工具范围只影响下一次发送，默认关闭；模型文字不能代替可信执行回执。'}
        </p>
        {capabilityLoading ? <p>正在读取当前端点能力…</p> : null}
        {!capabilityLoading && !capability ? (
          <p role="status">能力记录不可用，工具保持关闭。</p>
        ) : null}
        {capabilityError ? <p role="alert">{capabilityError}</p> : null}
      </fieldset>

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
                <span className="operation-state">{operationStateLabels[operation.state]}</span>
              </div>
              <p>{operation.summary}</p>
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
