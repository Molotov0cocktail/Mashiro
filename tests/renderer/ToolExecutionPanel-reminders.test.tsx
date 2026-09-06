// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToolExecutionPanel } from '../../src/renderer/src/features/provider/ToolExecutionPanel'
import type { ProviderCapabilities, ToolOperation } from '../../src/shared/tool-contract'
import {
  itemAssistantA,
  reminderApi012Defaults,
  reminderPreview,
  reminderReceipt
} from './reminder-api-fixture'

afterEach(cleanup)

const capability: ProviderCapabilities = {
  assistantId: itemAssistantA,
  endpointFingerprint: 'sha256:synthetic',
  endpointDisplay: 'https://example.com/v1',
  model: 'synthetic',
  protocol: 'chat-completions-v1',
  adapterVersion: 'test',
  mode: 'standard-non-preserved',
  toolsAvailable: true,
  reason: '合成工具能力可用',
  evidence: []
}

function operation(): ToolOperation {
  return {
    operationId: '00000000-0000-4000-8000-000000000701',
    segmentId: '00000000-0000-4000-8000-000000000702',
    modelRequestId: '00000000-0000-4000-8000-000000000703',
    requestId: '00000000-0000-4000-8000-000000000704',
    assistantId: itemAssistantA,
    toolName: 'prepare_reminder',
    state: 'SUCCEEDED',
    createdAt: '2026-09-07T01:00:00.000Z',
    updatedAt: '2026-09-07T01:00:00.000Z',
    summary: '已准备提醒候选，等待本地确认',
    citations: [],
    reminderPreview: reminderPreview()
  }
}

describe('ToolExecutionPanel reminder confirmation', () => {
  it('shows the full instant and rechecks the trusted candidate before explicit acceptance', async () => {
    const api = reminderApi012Defaults()
    const pending = reminderPreview()
    const accepted = reminderPreview({
      state: 'ACCEPTED',
      receipt: reminderReceipt({ summary: '已从对话确认并设置提醒' })
    })
    api.preview = vi
      .fn()
      .mockResolvedValueOnce({ ok: true as const, data: pending })
      .mockResolvedValueOnce({ ok: true as const, data: accepted })
    const refresh = vi.fn()
    const changed = vi.fn()
    const props = {
      assistantId: itemAssistantA,
      mode: 'normal' as const,
      contextIntent: { kind: 'recent' as const },
      reminderApi: api,
      capability,
      capabilityLoading: false,
      capabilityError: '',
      scope: 'items' as const,
      operations: [operation()],
      operationLoading: false,
      operationError: '',
      onScopeChange: vi.fn(),
      onRefreshOperation: refresh,
      onLocateCitation: vi.fn(),
      onReminderChanged: changed
    }
    const view = render(<ToolExecutionPanel {...props} />)

    const card = await screen.findByRole('region', { name: '对话提醒候选确认' })
    expect(card).toHaveTextContent('2026年9月12日')
    expect(card).toHaveTextContent('Asia/Shanghai')
    expect(card).toHaveTextContent('2026-09-12T09:30:00+08:00')
    expect(card).toHaveTextContent('尚未调度提醒')
    expect(api.confirm).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '确认设置提醒' }))
    await waitFor(() => expect(api.confirm).toHaveBeenCalledTimes(1))
    expect(vi.mocked(api.preview).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(api.confirm).mock.invocationCallOrder[0]!
    )
    expect(api.confirm).toHaveBeenCalledWith({
      protocolVersion: 1,
      assistantId: itemAssistantA,
      confirmationId: pending.confirmationId,
      accept: true
    })
    expect(await screen.findByText('提醒操作已接受')).toBeInTheDocument()
    expect(screen.getByText('已从对话确认并设置提醒')).toBeInTheDocument()
    expect(changed).toHaveBeenCalledTimes(1)

    view.rerender(<ToolExecutionPanel {...props} operations={[operation()]} />)
    expect(screen.getByText('提醒操作已接受')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '确认设置提醒' })).not.toBeInTheDocument()
  })

  it('does not confirm when the trusted item version changed since the displayed candidate', async () => {
    const api = reminderApi012Defaults()
    api.preview = vi.fn(async () => ({
      ok: true as const,
      data: reminderPreview({ itemVersion: 3 })
    }))
    render(
      <ToolExecutionPanel
        assistantId={itemAssistantA}
        mode="normal"
        contextIntent={{ kind: 'recent' }}
        reminderApi={api}
        capability={capability}
        capabilityLoading={false}
        capabilityError=""
        scope="items"
        operations={[operation()]}
        operationLoading={false}
        operationError=""
        onScopeChange={vi.fn()}
        onRefreshOperation={vi.fn()}
        onLocateCitation={vi.fn()}
      />
    )
    fireEvent.click(await screen.findByRole('button', { name: '确认设置提醒' }))
    expect(await screen.findByText(/事项版本已变化/)).toBeInTheDocument()
    expect(api.confirm).not.toHaveBeenCalled()
  })

  it('keeps an explicit rejection terminal when the post-confirm preview cannot be reread', async () => {
    const api = reminderApi012Defaults()
    const pending = reminderPreview()
    api.preview = vi
      .fn()
      .mockResolvedValueOnce({ ok: true as const, data: pending })
      .mockRejectedValueOnce(new Error('synthetic preview outage'))
    api.confirm = vi.fn(async () => ({
      ok: true as const,
      data: reminderReceipt({
        state: 'CONFIRMED_NOT_APPLIED',
        summary: '已拒绝候选，未设置提醒'
      })
    }))
    const changed = vi.fn()
    render(
      <ToolExecutionPanel
        assistantId={itemAssistantA}
        mode="normal"
        contextIntent={{ kind: 'recent' }}
        reminderApi={api}
        capability={capability}
        capabilityLoading={false}
        capabilityError=""
        scope="items"
        operations={[operation()]}
        operationLoading={false}
        operationError=""
        onScopeChange={vi.fn()}
        onRefreshOperation={vi.fn()}
        onLocateCitation={vi.fn()}
        onReminderChanged={changed}
      />
    )

    fireEvent.click(await screen.findByRole('button', { name: '拒绝候选' }))
    expect(await screen.findByText('提醒操作已拒绝')).toBeInTheDocument()
    expect(screen.getByText('已拒绝候选，未设置提醒')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '确认设置提醒' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '拒绝候选' })).not.toBeInTheDocument()
    expect(changed).not.toHaveBeenCalled()
  })
})
