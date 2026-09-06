// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { HistoryContextPanel } from '../../../src/renderer/src/features/provider/HistoryContextPanel'
import type { TimelineApi, TimelineMessage } from '../../../src/shared/timeline-contract'

afterEach(cleanup)
const assistantId = '00000000-0000-4000-8000-000000000001'
const row: TimelineMessage = {
  id: '00000000-0000-4000-8000-000000000002',
  requestId: '00000000-0000-4000-8000-000000000003',
  role: 'user', content: 'OLD_RESULT', status: 'completed',
  createdAt: '2026-09-06T00:00:00.000Z', saved: true
}
function setup() {
  const query = vi.fn<TimelineApi['query']>().mockResolvedValue({ ok: true, data: { assistantId, messages: [row], nextCursor: 50 } })
  const api = {
    query,
    permissions: vi.fn().mockResolvedValue({ ok: true, data: { assistantId, connectionId: null, endpointFingerprint: null, endpointDisplay: null, readHistory: true, sendHistory: false, version: 0 } })
  } as unknown as TimelineApi
  render(<HistoryContextPanel assistantId={assistantId} mode="normal" bindingKey="none" timelineApi={api} contextIntent={{ kind: 'recent' }} selectedRequestIds={[]} onContextIntentChange={() => {}} onSelectedRequestIdsChange={() => {}} />)
  return query
}

it('preserves leading and trailing whitespace as literal search input', async () => {
  const query = setup()
  await screen.findByText('OLD_RESULT', { exact: false })
  fireEvent.change(screen.getByLabelText('搜索本助手历史'), { target: { value: ' 空 格 ' } })
  fireEvent.click(screen.getByRole('button', { name: '搜索', exact: true }))
  await waitFor(() => expect(query).toHaveBeenCalledTimes(2))
  expect(query.mock.calls[1]![0].query).toBe(' 空 格 ')
})

it('keeps old result cursor paired with its successful query after new search fails', async () => {
  const query = setup()
  await screen.findByText('OLD_RESULT', { exact: false })
  query.mockResolvedValueOnce({ ok: false, error: { code: 'STORAGE_UNAVAILABLE', message: 'synthetic', correlationId: '00000000-0000-4000-8000-000000000004', retryable: true } })
  fireEvent.change(screen.getByLabelText('搜索本助手历史'), { target: { value: 'NEW_QUERY' } })
  fireEvent.click(screen.getByRole('button', { name: '搜索', exact: true }))
  await screen.findByRole('alert')
  expect(screen.getByText('OLD_RESULT', { exact: false })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '加载更早' }))
  await waitFor(() => expect(query).toHaveBeenCalledTimes(3))
  expect(query.mock.calls[2]![0]).toMatchObject({ query: '', before: 50 })
})
