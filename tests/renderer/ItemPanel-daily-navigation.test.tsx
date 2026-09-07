// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ItemPanel } from '../../src/renderer/src/features/items/ItemPanel'
import {
  itemApi010Defaults,
  itemAssistantA,
  itemProposal,
  itemPermissions
} from './item-api-fixture'

afterEach(cleanup)

describe('ItemPanel daily navigation', () => {
  it('opens the exact real proposal from a daily report after rechecking permissions', async () => {
    const api = itemApi010Defaults()
    const proposal = itemProposal()
    api.inspect = vi.fn(async (input) => ({
      ok: true as const,
      data: { item: null, proposal: input.type === 'proposal' ? proposal : null, receipts: [] }
    }))
    api.permissions = vi.fn(async () => ({ ok: true as const, data: itemPermissions() }))
    render(
      <ItemPanel
        assistantId={itemAssistantA}
        assistantName="Alpha"
        api={api}
        openItemTarget={{
          assistantId: itemAssistantA,
          type: 'proposal',
          id: proposal.id,
          nonce: 1
        }}
      />
    )

    await waitFor(() =>
      expect(api.inspect).toHaveBeenCalledWith({
        protocolVersion: 1,
        assistantId: itemAssistantA,
        id: proposal.id,
        type: 'proposal'
      })
    )
    expect(screen.getByRole('tab', { name: '待确认' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('region', { name: '事项详情' })).toHaveTextContent('修改待确认建议')
    expect(screen.getByDisplayValue(proposal.candidate.title)).toBeInTheDocument()
  })
})
