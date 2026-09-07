// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DailyPanel } from '../../src/renderer/src/features/daily/DailyPanel'
import type { AssistantSnapshot } from '../../src/shared/assistant-contract'
import type { ProviderApi } from '../../src/shared/provider-contract'
import type { DailyApi, DailyChanged } from '../../src/shared/daily-contract'
import { providerApi007Defaults } from './provider-api-fixture'
import {
  dailyApiDefaults,
  dailyAssistantA,
  dailyConfiguration,
  dailyConnection,
  dailyDetail,
  dailyJobId,
  dailyObservationId,
  dailyReportId,
  operationsApiDefaults
} from './daily-api-fixture'

afterEach(cleanup)

const snapshot: AssistantSnapshot = {
  assistants: [
    {
      id: dailyAssistantA,
      displayName: 'Alpha',
      persona: '',
      avatarKey: 'mashiro',
      isArchived: false,
      createdAt: '2026-09-07T00:00:00.000Z',
      updatedAt: '2026-09-07T00:00:00.000Z',
      archivedAt: null,
      version: 1
    }
  ],
  currentAssistantId: dailyAssistantA,
  primaryAssistantId: dailyAssistantA,
  stateRevision: 1
}

function providerApi(): ProviderApi {
  return {
    ...providerApi007Defaults(),
    list: vi.fn(async () => ({
      ok: true as const,
      data: {
        connections: [
          {
            id: dailyConnection,
            displayName: '日常模型',
            baseUrl: 'https://example.invalid/v1',
            enabled: true,
            hasCredential: true,
            credentialPersistence: 'persistent' as const,
            createdAt: '2026-09-07T00:00:00.000Z',
            updatedAt: '2026-09-07T00:00:00.000Z',
            version: 1
          }
        ],
        bindings: []
      }
    })),
    saveConnection: vi.fn(),
    setCredential: vi.fn(),
    deleteCredential: vi.fn(),
    bindAssistant: vi.fn(),
    clearChat: vi.fn(),
    startChat: vi.fn(),
    cancelChat: vi.fn(),
    onEvent: vi.fn(() => () => undefined)
  }
}

describe('DailyPanel', () => {
  it('keeps automatic work explicit and previews the trusted local-time occurrence before save', async () => {
    const api = dailyApiDefaults()
    render(
      <DailyPanel
        assistantSnapshot={snapshot}
        api={api}
        operationsApi={operationsApiDefaults()}
        providerApi={providerApi()}
      />
    )

    expect(await screen.findByText('Alpha · 自动工作、结果确认与用量都可在这里核对')).toBeVisible()
    const config = screen.getByText('自动运行配置').closest('details')!
    await waitFor(() => expect(within(config).getByLabelText('启用此类自动运行')).toBeChecked())
    fireEvent.click(within(config).getByText('自动运行配置'))
    expect(within(config).getByLabelText(/授权当前所选实际接收方/)).not.toBeChecked()

    fireEvent.click(within(config).getByRole('button', { name: '预览下次运行' }))
    await waitFor(() =>
      expect(api.preview).toHaveBeenCalledWith({
        protocolVersion: 1,
        assistantId: dailyAssistantA,
        feature: 'observation',
        schedule: dailyConfiguration().schedule
      })
    )
    expect(await screen.findByText(/将在本地时间运行/)).toBeVisible()

    fireEvent.click(within(config).getByLabelText(/授权当前所选实际接收方/))
    fireEvent.click(within(config).getByRole('button', { name: '保存配置' }))
    await waitFor(() =>
      expect(api.configure).toHaveBeenCalledWith(
        expect.objectContaining({
          assistantId: dailyAssistantA,
          feature: 'observation',
          expectedVersion: 2,
          grantSelectedRecipient: true
        })
      )
    )
    expect(within(config).getByLabelText(/授权当前所选实际接收方/)).not.toBeChecked()
  })

  it('loads report sources by fixed CAS and submits a corrected observation with all current versions', async () => {
    const api = dailyApiDefaults()
    api.inspect = vi.fn(async (input) => ({
      ok: true as const,
      data:
        input.cursor === 0
          ? dailyDetail({ nextCursor: 50 })
          : dailyDetail({
              providedSources: [],
              citedSources: [
                {
                  handle: 'S2',
                  source: {
                    type: 'round',
                    id: '00000000-0000-4000-8000-000000003010',
                    assistantId: dailyAssistantA,
                    version: 1
                  },
                  title: '直接引用',
                  eventStatus: null,
                  occurredAt: null,
                  timeZone: null
                }
              ],
              nextCursor: null
            })
    })) as DailyApi['inspect']
    const onOpenProposal = vi.fn()
    render(
      <DailyPanel
        assistantSnapshot={snapshot}
        api={api}
        operationsApi={operationsApiDefaults()}
        providerApi={providerApi()}
        onOpenProposal={onOpenProposal}
      />
    )

    fireEvent.click(await screen.findByRole('button', { name: '查看报告' }))
    const detail = await screen.findByRole('region', { name: '日常报告详情' })
    expect(detail).toHaveTextContent('# 今天')
    expect(detail).toHaveTextContent('提供给模型的来源')
    expect(detail).toHaveTextContent('未被明确引用不表示未影响输出')
    fireEvent.click(within(detail).getByRole('button', { name: '加载更多来源' }))
    await waitFor(() =>
      expect(api.inspect).toHaveBeenLastCalledWith(
        expect.objectContaining({ cursor: 50, expectedVersion: 4, governanceVersion: 6 })
      )
    )
    expect(detail).toHaveTextContent('直接引用')

    fireEvent.click(within(detail).getByRole('button', { name: '到事项区查看提案' }))
    expect(onOpenProposal).toHaveBeenCalledWith({
      assistantId: dailyAssistantA,
      proposalId: expect.any(String)
    })

    fireEvent.click(within(detail).getByRole('button', { name: '纠正后保存' }))
    fireEvent.change(within(detail).getByLabelText('纠正内容'), {
      target: { value: '我通常下午更专注。' }
    })
    fireEvent.click(within(detail).getByRole('button', { name: '提交纠正' }))
    await waitFor(() =>
      expect(api.decide).toHaveBeenCalledWith(
        expect.objectContaining({
          reportId: dailyReportId,
          expectedReportVersion: 4,
          governanceVersion: 6,
          observationId: dailyObservationId,
          expectedVersion: 2,
          action: 'correct',
          correction: { title: '上午更专注', markdown: '我通常下午更专注。' }
        })
      )
    )
  })

  it('clears governed body immediately and blocks a late inspect response after a change', async () => {
    let changed!: (event: DailyChanged) => void
    let resolveInspect!: (value: Awaited<ReturnType<DailyApi['inspect']>>) => void
    const api = dailyApiDefaults()
    api.onChanged = vi.fn((listener) => {
      changed = listener
      return () => undefined
    })
    api.inspect = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveInspect = resolve
        })
    ) as DailyApi['inspect']
    render(
      <DailyPanel
        assistantSnapshot={snapshot}
        api={api}
        operationsApi={operationsApiDefaults()}
        providerApi={providerApi()}
      />
    )
    fireEvent.click(await screen.findByRole('button', { name: '查看报告' }))
    act(() =>
      changed({
        revision: 9,
        assistantId: dailyAssistantA,
        feature: 'observation',
        id: dailyReportId,
        version: 5
      })
    )
    await act(async () => {
      resolveInspect({ ok: true, data: dailyDetail({ markdown: 'WITHDRAWN_SERVER_BODY' }) })
    })
    expect(screen.queryByText('WITHDRAWN_SERVER_BODY')).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: '日常报告详情' })).not.toBeInTheDocument()
  })

  it('shows unknown usage as unknown and requests group and attempt pages with independent cursors', async () => {
    const operations = operationsApiDefaults()
    operations.usage = vi.fn(async (input) => ({
      ok: true as const,
      data: {
        attempts:
          input.cursor === 0
            ? [
                {
                  id: '00000000-0000-4000-8000-000000003020',
                  chainId: 'chain',
                  actor: 'assistant' as const,
                  assistantId: dailyAssistantA,
                  connectionId: dailyConnection,
                  recipientFingerprint: null,
                  model: 'daily-model',
                  feature: 'observation' as const,
                  startedAt: '2026-09-07T00:00:00.000Z',
                  finishedAt: null,
                  state: 'UNKNOWN' as const,
                  inputCharacters: 100,
                  actual: null,
                  unknownReason: '远端最终状态未知',
                  estimatedTokens: null,
                  estimationMethod: null,
                  persistent: true,
                  owner: { domain: 'daily' as const, id: dailyJobId, assistantId: dailyAssistantA }
                }
              ]
            : [],
        nextCursor: input.cursor === 0 ? 50 : null,
        groups:
          input.groupsCursor === 0
            ? [
                {
                  actor: 'assistant' as const,
                  assistantId: dailyAssistantA,
                  connectionId: dailyConnection,
                  model: 'daily-model',
                  feature: 'observation' as const,
                  calls: 2,
                  known: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
                  unknownRequests: 1,
                  sendingRequests: 0,
                  inputCharacters: 100,
                  complete: false
                }
              ]
            : [],
        groupsNextCursor: input.groupsCursor === 0 ? 50 : null,
        filters: { assistantId: dailyAssistantA },
        summary: {
          calls: 2,
          known: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
          unknownRequests: 1,
          sendingRequests: 0,
          inputCharacters: 100,
          complete: false,
          historicalCoverage: '持久记录范围'
        }
      }
    }))
    render(
      <DailyPanel
        assistantSnapshot={snapshot}
        api={dailyApiDefaults()}
        operationsApi={operations}
        providerApi={providerApi()}
      />
    )
    fireEvent.click(await screen.findByRole('tab', { name: '运行与用量' }))
    fireEvent.click(screen.getByRole('tab', { name: '分类用量' }))
    expect(await screen.findByText(/含未知用量，不能当作零消耗/)).toBeVisible()
    expect(screen.getByText(/未知：远端最终状态未知/)).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '加载更多分类' }))
    await waitFor(() =>
      expect(operations.usage).toHaveBeenCalledWith(
        expect.objectContaining({ cursor: 0, groupsCursor: 50 })
      )
    )
    fireEvent.click(screen.getByRole('button', { name: '加载更多请求' }))
    await waitFor(() =>
      expect(operations.usage).toHaveBeenCalledWith(expect.objectContaining({ cursor: 50 }))
    )
  })
  it('marks an unaccepted observation as disputed with fixed CAS and a stable retry command', async () => {
    const api = dailyApiDefaults()
    api.decide = vi.fn(async (input) => ({
      ok: true as const,
      data: {
        commandId: input.commandId,
        state: 'RESULT_UNKNOWN' as const,
        objectId: input.observationId,
        objectVersion: input.expectedVersion,
        memory: null,
        suppressionId: null,
        summary: '争议标记回执未知'
      }
    })) as DailyApi['decide']
    render(
      <DailyPanel
        assistantSnapshot={snapshot}
        api={api}
        operationsApi={operationsApiDefaults()}
        providerApi={providerApi()}
      />
    )

    fireEvent.click(await screen.findByRole('button', { name: '查看报告' }))
    const detail = await screen.findByRole('region', { name: '日常报告详情' })
    const dispute = within(detail).getByRole('button', { name: '标为有争议' })
    fireEvent.click(dispute)
    await waitFor(() => expect(api.decide).toHaveBeenCalledTimes(1))
    fireEvent.click(dispute)
    await waitFor(() => expect(api.decide).toHaveBeenCalledTimes(2))

    const first = vi.mocked(api.decide).mock.calls[0]![0]
    const second = vi.mocked(api.decide).mock.calls[1]![0]
    expect(first).toEqual({
      protocolVersion: 1,
      assistantId: dailyAssistantA,
      reportId: dailyReportId,
      expectedReportVersion: 4,
      governanceVersion: 6,
      observationId: dailyObservationId,
      expectedVersion: 2,
      commandId: expect.any(String),
      action: 'dispute'
    })
    expect(second.commandId).toBe(first.commandId)
  })

  it('keeps an unaccepted disputed observation actionable without offering a second dispute mark', async () => {
    const api = dailyApiDefaults()
    const observation = dailyDetail().observations[0]!
    api.inspect = vi.fn(async () => ({
      ok: true as const,
      data: dailyDetail({
        observations: [{ ...observation, nature: 'user-statement', status: 'disputed' }]
      })
    })) as DailyApi['inspect']
    render(
      <DailyPanel
        assistantSnapshot={snapshot}
        api={api}
        operationsApi={operationsApiDefaults()}
        providerApi={providerApi()}
      />
    )

    fireEvent.click(await screen.findByRole('button', { name: '查看报告' }))
    const detail = await screen.findByRole('region', { name: '日常报告详情' })
    expect(detail).toHaveTextContent('用户陈述 · disputed')
    expect(within(detail).getByRole('button', { name: '接受并保存' })).toBeVisible()
    expect(within(detail).getByRole('button', { name: '纠正后保存' })).toBeVisible()
    expect(within(detail).getByRole('button', { name: '拒绝' })).toBeVisible()
    expect(within(detail).queryByRole('button', { name: '标为有争议' })).not.toBeInTheDocument()
  })
})
