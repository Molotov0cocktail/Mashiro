// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryPanel } from '../../src/renderer/src/features/memory/MemoryPanel'
import type { MemoryApi } from '../../src/shared/memory-contract'
import { memoryApi008Defaults } from './memory-api-fixture'

const assistantId = '00000000-0000-4000-8000-000000000001'
const recordId = '00000000-0000-4000-8000-000000000101'

afterEach(cleanup)

describe('MemoryPanel governed receipt identity', () => {
  it('retains the digest retry identity when a success receipt becomes stale before presentation', async () => {
    const registry = new Map<string, string>()
    let finish!: (value: Awaited<ReturnType<MemoryApi['mutate']>>) => void
    const api = memoryApi008Defaults()
    api.mutate = vi
      .fn<MemoryApi['mutate']>()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve
          })
      )
      .mockRejectedValue(new Error('synthetic unknown'))
    const panel = (epoch?: number) => (
      <MemoryPanel
        assistantId={assistantId}
        assistantName="日常助手"
        api={api}
        pendingCommands={registry}
        onLocateRound={vi.fn()}
        retentionChange={
          epoch === undefined
            ? undefined
            : {
                epoch,
                assistantIds: [assistantId],
                memoryIds: [],
                requestIds: [],
                reason: 'cleanup'
              }
        }
      />
    )
    const fill = (): void => {
      fireEvent.change(screen.getByLabelText('标题'), { target: { value: '延迟成功标题' } })
      fireEvent.change(screen.getByLabelText('Markdown 正文'), {
        target: { value: '延迟成功正文' }
      })
      fireEvent.click(screen.getByRole('button', { name: '保存新记录' }))
    }

    const view = render(panel())
    fill()
    await waitFor(() => expect(api.mutate).toHaveBeenCalledTimes(1))
    const originalCommandId = vi.mocked(api.mutate).mock.calls[0]![0].commandId
    view.rerender(panel(8))
    await waitFor(() => expect(screen.getByLabelText('标题')).toHaveValue(''))

    await act(async () => {
      finish({
        ok: true,
        data: {
          operationId: originalCommandId,
          objectId: recordId,
          objectVersion: 1,
          state: 'SUCCEEDED',
          summary: '迟到成功不应显示',
          confirmationId: null
        }
      })
      await Promise.resolve()
    })
    expect(screen.queryByText('迟到成功不应显示')).not.toBeInTheDocument()

    fill()
    await waitFor(() => expect(api.mutate).toHaveBeenCalledTimes(2))
    expect(vi.mocked(api.mutate).mock.calls[1]![0].commandId).toBe(originalCommandId)
  })

  it('releases a digest identity after a success is presented so the same content can be created again', async () => {
    const registry = new Map<string, string>()
    const api = memoryApi008Defaults()
    api.mutate = vi.fn<MemoryApi['mutate']>(async (input) => ({
      ok: true,
      data: {
        operationId: input.commandId,
        objectId: recordId,
        objectVersion: 1,
        state: 'SUCCEEDED',
        summary: '已明确保存',
        confirmationId: null
      }
    }))
    render(
      <MemoryPanel
        assistantId={assistantId}
        assistantName="日常助手"
        api={api}
        pendingCommands={registry}
        onLocateRound={vi.fn()}
      />
    )
    const fill = (): void => {
      fireEvent.change(screen.getByLabelText('标题'), { target: { value: '可重复新建标题' } })
      fireEvent.change(screen.getByLabelText('Markdown 正文'), {
        target: { value: '可重复新建正文' }
      })
      fireEvent.click(screen.getByRole('button', { name: '保存新记录' }))
    }

    fill()
    await screen.findByText('已明确保存')
    const firstCommandId = vi.mocked(api.mutate).mock.calls[0]![0].commandId
    expect(registry).toHaveLength(0)

    fill()
    await waitFor(() => expect(api.mutate).toHaveBeenCalledTimes(2))
    expect(vi.mocked(api.mutate).mock.calls[1]![0].commandId).not.toBe(firstCommandId)
  })
})
