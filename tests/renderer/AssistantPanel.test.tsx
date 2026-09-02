// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AssistantPanel } from '../../src/renderer/src/features/assistants/AssistantPanel'
import type { AssistantApi, AssistantSnapshot } from '../../src/shared/assistant-contract'

const empty: AssistantSnapshot = {
  assistants: [],
  currentAssistantId: null,
  primaryAssistantId: null,
  stateRevision: 0
}
describe('AssistantPanel', () => {
  it('creates through the narrow bridge and renders bridge errors', async () => {
    const create = vi.fn().mockResolvedValue({
      ok: false,
      error: { code: 'INVALID_INPUT', message: '名称无效', correlationId: 'c1', retryable: false }
    })
    const api = {
      list: vi.fn().mockResolvedValue({ ok: true, data: empty }),
      create,
      switch: vi.fn(),
      rename: vi.fn(),
      setPrimary: vi.fn(),
      archive: vi.fn()
    } as AssistantApi
    render(<AssistantPanel api={api} />)
    await userEvent.type(await screen.findByLabelText('助手名称'), '新助手')
    await userEvent.click(screen.getByRole('button', { name: '创建助手' }))
    expect(create).toHaveBeenCalledWith({
      protocolVersion: 1,
      displayName: '新助手',
      expectedStateRevision: 0
    })
    expect(await screen.findByRole('alert')).toHaveTextContent('名称无效')
  })
})
