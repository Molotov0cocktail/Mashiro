import { useCallback, useState } from 'react'
import type { AssistantSnapshot } from '../../shared/assistant-contract'
import { AssistantPanel } from './features/assistants/AssistantPanel'
import { ProviderPanel } from './features/provider/ProviderPanel'

export function App(): React.JSX.Element {
  const [assistantSnapshot, setAssistantSnapshot] = useState<AssistantSnapshot | null>(null)
  const receiveAssistantSnapshot = useCallback((value: AssistantSnapshot) => {
    setAssistantSnapshot(value)
  }, [])

  return (
    <main>
      <header>
        <p className="eyebrow">本机优先 · 持续时间线</p>
        <h1>Mashiro 助手</h1>
        <p>管理稳定助手身份，并在正常记录与严格临时交流之间清楚选择。</p>
      </header>
      <AssistantPanel api={window.mashiro.assistants} onSnapshot={receiveAssistantSnapshot} />
      <ProviderPanel
        assistantSnapshot={assistantSnapshot}
        api={window.mashiro.provider}
        timelineApi={window.mashiro.timeline}
      />
    </main>
  )
}
