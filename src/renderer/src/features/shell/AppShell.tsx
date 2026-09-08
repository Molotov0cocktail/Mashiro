import type { ReactNode } from 'react'

export type ShellArea =
  'chat' | 'items' | 'reminders' | 'memory' | 'automation' | 'operations' | 'settings'

type ShellAssistant = {
  id: string
  displayName: string
  isArchived: boolean
}

const primaryItems: Array<{ area: ShellArea; label: string; description: string }> = [
  { area: 'chat', label: '对话', description: '和当前助手交流' },
  { area: 'items', label: '事项', description: '计划、承诺与待确认' },
  { area: 'reminders', label: '提醒', description: '时间安排与补发' },
  { area: 'memory', label: '记忆', description: '长期信息与个人事件' }
]

const workItems: Array<{ area: ShellArea; label: string; description: string }> = [
  { area: 'automation', label: '自动工作', description: '整理、观察与回顾' },
  { area: 'operations', label: '运行记录', description: '状态、故障与用量' }
]

export function AppShell({
  activeArea,
  title,
  description,
  assistants,
  currentAssistantId,
  switchingAssistant = false,
  onSwitchAssistant,
  onNavigate,
  contextNavigation,
  children
}: {
  activeArea: ShellArea
  title: string
  description: string
  assistants: ShellAssistant[]
  currentAssistantId: string
  switchingAssistant?: boolean
  onSwitchAssistant: (assistantId: string) => void
  onNavigate: (area: ShellArea) => void
  contextNavigation?: ReactNode
  children: ReactNode
}): React.JSX.Element {
  const availableAssistants = assistants.filter((assistant) => !assistant.isArchived)

  const navigationButton = (item: {
    area: ShellArea
    label: string
    description: string
  }): React.JSX.Element => (
    <button
      key={item.area}
      type="button"
      className="shell-nav-item"
      aria-label={item.label}
      aria-current={activeArea === item.area ? 'page' : undefined}
      onClick={() => onNavigate(item.area)}
    >
      <span>{item.label}</span>
      <small>{item.description}</small>
    </button>
  )

  return (
    <main className={`app-shell app-shell-${activeArea}`}>
      <aside className="app-sidebar">
        <div className="app-brand" aria-label="Mashiro">
          <span className="app-brand-mark" aria-hidden="true">
            M
          </span>
          <span>
            <strong>Mashiro</strong>
            <small>本机日常助手</small>
          </span>
        </div>

        <label className="assistant-switcher">
          <span>当前助手</span>
          <select
            value={currentAssistantId}
            disabled={switchingAssistant || availableAssistants.length === 0}
            onChange={(event) => onSwitchAssistant(event.currentTarget.value)}
          >
            {availableAssistants.length === 0 ? <option value="">尚未创建助手</option> : null}
            {availableAssistants.map((assistant) => (
              <option key={assistant.id} value={assistant.id}>
                {assistant.displayName}
              </option>
            ))}
          </select>
        </label>

        <nav className="shell-navigation" aria-label="主要功能">
          <div className="shell-nav-group">{primaryItems.map(navigationButton)}</div>
          <div className="shell-nav-divider" />
          <div className="shell-nav-group">{workItems.map(navigationButton)}</div>
        </nav>

        <button
          type="button"
          className="shell-nav-item shell-settings-link"
          aria-label="设置"
          aria-current={activeArea === 'settings' ? 'page' : undefined}
          onClick={() => onNavigate('settings')}
        >
          <span>设置</span>
          <small>助手、连接与数据</small>
        </button>
      </aside>

      <section className="app-workspace">
        <header className="workspace-header">
          <div>
            <p className="workspace-eyebrow">{activeArea === 'chat' ? '日常交流' : 'Mashiro'}</p>
            <h1>{title}</h1>
            <p>{description}</p>
          </div>
        </header>
        {contextNavigation ? (
          <div className="workspace-context-nav">{contextNavigation}</div>
        ) : null}
        <div className="workspace-content">{children}</div>
      </section>
    </main>
  )
}
