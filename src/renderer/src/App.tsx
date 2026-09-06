import { useCallback, useEffect, useRef, useState } from 'react'
import type { AssistantSnapshot } from '../../shared/assistant-contract'
import type {
  RetentionChanged,
  RetentionIntent,
  RetentionPreview
} from '../../shared/retention-contract'
import { AssistantPanel } from './features/assistants/AssistantPanel'
import { MemoryPanel } from './features/memory/MemoryPanel'
import { ProviderPanel } from './features/provider/ProviderPanel'
import { RetentionPanel } from './features/retention/RetentionPanel'

type RetentionTarget = RetentionIntent['target']
type PreparedRetention = {
  assistantId: string
  target: RetentionTarget
  intent?: RetentionPreview['intent']
  nonce: number
}

export function App(): React.JSX.Element {
  const [assistantSnapshot, setAssistantSnapshot] = useState<AssistantSnapshot | null>(null)
  const [historyTarget, setHistoryTarget] = useState<{
    assistantId: string
    requestId: string
    nonce: number
  } | null>(null)
  const [navigationError, setNavigationError] = useState('')
  const [activeView, setActiveView] = useState<'chat' | 'memory' | 'retention'>('chat')
  const [memoryRefreshKey, setMemoryRefreshKey] = useState(0)
  const [pendingMemoryCommands] = useState(() => new Map<string, string>())
  const [retentionChange, setRetentionChange] = useState<RetentionChanged | null>(null)
  const [retentionTarget, setRetentionTarget] = useState<PreparedRetention | null>(null)
  const [lastGovernanceAssistantId, setLastGovernanceAssistantId] = useState('')
  const governanceEpoch = useRef(0)
  const assistantRequestVersion = useRef(0)

  const receiveAssistantSnapshot = useCallback((value: AssistantSnapshot) => {
    assistantRequestVersion.current += 1
    setAssistantSnapshot((current) =>
      current && current.stateRevision > value.stateRevision ? current : value
    )
    if (value.currentAssistantId) setLastGovernanceAssistantId(value.currentAssistantId)
  }, [])

  const locateMemorySource = useCallback(
    async (source: { assistantId: string; id: string }): Promise<void> => {
      if (!assistantSnapshot) return
      setNavigationError('')
      const governance = governanceEpoch.current
      const requestVersion = ++assistantRequestVersion.current
      let nextSnapshot = assistantSnapshot
      if (source.assistantId !== assistantSnapshot.currentAssistantId) {
        try {
          const result = await window.mashiro.assistants.switch({
            protocolVersion: 1,
            assistantId: source.assistantId,
            expectedStateRevision: assistantSnapshot.stateRevision
          })
          if (
            governance !== governanceEpoch.current ||
            requestVersion !== assistantRequestVersion.current
          )
            return
          if (!result.ok) {
            setNavigationError(result.error.message)
            return
          }
          nextSnapshot = result.data
          setAssistantSnapshot(result.data)
        } catch {
          setNavigationError('无法切换到来源助手，当前页面状态已保留')
          return
        }
      }
      if (nextSnapshot.currentAssistantId !== source.assistantId) {
        setNavigationError('来源助手状态已变化，请刷新后重试')
        return
      }
      setHistoryTarget((current) => ({
        assistantId: source.assistantId,
        requestId: source.id,
        nonce: (current?.nonce ?? 0) + 1
      }))
      setActiveView('chat')
    },
    [assistantSnapshot]
  )

  const openMemory = useCallback(() => {
    setMemoryRefreshKey((value) => value + 1)
    setActiveView('memory')
  }, [])

  const receiveMemoryChange = useCallback(() => {
    setMemoryRefreshKey((value) => value + 1)
  }, [])

  const refreshAssistants = useCallback(async (): Promise<void> => {
    const governance = governanceEpoch.current
    const requestVersion = ++assistantRequestVersion.current
    try {
      const result = await window.mashiro.assistants.list({ protocolVersion: 1 })
      if (
        governance !== governanceEpoch.current ||
        requestVersion !== assistantRequestVersion.current
      )
        return
      if (result.ok) setAssistantSnapshot(result.data)
    } catch {
      setNavigationError('助手列表暂时无法刷新；数据治理状态仍以清理作业为准')
    }
  }, [])

  useEffect(() => {
    const retention = window.mashiro.retention
    if (!retention) return
    return retention.onChanged((event) => {
      governanceEpoch.current = event.epoch
      assistantRequestVersion.current += 1
      setRetentionChange(event)
      if (event.reason === 'job-status') return
      setMemoryRefreshKey((value) => value + 1)
      setLastGovernanceAssistantId((value) => event.assistantIds.at(-1) ?? value)
      if (
        historyTarget &&
        (event.assistantIds.includes(historyTarget.assistantId) ||
          event.requestIds.includes(historyTarget.requestId))
      ) {
        setHistoryTarget(null)
      }
      if (event.reason === 'cleanup' || event.reason === 'purge') {
        for (const key of [...pendingMemoryCommands.keys()]) {
          try {
            const parsed = JSON.parse(key) as { domain?: unknown }
            if (parsed.domain === 'memory-mutation') continue
            pendingMemoryCommands.delete(key)
          } catch {
            pendingMemoryCommands.delete(key)
          }
        }
      }
      void refreshAssistants()
    })
  }, [historyTarget, pendingMemoryCommands, refreshAssistants])

  const prepareRetention = useCallback(
    (assistantId: string, target: RetentionTarget, intent?: RetentionPreview['intent']): void => {
      setRetentionTarget((value) => ({
        assistantId,
        target,
        intent,
        nonce: (value?.nonce ?? 0) + 1
      }))
      setLastGovernanceAssistantId(assistantId)
      setActiveView('retention')
    },
    []
  )

  return (
    <main>
      <header>
        <p className="eyebrow">本机优先 · 你的日常助手</p>
        <h1>Mashiro</h1>
        <p>在持续对话中处理当下，也可以随时查看和纠正长期记忆。</p>
      </header>

      <nav className="primary-nav" aria-label="主要功能" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeView === 'chat'}
          onClick={() => setActiveView('chat')}
        >
          对话
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeView === 'memory'}
          onClick={openMemory}
        >
          记忆与事件
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeView === 'retention'}
          onClick={() => setActiveView('retention')}
        >
          保留与清理
        </button>
      </nav>

      <details className="assistant-settings">
        <summary>助手管理</summary>
        <AssistantPanel
          api={window.mashiro.assistants}
          onSnapshot={receiveAssistantSnapshot}
          externalSnapshot={assistantSnapshot}
        />
      </details>
      {navigationError ? <p role="alert">{navigationError}</p> : null}

      <section hidden={activeView !== 'chat'} aria-label="对话页面">
        <ProviderPanel
          assistantSnapshot={assistantSnapshot}
          api={window.mashiro.provider}
          timelineApi={window.mashiro.timeline}
          memoryApi={window.mashiro.memory}
          historyTarget={historyTarget}
          onMemoryChanged={receiveMemoryChange}
          onLocateMemorySource={locateMemorySource}
          retentionChange={retentionChange}
          onPrepareRetention={prepareRetention}
        />
      </section>
      <section hidden={activeView !== 'memory'} aria-label="记忆与事件页面">
        <MemoryPanel
          key={assistantSnapshot?.currentAssistantId ?? ''}
          assistantId={assistantSnapshot?.currentAssistantId ?? ''}
          assistantName={
            assistantSnapshot?.assistants.find(
              (assistant) => assistant.id === assistantSnapshot.currentAssistantId
            )?.displayName ?? ''
          }
          api={window.mashiro.memory}
          onLocateRound={locateMemorySource}
          refreshKey={memoryRefreshKey}
          pendingCommands={pendingMemoryCommands}
          retentionChange={retentionChange}
          onPrepareRetention={prepareRetention}
        />
      </section>
      <section hidden={activeView !== 'retention'} aria-label="保留与清理页面">
        {window.mashiro.retention ? (
          <RetentionPanel
            api={window.mashiro.retention}
            memoryApi={window.mashiro.memory}
            assistantSnapshot={assistantSnapshot}
            fallbackAssistantId={assistantSnapshot?.currentAssistantId ?? lastGovernanceAssistantId}
            preparedTarget={retentionTarget}
            changed={retentionChange}
            pendingCommands={pendingMemoryCommands}
            onRefreshAssistants={refreshAssistants}
          />
        ) : (
          <p role="alert">本机保留与清理服务尚未就绪。</p>
        )}
      </section>
    </main>
  )
}
