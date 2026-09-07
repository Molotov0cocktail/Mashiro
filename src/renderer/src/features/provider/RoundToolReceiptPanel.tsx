import { useEffect, useRef, useState } from 'react'
import type { MemoryApi, MemoryReceipt } from '../../../../shared/memory-contract'
import type { ReminderApi } from '../../../../shared/reminder-contract'
import type { RetentionChanged, RetentionIntent } from '../../../../shared/retention-contract'
import type { HistoryCitation, ToolOperation } from '../../../../shared/tool-contract'
import {
  ItemReceiptCard,
  MemoryReceiptCard,
  ReminderConversationCard,
  ReminderReceiptCard,
  operationAriaLabel,
  operationStateText,
  toolLabel
} from './ToolExecutionPanel'

type MemoryConfirmationState = { receipt: MemoryReceipt; busy: boolean; error: string }

export function RoundToolReceiptPanel({
  assistantId,
  requestId,
  roundLabel,
  memoryApi,
  reminderApi,
  operations,
  operationLoading,
  operationError,
  onRefreshOperation,
  onMemoryChanged,
  onItemChanged,
  onReminderChanged,
  onOpenItems,
  onLocateMemorySource,
  retentionChange,
  onPrepareRetention,
  onLocateCitation
}: {
  assistantId: string
  requestId: string
  roundLabel: string
  memoryApi?: MemoryApi
  reminderApi?: ReminderApi
  operations: ToolOperation[]
  operationLoading: boolean
  operationError: string
  onRefreshOperation: () => void
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
  onLocateCitation: (citation: HistoryCitation) => void
}): React.JSX.Element {
  const [memoryConfirmations, setMemoryConfirmations] = useState<
    Record<string, MemoryConfirmationState>
  >({})
  const confirmingMemoryOperations = useRef(new Set<string>())
  const generation = useRef(0)

  useEffect(() => {
    const confirming = confirmingMemoryOperations.current
    generation.current += 1
    confirming.clear()
    return () => {
      generation.current += 1
      confirming.clear()
    }
  }, [assistantId, requestId])

  useEffect(() => {
    if (
      !retentionChange ||
      retentionChange.reason === 'job-status' ||
      !retentionChange.assistantIds.includes(assistantId)
    )
      return
    generation.current += 1
    confirmingMemoryOperations.current.clear()
    if (retentionChange.reason === 'cleanup' || retentionChange.reason === 'purge') {
      queueMicrotask(() => setMemoryConfirmations({}))
    }
  }, [assistantId, retentionChange])

  async function confirmMemoryOperation(
    operation: ToolOperation,
    receipt: MemoryReceipt,
    accept: boolean
  ): Promise<void> {
    if (
      !memoryApi ||
      operation.assistantId !== assistantId ||
      operation.requestId !== requestId ||
      !receipt.confirmationId ||
      confirmingMemoryOperations.current.has(receipt.operationId)
    )
      return
    confirmingMemoryOperations.current.add(receipt.operationId)
    const currentGeneration = generation.current
    setMemoryConfirmations((values) => ({
      ...values,
      [receipt.operationId]: { receipt, busy: true, error: '' }
    }))
    try {
      const result = await memoryApi.confirm({
        protocolVersion: 1,
        assistantId,
        confirmationId: receipt.confirmationId,
        accept
      })
      if (currentGeneration !== generation.current) return
      if (!result.ok) {
        setMemoryConfirmations((values) => ({
          ...values,
          [receipt.operationId]: {
            receipt: values[receipt.operationId]?.receipt ?? receipt,
            busy: false,
            error: '确认失败：' + result.error.message
          }
        }))
        onRefreshOperation()
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
        onRefreshOperation()
        return
      }
      setMemoryConfirmations((values) => ({
        ...values,
        [receipt.operationId]: { receipt: result.data, busy: false, error: '' }
      }))
      onRefreshOperation()
      if (accept && result.data.state === 'SUCCEEDED') onMemoryChanged?.()
    } catch {
      if (currentGeneration !== generation.current) return
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
    <section
      className="operation-panel old-round-operation-panel"
      aria-label="所选轮次业务与工具回执"
    >
      <div className="operation-heading">
        <div>
          <h4>此轮业务与工具回执</h4>
          <p className="scope-note">所选轮次：{roundLabel}</p>
          <p className="scope-note">
            这里仅显示该正常轮次已保存的可信操作记录；查看和核查不会重发模型请求或业务命令。
          </p>
        </div>
        {operationLoading ? <span>正在读取本轮回执…</span> : null}
      </div>
      {operationError ? <p role="alert">{operationError}</p> : null}
      {!operationLoading && !operationError && operations.length === 0 ? (
        <p className="scope-note">所选轮次没有可信工具或业务回执。</p>
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
                onRefresh={onRefreshOperation}
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
              <button type="button" onClick={onRefreshOperation}>
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
  )
}
