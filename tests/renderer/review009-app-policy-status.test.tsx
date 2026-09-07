// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { App } from '../../src/renderer/src/App'
import type { AssistantApi, AssistantSnapshot } from '../../src/shared/assistant-contract'
import type { RetentionApi, RetentionChanged } from '../../src/shared/retention-contract'
import { memoryApi008Defaults } from './memory-api-fixture'
import { retentionPolicyApi009Defaults } from './retention-api-fixture'
import { providerApi007Defaults } from './provider-api-fixture'
import { timelineApi006Defaults } from './timeline-api-fixture'
afterEach(cleanup)
it.each(['job-status', 'policy-status'] as const)(
  'a %s update does not discard a pending initial assistant snapshot',
  async (reason) => {
    const id = '00000000-0000-4000-8000-000000000001'
    const snapshot: AssistantSnapshot = {
      assistants: [
        {
          id,
          displayName: '状态期间正常加载助手',
          persona: '',
          avatarKey: 'mashiro',
          isArchived: false,
          createdAt: '2026-09-06T00:00:00.000Z',
          updatedAt: '2026-09-06T00:00:00.000Z',
          archivedAt: null,
          version: 1
        }
      ],
      currentAssistantId: id,
      primaryAssistantId: id,
      stateRevision: 1
    }
    let finish!: (value: Awaited<ReturnType<AssistantApi['list']>>) => void
    let emit!: (event: RetentionChanged) => void
    const list = vi.fn<AssistantApi['list']>(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
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
      onChanged: vi.fn((listener) => {
        emit = listener
        return () => undefined
      })
    } as unknown as RetentionApi
    Object.defineProperty(window, 'mashiro', {
      configurable: true,
      value: {
        assistants,
        retention,
        memory: memoryApi008Defaults(),
        timeline: timelineApi006Defaults(),
        provider: {
          ...providerApi007Defaults(),
          list: vi.fn(async () => ({ ok: true, data: { connections: [], bindings: [] } })),
          onEvent: vi.fn(() => () => undefined)
        }
      }
    })
    render(<App />)
    await act(async () => {
      emit({ epoch: 1, assistantIds: [], memoryIds: [], requestIds: [], reason })
      finish({ ok: true, data: snapshot })
    })
    expect((await screen.findAllByText('状态期间正常加载助手')).length).toBeGreaterThan(0)
    expect(list).toHaveBeenCalledTimes(1)
  }
)
