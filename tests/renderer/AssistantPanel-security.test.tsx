// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AssistantPanel } from '../../src/renderer/src/features/assistants/AssistantPanel'
import type { AssistantApi, AssistantSnapshot } from '../../src/shared/assistant-contract'

describe('AssistantPanel untrusted text', () => {
  it('renders an assistant name as text without creating injected markup', async () => {
    const hostileName = '<img src=x onerror=alert(1)>'
    const snapshot: AssistantSnapshot = {
      assistants: [
        {
          id: '00000000-0000-4000-8000-000000000001',
          displayName: hostileName,
          persona: '',
          avatarKey: 'mashiro',
          isArchived: false,
          createdAt: '2026-09-02T00:00:00.000Z',
          updatedAt: '2026-09-02T00:00:00.000Z',
          archivedAt: null,
          version: 1
        }
      ],
      currentAssistantId: '00000000-0000-4000-8000-000000000001',
      primaryAssistantId: '00000000-0000-4000-8000-000000000001',
      stateRevision: 1
    }
    const api = {
      list: vi.fn().mockResolvedValue({ ok: true, data: snapshot }),
      create: vi.fn(),
      switch: vi.fn(),
      rename: vi.fn(),
      setPrimary: vi.fn(),
      archive: vi.fn()
    } as AssistantApi

    render(<AssistantPanel api={api} />)
    expect(await screen.findByText(hostileName)).toBeInTheDocument()
    expect(document.querySelector('img')).toBeNull()
  })
})
