// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppShell } from '../../src/renderer/src/features/shell/AppShell'

afterEach(cleanup)

const assistants = [
  { id: 'assistant-a', displayName: '日常助手', isArchived: false },
  { id: 'assistant-b', displayName: '工作助手', isArchived: false },
  { id: 'assistant-archived', displayName: '已归档助手', isArchived: true }
]

function Draft(): React.JSX.Element {
  const [value, setValue] = useState('')
  return (
    <label>
      未发送草稿
      <textarea value={value} onChange={(event) => setValue(event.currentTarget.value)} />
    </label>
  )
}

describe('AppShell daily workflow', () => {
  it('keeps daily work primary, groups advanced areas, and switches the current assistant directly', () => {
    const navigate = vi.fn()
    const switchAssistant = vi.fn()
    render(
      <AppShell
        activeArea="chat"
        title="对话"
        description="围绕当前助手持续交流。"
        assistants={assistants}
        currentAssistantId="assistant-a"
        onSwitchAssistant={switchAssistant}
        onNavigate={navigate}
      >
        <p>对话正文</p>
      </AppShell>
    )

    for (const name of ['对话', '事项', '提醒', '记忆', '自动工作', '运行记录', '设置']) {
      expect(screen.getByRole('button', { name })).toBeVisible()
    }
    expect(screen.getByRole('main')).toHaveClass('app-shell-chat')
    expect(screen.getByRole('button', { name: '对话' })).toHaveAttribute('aria-current', 'page')
    expect(screen.queryByRole('option', { name: '已归档助手' })).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('当前助手'), { target: { value: 'assistant-b' } })
    expect(switchAssistant).toHaveBeenCalledWith('assistant-b')
    fireEvent.click(screen.getByRole('button', { name: '设置' }))
    expect(navigate).toHaveBeenCalledWith('settings')
  })

  it('does not remount unfinished page content when the surrounding shell area changes', () => {
    const props = {
      title: '对话',
      description: '围绕当前助手持续交流。',
      assistants,
      currentAssistantId: 'assistant-a',
      onSwitchAssistant: vi.fn(),
      onNavigate: vi.fn()
    }
    const view = render(
      <AppShell {...props} activeArea="chat">
        <Draft />
      </AppShell>
    )
    fireEvent.change(screen.getByLabelText('未发送草稿'), { target: { value: '稍后继续' } })

    view.rerender(
      <AppShell {...props} activeArea="settings" title="设置">
        <Draft />
      </AppShell>
    )

    expect(screen.getByRole('main')).toHaveClass('app-shell-settings')
    expect(screen.getByLabelText('未发送草稿')).toHaveValue('稍后继续')
    expect(screen.getByRole('button', { name: '设置' })).toHaveAttribute('aria-current', 'page')
  })
})
