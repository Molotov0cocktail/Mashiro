// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../src/renderer/src/App'
import type { AssistantApi, AssistantSnapshot } from '../../src/shared/assistant-contract'
import type { MemoryApi } from '../../src/shared/memory-contract'
import type { RetentionApi, RetentionChanged } from '../../src/shared/retention-contract'
import type { TimelineApi } from '../../src/shared/timeline-contract'
import { memoryApi008Defaults } from './memory-api-fixture'
import { retentionPolicyApi009Defaults } from './retention-api-fixture'
import { providerApi007Defaults } from './provider-api-fixture'
import { timelineApi006Defaults } from './timeline-api-fixture'

const assistantId = '00000000-0000-4000-8000-000000000001'

const snapshot: AssistantSnapshot = {
  assistants: [
    {
      id: assistantId,
      displayName: '日常助手',
      persona: '',
      avatarKey: 'mashiro',
      isArchived: false,
      createdAt: '2026-09-06T00:00:00.000Z',
      updatedAt: '2026-09-06T00:00:00.000Z',
      archivedAt: null,
      version: 1
    }
  ],
  currentAssistantId: assistantId,
  primaryAssistantId: assistantId,
  stateRevision: 1
}

afterEach(cleanup)

describe('App retention command registry', () => {
  it('clears private UI text while retaining the digest identity of an unknown ordinary command', async () => {
    let emitChanged!: (event: RetentionChanged) => void
    const memory = memoryApi008Defaults()
    memory.mutate = vi.fn<MemoryApi['mutate']>(async () => {
      throw new Error('synthetic lost receipt')
    })
    const assistants = {
      list: vi.fn(async () => ({ ok: true as const, data: snapshot })),
      create: vi.fn(),
      switch: vi.fn(),
      rename: vi.fn(),
      setPrimary: vi.fn(),
      archive: vi.fn()
    } as AssistantApi
    const retention = {
      ...retentionPolicyApi009Defaults(),
      overview: vi.fn(async () => ({
        ok: true as const,
        data: {
          epoch: 1,
          zones: [
            {
              zone: 'persistent' as const,
              objects: 0,
              acceptedBytes: 0,
              measurement: 'COMPLETE' as const,
              unknownObjects: 0
            },
            {
              zone: 'staging' as const,
              objects: 0,
              acceptedBytes: 0,
              measurement: 'COMPLETE' as const,
              unknownObjects: 0
            },
            {
              zone: 'trash' as const,
              objects: 0,
              acceptedBytes: 0,
              measurement: 'COMPLETE' as const,
              unknownObjects: 0
            }
          ],
          managedFileBytes: 0,
          databaseBytes: 0,
          automaticPolicy: 'ACTIVE' as const
        }
      })),
      move: vi.fn(),
      preview: vi.fn(),
      confirm: vi.fn(),
      jobs: vi.fn(async () => ({
        ok: true as const,
        data: { jobs: [], nextCursor: null }
      })),
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
        memory,
        retention
      }
    })

    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: '记忆' }))
    const fillAndSubmit = (): void => {
      fireEvent.change(screen.getByLabelText('标题'), { target: { value: '私密注册表标题' } })
      fireEvent.change(screen.getByLabelText('Markdown 正文'), {
        target: { value: '私密注册表正文' }
      })
      fireEvent.click(screen.getByRole('button', { name: '保存新记录' }))
    }
    fillAndSubmit()
    expect(await screen.findByText(/写入回执未确认/)).toBeInTheDocument()
    fillAndSubmit()
    await waitFor(() => expect(memory.mutate).toHaveBeenCalledTimes(2))
    expect(vi.mocked(memory.mutate).mock.calls[0]![0].commandId).toBe(
      vi.mocked(memory.mutate).mock.calls[1]![0].commandId
    )

    emitChanged({
      epoch: 2,
      assistantIds: [assistantId],
      memoryIds: [],
      requestIds: [],
      reason: 'cleanup'
    })
    await waitFor(() => expect(screen.getByLabelText('标题')).toHaveValue(''))
    expect(screen.getByLabelText('Markdown 正文')).toHaveValue('')

    fillAndSubmit()
    await waitFor(() => expect(memory.mutate).toHaveBeenCalledTimes(3))
    expect(vi.mocked(memory.mutate).mock.calls[2]![0].commandId).toBe(
      vi.mocked(memory.mutate).mock.calls[1]![0].commandId
    )
  })
})
