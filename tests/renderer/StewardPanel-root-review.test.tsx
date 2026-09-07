// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { StewardPanel } from '../../src/renderer/src/features/steward/StewardPanel'
import type { AssistantSnapshot } from '../../src/shared/assistant-contract'
import type { StewardApi, StewardChanged } from '../../src/shared/steward-contract'
import { memoryApi008Defaults } from './memory-api-fixture'
import { providerApi007Defaults } from './provider-api-fixture'
import {
  stewardApi013Defaults,
  stewardAssistantA,
  stewardBranch,
  stewardSnapshot
} from './steward-api-fixture'

afterEach(cleanup)
const assistantSnapshot: AssistantSnapshot = {
  assistants: [
    {
      id: stewardAssistantA,
      displayName: '合成用户',
      persona: '',
      avatarKey: 'mashiro',
      isArchived: false,
      createdAt: '2026-09-07T00:00:00.000Z',
      updatedAt: '2026-09-07T00:00:00.000Z',
      archivedAt: null,
      version: 1
    }
  ],
  currentAssistantId: stewardAssistantA,
  primaryAssistantId: stewardAssistantA,
  stateRevision: 1
}

it.each([false, true])(
  'clears accepted body after governance change; delayed read=%s cannot restore it',
  async (delayed) => {
    let snapshot = stewardSnapshot(stewardAssistantA, { branches: [stewardBranch()] })
    const api = stewardApi013Defaults(snapshot)
    let change!: (event: StewardChanged) => void
    api.onChanged = (listener) => {
      change = listener
      return () => {}
    }
    api.query = vi.fn<StewardApi['query']>(async () => ({ ok: true, data: snapshot }))
    let finish!: (result: Awaited<ReturnType<StewardApi['branch']>>) => void
    const result = {
      ok: true as const,
      data: {
        branch: stewardBranch(),
        members: [],
        conflicts: [],
        markdown: 'WITHDRAWN_SERVER_BODY',
        nextCursor: null
      }
    }
    api.branch = vi.fn<StewardApi['branch']>(async () =>
      delayed
        ? await new Promise<Awaited<ReturnType<StewardApi['branch']>>>((resolve) => {
            finish = resolve
          })
        : result
    )
    render(
      <StewardPanel
        assistantSnapshot={assistantSnapshot}
        api={api}
        memoryApi={memoryApi008Defaults()}
        providerApi={{
          ...providerApi007Defaults(),
          list: vi.fn(async () => ({ ok: true as const, data: { connections: [], bindings: [] } })),
          saveConnection: vi.fn(),
          setCredential: vi.fn(),
          deleteCredential: vi.fn(),
          bindAssistant: vi.fn(),
          clearChat: vi.fn(),
          startChat: vi.fn(),
          cancelChat: vi.fn(),
          onEvent: vi.fn(() => () => {})
        }}
      />
    )
    fireEvent.click(await screen.findByRole('button', { name: '读取分支' }))
    if (!delayed) await screen.findByText('WITHDRAWN_SERVER_BODY')
    else await waitFor(() => expect(api.branch).toHaveBeenCalledTimes(1))
    snapshot = { ...snapshot, branches: [stewardBranch({ version: 5 })] }
    await act(async () => {
      change({ revision: 2 })
    })
    await screen.findByText('分支 v5')
    if (delayed)
      await act(async () => {
        finish(result)
      })
    await waitFor(() => expect(screen.queryByText('WITHDRAWN_SERVER_BODY')).not.toBeInTheDocument())
  }
)
