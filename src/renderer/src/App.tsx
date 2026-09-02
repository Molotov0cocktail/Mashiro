import { AssistantPanel } from './features/assistants/AssistantPanel'

export function App(): React.JSX.Element {
  return (
    <main>
      <header>
        <p className="eyebrow">本机优先 · F1</p>
        <h1>Mashiro 助手</h1>
        <p>创建并管理稳定的本地助手身份。</p>
      </header>
      <AssistantPanel api={window.mashiro.assistants} />
    </main>
  )
}
