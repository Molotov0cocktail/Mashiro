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
        <p className="eyebrow">本机优先 · Provider Text</p>
        <h1>Mashiro 助手</h1>
        <p>管理稳定助手身份，并与明确连接的模型进行不留存的临时文本交流。</p>
      </header>
      <AssistantPanel api={window.mashiro.assistants} onSnapshot={receiveAssistantSnapshot} />
      <ProviderPanel assistantSnapshot={assistantSnapshot} api={window.mashiro.provider} />
    </main>
  )
}
