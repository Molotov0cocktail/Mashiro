// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AssistantPanel } from '../../src/renderer/src/features/assistants/AssistantPanel'
import type {
  AssistantApi,
  AssistantResult,
  AssistantSnapshot
} from '../../src/shared/assistant-contract'

const removedId = '00000000-0000-4000-8000-000000000001'
const retainedId = '00000000-0000-4000-8000-000000000002'

function snapshot(
  stateRevision: number,
  includeRemoved = true,
  removedName = '已删除私密身份'
): AssistantSnapshot {
  return {
    assistants: [
      ...(includeRemoved
        ? [
            {
              id: removedId,
              displayName: removedName,
              persona: '',
              avatarKey: 'mashiro' as const,
              isArchived: false,
              createdAt: '2026-09-06T00:00:00.000Z',
              updatedAt: '2026-09-06T00:00:00.000Z',
              archivedAt: null,
              version: stateRevision
            }
          ]
        : []),
      {
        id: retainedId,
        displayName: '保留助手',
        persona: '',
        avatarKey: 'mashiro' as const,
        isArchived: false,
        createdAt: '2026-09-06T00:00:00.000Z',
        updatedAt: '2026-09-06T00:00:00.000Z',
        archivedAt: null,
        version: stateRevision
      }
    ],
    currentAssistantId: retainedId,
    primaryAssistantId: retainedId,
    stateRevision
  }
}

function deferredResult(): {
  promise: Promise<AssistantResult>
  resolve: (result: AssistantResult) => void
} {
  let resolve!: (result: AssistantResult) => void
  const promise = new Promise<AssistantResult>((value) => {
    resolve = value
  })
  return { promise, resolve }
}

afterEach(cleanup)

describe('AssistantPanel retention fences', () => {
  it('rejects an older initial list and removes rename text for an externally purged identity', async () => {
    const pendingList = deferredResult()
    const api = {
      list: vi.fn(() => pendingList.promise),
      create: vi.fn(),
      switch: vi.fn(),
      rename: vi.fn(),
      setPrimary: vi.fn(),
      archive: vi.fn()
    } as AssistantApi
    const view = render(<AssistantPanel api={api} externalSnapshot={snapshot(1)} />)

    const rename = await screen.findByRole('textbox', { name: '名称 已删除私密身份' })
    fireEvent.change(rename, { target: { value: '未保存私密草稿' } })
    view.rerender(<AssistantPanel api={api} externalSnapshot={snapshot(3, false)} />)
    await waitFor(() => expect(screen.queryByText('已删除私密身份')).not.toBeInTheDocument())

    await act(async () => {
      pendingList.resolve({ ok: true, data: snapshot(2) })
      await Promise.resolve()
    })
    expect(screen.queryByText('已删除私密身份')).not.toBeInTheDocument()

    view.rerender(<AssistantPanel api={api} externalSnapshot={snapshot(4, true, '重新建立身份')} />)
    expect(await screen.findByRole('textbox', { name: '名称 重新建立身份' })).toHaveValue(
      '重新建立身份'
    )
  })

  it.each([
    ['create', '创建助手'],
    ['rename', '保存基础配置'],
    ['switch', '设为当前'],
    ['setPrimary', '设为主要'],
    ['archive', '归档']
  ] as const)(
    'rejects a late %s receipt after a newer external purge snapshot',
    async (method, label) => {
      const pendingOperation = deferredResult()
      const operation = vi.fn(() => pendingOperation.promise)
      const api = {
        list: vi.fn(async () => ({ ok: true as const, data: snapshot(1) })),
        create: method === 'create' ? operation : vi.fn(),
        switch: method === 'switch' ? operation : vi.fn(),
        rename: method === 'rename' ? operation : vi.fn(),
        setPrimary: method === 'setPrimary' ? operation : vi.fn(),
        archive: method === 'archive' ? operation : vi.fn()
      } as AssistantApi
      const onSnapshot = vi.fn()
      const view = render(
        <AssistantPanel api={api} externalSnapshot={snapshot(1)} onSnapshot={onSnapshot} />
      )
      await screen.findByText('已删除私密身份')

      if (method === 'create') {
        fireEvent.change(screen.getByLabelText('助手名称'), { target: { value: '新助手' } })
        fireEvent.click(screen.getByRole('button', { name: label }))
      } else {
        const row = screen.getByText('已删除私密身份').closest('li')
        expect(row).not.toBeNull()
        fireEvent.click(within(row!).getByRole('button', { name: label }))
      }
      await waitFor(() => expect(operation).toHaveBeenCalledTimes(1))

      view.rerender(
        <AssistantPanel api={api} externalSnapshot={snapshot(3, false)} onSnapshot={onSnapshot} />
      )
      await waitFor(() => expect(screen.queryByText('已删除私密身份')).not.toBeInTheDocument())
      await act(async () => {
        pendingOperation.resolve({ ok: true, data: snapshot(2) })
        await Promise.resolve()
      })

      expect(screen.queryByText('已删除私密身份')).not.toBeInTheDocument()
      expect(onSnapshot).not.toHaveBeenCalledWith(snapshot(2))
    }
  )
})
