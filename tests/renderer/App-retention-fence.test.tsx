// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../src/renderer/src/App'
import type { AssistantApi, AssistantSnapshot } from '../../src/shared/assistant-contract'
import type { RetentionApi, RetentionChanged } from '../../src/shared/retention-contract'
import type { TimelineApi } from '../../src/shared/timeline-contract'
import { memoryApi008Defaults } from './memory-api-fixture'
import { retentionPolicyApi009Defaults } from './retention-api-fixture'
import { providerApi007Defaults } from './provider-api-fixture'
import { timelineApi006Defaults } from './timeline-api-fixture'

const assistantId = '00000000-0000-4000-8000-000000000001'

function snapshot(revision: number, present = true): AssistantSnapshot {
  return {
    assistants: present
      ? [
          {
            id: assistantId,
            displayName: '不应复活的助手',
            persona: '',
            avatarKey: 'mashiro',
            isArchived: false,
            createdAt: '2026-09-06T00:00:00.000Z',
            updatedAt: '2026-09-06T00:00:00.000Z',
            archivedAt: null,
            version: 1
          }
        ]
      : [],
    currentAssistantId: present ? assistantId : null,
    primaryAssistantId: present ? assistantId : null,
    stateRevision: revision
  }
}

afterEach(cleanup)

describe('App retention assistant snapshot fence', () => {
  it('does not let an older list result restore an assistant after a newer governance refresh', async () => {
    let emitChanged!: (event: RetentionChanged) => void
    let resolveOld!: (value: Awaited<ReturnType<AssistantApi['list']>>) => void
    const list = vi
      .fn<AssistantApi['list']>()
      .mockResolvedValueOnce({ ok: true, data: snapshot(1) })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOld = resolve
          })
      )
      .mockResolvedValue({ ok: true, data: snapshot(3, false) })
    const assistants = {
      list,
      create: vi.fn(),
      switch: vi.fn(),
      rename: vi.fn(),
      setPrimary: vi.fn(),
      archive: vi.fn()
    } as AssistantApi
    const retention = {
      ...retentionPolicyApi009Defaults(),
      overview: vi.fn(),
      move: vi.fn(),
      preview: vi.fn(),
      confirm: vi.fn(),
      jobs: vi.fn(async () => ({ ok: true as const, data: { jobs: [], nextCursor: null } })),
      retry: vi.fn(),
      onChanged: vi.fn((listener) => {
        emitChanged = listener
        return () => undefined
      })
    } as RetentionApi
    const timeline = {
      ...timelineApi006Defaults(),
      read: vi.fn(async (input) => ({
        ok: true as const,
        data: { assistantId: input.assistantId, mode: input.mode, messages: [], hasMore: false }
      })),
      saveTemporary: vi.fn()
    } as TimelineApi
    Object.defineProperty(window, 'mashiro', {
      configurable: true,
      value: {
        assistants,
        provider: {
          ...providerApi007Defaults(),
          list: vi.fn(async () => ({
            ok: true as const,
            data: { connections: [], bindings: [] }
          })),
          onEvent: vi.fn(() => () => undefined)
        },
        timeline,
        memory: memoryApi008Defaults(),
        retention
      }
    })

    render(<App />)
    expect((await screen.findAllByText('不应复活的助手')).length).toBeGreaterThan(0)
    emitChanged({
      epoch: 2,
      assistantIds: [assistantId],
      memoryIds: [],
      requestIds: [],
      reason: 'cleanup'
    })
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2))
    emitChanged({
      epoch: 3,
      assistantIds: [assistantId],
      memoryIds: [],
      requestIds: [],
      reason: 'purge'
    })
    await waitFor(() => expect(list).toHaveBeenCalledTimes(3))
    await waitFor(() => expect(screen.queryAllByText('不应复活的助手')).toHaveLength(0))

    await act(async () => {
      resolveOld({ ok: true, data: snapshot(2) })
      await Promise.resolve()
    })
    expect(screen.queryAllByText('不应复活的助手')).toHaveLength(0)
  })
})
