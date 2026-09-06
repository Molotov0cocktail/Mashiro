// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { MemoryApi, MemoryRecord } from '../../../src/shared/memory-contract'
import { MemoryPanel } from '../../../src/renderer/src/features/memory/MemoryPanel'
import { memoryApi008Defaults } from '../../../tests/renderer/memory-api-fixture'

const assistantId = '00000000-0000-4000-8000-000000000001'
const recordId = '00000000-0000-4000-8000-000000000101'
const sourceRoundId = '00000000-0000-4000-8000-000000000201'
const operationId = '00000000-0000-4000-8000-000000000301'

afterEach(cleanup)

function record(values: Partial<MemoryRecord> = {}): MemoryRecord {
  return {
    id: recordId,
    objectVersion: 2,
    kind: 'user',
    scope: 'global',
    ownerAssistantId: assistantId,
    title: '偏好称呼',
    markdown: '请叫我 **小真**。',
    nature: 'user-statement',
    event: null,
    state: 'active',
    retention: 'persistent',
    createdAt: '2026-09-06T01:00:00.000Z',
    updatedAt: '2026-09-06T02:00:00.000Z',
    sources: [{ type: 'round', id: sourceRoundId, assistantId, version: 1 }],
    ...values
  }
}

function inspection(current = record()) {
  return {
    record: current,
    changes: [
      {
        operationId,
        action: 'remember',
        objectVersion: current.objectVersion,
        createdAt: '2026-09-06T02:00:00.000Z',
        actor: 'assistant' as const
      }
    ],
    receipts: [
      {
        operationId,
        objectId: current.id,
        objectVersion: current.objectVersion,
        state: 'SUCCEEDED' as const,
        summary: '已保存记忆',
        confirmationId: null
      }
    ],
    providedToRequests: ['00000000-0000-4000-8000-000000000601'],
    cleanupPending: false,
    organizationPending: true
  }
}

function api(overrides: Partial<MemoryApi> = {}): MemoryApi {
  return { ...memoryApi008Defaults(), ...overrides } as MemoryApi
}

it('independent: editing B cannot submit A while details are pending',async()=>{
 const a=record();const b=record({id:'00000000-0000-4000-8000-000000000102',title:'B title',markdown:'B body'});
 const mutate=vi.fn<MemoryApi['mutate']>(); const inspect=vi.fn<MemoryApi['inspect']>(async input=>input.id===a.id?{ok:true,data:inspection(a)}:await new Promise(()=>{}));
 render(<MemoryPanel assistantId={assistantId} assistantName="review" api={api({query:async()=>({ok:true,data:{records:[a,b],nextCursor:null}}),inspect,mutate})} onLocateRound={vi.fn()}/>);
 const buttons=await screen.findAllByRole('button',{name:'查看与纠正'});
 fireEvent.click(buttons[0]!);await waitFor(()=>expect(inspect).toHaveBeenCalledTimes(1));
 await screen.findByText('来源与变更');
 fireEvent.click(buttons[1]!);fireEvent.click(screen.getByRole('button',{name:'保存纠正版本'}));
 expect(mutate.mock.calls.every(([input])=>input.mutation.targetId===b.id)).toBe(true);
});
it('independent: saving an unchanged event preserves its instant',async()=>{
 const r=record({kind:'event',event:{status:'planned',occurredAt:'2026-09-06T08:00:00.000Z',timeZone:'Asia/Shanghai'}});
 const mutate=vi.fn<MemoryApi['mutate']>();
 render(<MemoryPanel assistantId={assistantId} assistantName="review" api={api({query:async()=>({ok:true,data:{records:[r],nextCursor:null}}),inspect:async()=>({ok:true,data:inspection(r)}),mutate})} onLocateRound={vi.fn()}/>);
 fireEvent.click(await screen.findByRole('button',{name:'查看与纠正'}));await screen.findByText('来源与变更');
 fireEvent.click(screen.getByRole('button',{name:'保存纠正版本'}));expect(mutate).toHaveBeenCalledTimes(1);
 expect(mutate.mock.calls[0]![0].mutation).toMatchObject({event:{occurredAt:r.event!.occurredAt}});
});it('independent: unchanged manual create retry after lost receipt retains command identity',async()=>{
 const accepted=new Set<string>();const mutate=vi.fn<MemoryApi['mutate']>(async input=>{accepted.add(input.commandId);throw Error('synthetic response lost after commit');});
 render(<MemoryPanel assistantId={assistantId} assistantName="review" api={api({mutate})} onLocateRound={vi.fn()}/>);
 await screen.findByRole('button',{name:'保存新记录'});await waitFor(()=>expect(screen.getByLabelText('标题')).toBeInTheDocument());
 fireEvent.change(screen.getByLabelText('标题'),{target:{value:'retry review'}});fireEvent.change(screen.getByLabelText('Markdown 正文'),{target:{value:'unchanged body'}});
 fireEvent.click(screen.getByRole('button',{name:'保存新记录'}));await screen.findByText('写入回执未确认，请刷新记录核查；界面不会自动重试');
 fireEvent.click(screen.getByRole('button',{name:'保存新记录'}));await waitFor(()=>expect(mutate).toHaveBeenCalledTimes(2));
 expect(accepted.size).toBe(1);
});it('independent: lost manual receipt retains identity across assistant-key remount',async()=>{
 const accepted=new Set<string>();const mutate=vi.fn<MemoryApi['mutate']>(async input=>{accepted.add(input.commandId);throw Error('synthetic response lost after commit');});
 const registry=new Map<string,string>(); const show=()=>render(<MemoryPanel assistantId={assistantId} assistantName="review" pendingCommands={registry} api={api({mutate})} onLocateRound={vi.fn()}/>);
 const fill=async()=>{await screen.findByRole('button',{name:'保存新记录'});fireEvent.change(screen.getByLabelText('标题'),{target:{value:'remount review'}});fireEvent.change(screen.getByLabelText('Markdown 正文'),{target:{value:'same remount body'}});fireEvent.click(screen.getByRole('button',{name:'保存新记录'}));await screen.findByText('写入回执未确认，请刷新记录核查；界面不会自动重试');};
 const first=show();await fill();first.unmount();show();await fill();expect(mutate).toHaveBeenCalledTimes(2);expect(accepted.size).toBe(1);
});