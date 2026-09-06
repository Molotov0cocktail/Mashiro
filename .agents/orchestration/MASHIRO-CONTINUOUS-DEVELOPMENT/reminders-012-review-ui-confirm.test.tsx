// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToolExecutionPanel } from '../../../src/renderer/src/features/provider/ToolExecutionPanel'
import type { ProviderCapabilities, ToolOperation } from '../../../src/shared/tool-contract'
import {
  itemAssistantA,
  reminderApi012Defaults,
  reminderPreview,
  reminderReceipt
} from '../../../tests/renderer/reminder-api-fixture'

afterEach(cleanup)

const capability: ProviderCapabilities = {
  assistantId: itemAssistantA,
  endpointFingerprint: 'sha256:synthetic',
  endpointDisplay: 'https://example.com/v1',
  model: 'synthetic',
  protocol: 'chat-completions-v1',
  adapterVersion: 'test',
  mode: 'standard-non-preserved',
  toolsAvailable: true,
  reason: '合成工具能力可用',
  evidence: []
}

function operation(): ToolOperation {
  return {
    operationId: '00000000-0000-4000-8000-000000000701',
    segmentId: '00000000-0000-4000-8000-000000000702',
    modelRequestId: '00000000-0000-4000-8000-000000000703',
    requestId: '00000000-0000-4000-8000-000000000704',
    assistantId: itemAssistantA,
    toolName: 'prepare_reminder',
    state: 'SUCCEEDED',
    createdAt: '2026-09-07T01:00:00.000Z',
    updatedAt: '2026-09-07T01:00:00.000Z',
    summary: '已准备提醒候选，等待本地确认',
    citations: [],
    reminderPreview: reminderPreview()
  }
}

it('review: same candidate parent refresh cannot discard an inflight confirmation receipt', async()=>{
 const api=reminderApi012Defaults()
 let resolveConfirm!: (value: Awaited<ReturnType<typeof api.confirm>>)=>void
 api.confirm=vi.fn(()=>new Promise(resolve=>{resolveConfirm=resolve}))
 api.preview=vi.fn().mockResolvedValueOnce({ok:true,data:reminderPreview()}).mockResolvedValue({ok:true,data:reminderPreview({state:'ACCEPTED',receipt:reminderReceipt({summary:'review confirmed'})})})
 const props={assistantId:itemAssistantA,mode:'normal' as const,contextIntent:{kind:'recent' as const},reminderApi:api,capability,capabilityLoading:false,capabilityError:'',scope:'items' as const,operationLoading:false,operationError:'',onScopeChange:vi.fn(),onRefreshOperation:vi.fn(),onLocateCitation:vi.fn()}
 const view=render(<ToolExecutionPanel {...props} operations={[operation()]}/> )
 fireEvent.click(await screen.findByRole('button',{name:'确认设置提醒'}))
 await waitFor(()=>expect(api.confirm).toHaveBeenCalledTimes(1))
 view.rerender(<ToolExecutionPanel {...props} operations={[operation()]}/> )
 resolveConfirm({ok:true,data:reminderReceipt({summary:'review confirmed'})})
 expect(await screen.findByText('review confirmed')).toBeInTheDocument()
 expect(screen.queryByRole('button',{name:'正在确认…'})).not.toBeInTheDocument()
})