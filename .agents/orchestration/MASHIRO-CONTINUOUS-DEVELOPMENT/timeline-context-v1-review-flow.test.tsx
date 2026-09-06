// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { HistoryContextPanel } from '../../../src/renderer/src/features/provider/HistoryContextPanel'
import type { TimelineApi, TimelineMessage } from '../../../src/shared/timeline-contract'

afterEach(cleanup)
const assistantId = '00000000-0000-4000-8000-000000000001'
const requestId = '00000000-0000-4000-8000-000000000002'
const user: TimelineMessage = {
  id: '00000000-0000-4000-8000-000000000003', requestId,
  role: 'user', content: 'ONLY_USER_MATCH', status: 'completed',
  createdAt: '2026-09-06T00:00:00.000Z', saved: true
}
const assistant: TimelineMessage = { ...user, id: '00000000-0000-4000-8000-000000000004', role: 'assistant', content: 'DIFFERENT_REPLY' }

it('can clear a single-sided search, page to its full round, and select the request', async () => {
  const query = vi.fn<TimelineApi['query']>().mockImplementation(async input => ({
    ok: true,
    data: { assistantId, messages: input.query ? [user] : input.before ? [user, assistant] : [], nextCursor: input.query || input.before ? null : 50 }
  }))
  const api = { query, permissions: vi.fn().mockResolvedValue({ ok: true, data: { assistantId, connectionId: null, endpointFingerprint: null, endpointDisplay: null, readHistory: true, sendHistory: false, version: 0 } }) } as unknown as TimelineApi
  const onSelected = vi.fn()
  render(<HistoryContextPanel assistantId={assistantId} mode="normal" bindingKey="none" timelineApi={api} contextIntent={{ kind: 'recent' }} selectedRequestIds={[]} onContextIntentChange={() => {}} onSelectedRequestIdsChange={onSelected} />)
  await waitFor(() => expect(query).toHaveBeenCalledTimes(1))
  fireEvent.change(screen.getByLabelText('搜索本助手历史'), { target: { value: 'ONLY_USER_MATCH' } })
  fireEvent.click(screen.getByRole('button', { name: '搜索', exact: true }))
  await screen.findByText('ONLY_USER_MATCH', { exact: false })
  expect(screen.queryByRole('checkbox', { name: /选择此轮/ })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '清除搜索' }))
  await waitFor(() => expect(query).toHaveBeenCalledTimes(3))
  fireEvent.click(screen.getByRole('button', { name: '加载更早' }))
  const selection = await screen.findByRole('checkbox', { name: '选择此轮：ONLY_USER_MATCH' })
  fireEvent.click(selection)
  expect(onSelected).toHaveBeenCalledWith([requestId])
  expect(query.mock.calls[3]![0]).toMatchObject({ query: '', before: 50 })
})
