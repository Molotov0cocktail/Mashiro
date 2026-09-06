import { useCallback, useState } from 'react'
import type { AssistantSnapshot } from '../../shared/assistant-contract'
import { AssistantPanel } from './features/assistants/AssistantPanel'
import { MemoryPanel } from './features/memory/MemoryPanel'
import { ProviderPanel } from './features/provider/ProviderPanel'

export function App(): React.JSX.Element {
  const [assistantSnapshot, setAssistantSnapshot] = useState<AssistantSnapshot | null>(null)
  const [historyTarget, setHistoryTarget] = useState<{
    assistantId: string
    requestId: string
    nonce: number
  } | null>(null)
  const [navigationError, setNavigationError] = useState('')
  const [activeView, setActiveView] = useState<'chat' | 'memory'>('chat')
  const [memoryRefreshKey, setMemoryRefreshKey] = useState(0)
  const [pendingMemoryCommands] = useState(() => new Map<string, string>())
  const receiveAssistantSnapshot = useCallback((value: AssistantSnapshot) => {
    setAssistantSnapshot(value)
  }, [])

  const locateMemorySource = useCallback(
    async (source: { assistantId: string; id: string }): Promise<void> => {
      if (!assistantSnapshot) return
      setNavigationError('')
      let nextSnapshot = assistantSnapshot
      if (source.assistantId !== assistantSnapshot.currentAssistantId) {
        try {
          const result = await window.mashiro.assistants.switch({
            protocolVersion: 1,
            assistantId: source.assistantId,
            expectedStateRevision: assistantSnapshot.stateRevision
          })
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
        />
      </section>
    </main>
  )
}
