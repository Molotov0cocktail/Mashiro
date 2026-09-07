import { useEffect, useRef, useState } from 'react'
import type { MemoryApi } from '../../../../shared/memory-contract'
import type { ProviderApi } from '../../../../shared/provider-contract'
import type { ReminderApi } from '../../../../shared/reminder-contract'
import type { RetentionChanged, RetentionIntent } from '../../../../shared/retention-contract'
import type { HistoryCitation, ToolOperation } from '../../../../shared/tool-contract'
import { RoundToolReceiptPanel } from './RoundToolReceiptPanel'

const protocolVersion = 1 as const

export function OldRoundReceiptPanel({
  assistantId,
  requestId,
  roundLabel,
  api,
  memoryApi,
  reminderApi,
  retentionChange,
  onMemoryChanged,
  onItemChanged,
  onReminderChanged,
  onOpenItems,
  onLocateMemorySource,
  onPrepareRetention,
  onLocateCitation
}: {
  assistantId: string
  requestId: string
  roundLabel: string
  api: Pick<ProviderApi, 'tools'>
  memoryApi?: MemoryApi
  reminderApi?: ReminderApi
  retentionChange?: RetentionChanged | null
  onMemoryChanged?: () => void
  onItemChanged?: () => void
  onReminderChanged?: () => void
  onOpenItems?: (recovery?: {
    assistantId: string
    commandId: string
    confirmationAction?: 'replace-content'
  }) => void
  onLocateMemorySource?: (source: { assistantId: string; id: string }) => Promise<void>
  onPrepareRetention?: (intent: RetentionIntent) => void
  onLocateCitation: (citation: HistoryCitation) => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [operations, setOperations] = useState<ToolOperation[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const readVersion = useRef(0)

  useEffect(
    () => () => {
      readVersion.current += 1
    },
    []
  )

  async function load(): Promise<void> {
    const version = ++readVersion.current
    setOpen(true)
    setLoading(true)
    setError('')
    setOperations([])
    try {
      const result = await api.tools({
        protocolVersion,
        assistantId,
        mode: 'normal',
        requestId
      })
      if (version !== readVersion.current) return
      if (!result.ok) {
        setError('本轮可信回执读取失败 · 关联编号 ' + result.error.correlationId)
        return
      }
      if (
        result.data.assistantId !== assistantId ||
        result.data.mode !== 'normal' ||
        result.data.operations.some(
          (operation) => operation.assistantId !== assistantId || operation.requestId !== requestId
        )
      ) {
        setError('回执与所选轮次归属不一致，已拒绝显示。')
        return
      }
      setOperations(result.data.operations)
    } catch {
      if (version === readVersion.current) setError('本轮可信回执暂时无法读取，请重试。')
    } finally {
      if (version === readVersion.current) setLoading(false)
    }
  }

  function close(): void {
    readVersion.current += 1
    setOpen(false)
    setLoading(false)
    setError('')
    setOperations([])
  }

  return (
    <div className="old-round-receipts">
      <button type="button" aria-expanded={open} onClick={() => (open ? close() : void load())}>
        {open ? '收起本轮业务与工具回执' : '查看本轮业务与工具回执'}
      </button>
      {open ? (
        <RoundToolReceiptPanel
          assistantId={assistantId}
          requestId={requestId}
          roundLabel={roundLabel}
          memoryApi={memoryApi}
          reminderApi={reminderApi}
          operations={operations}
          operationLoading={loading}
          operationError={error}
          onRefreshOperation={() => void load()}
          onMemoryChanged={onMemoryChanged}
          onItemChanged={onItemChanged}
          onReminderChanged={onReminderChanged}
          onOpenItems={onOpenItems}
          onLocateMemorySource={onLocateMemorySource}
          retentionChange={retentionChange}
          onPrepareRetention={onPrepareRetention}
          onLocateCitation={onLocateCitation}
        />
      ) : null}
    </div>
  )
}
