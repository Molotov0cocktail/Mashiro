// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ItemPanel } from '../../../src/renderer/src/features/items/ItemPanel'
import type { ItemApi } from '../../../src/shared/item-contract'
import { itemApi010Defaults, itemAssistantA, itemRecord, itemContent, itemId } from '../../../tests/renderer/item-api-fixture'
afterEach(cleanup)
it('review: a later notification target wins over an older pending manual inspection', async()=>{
 const api=itemApi010Defaults()
 let resolveManual!: (value:Awaited<ReturnType<ItemApi['inspect']>>)=>void
 const notificationId='00000000-0000-4000-8000-000000000199'
 const notified=itemRecord({id:notificationId,content:itemContent({title:'最新通知事项'})})
 api.inspect=vi.fn(input=>input.id===itemId?new Promise(resolve=>{resolveManual=resolve}):Promise.resolve({ok:true as const,data:{item:notified,proposal:null,receipts:[]}}))
 const view=render(<ItemPanel assistantId={itemAssistantA} assistantName="Synthetic" api={api}/> )
 fireEvent.click(within(await screen.findByRole('article',{name:'正式事项：周五交报告'})).getByRole('button',{name:'查看与编辑'}))
 await waitFor(()=>expect(api.inspect).toHaveBeenCalledWith(expect.objectContaining({id:itemId})))
 view.rerender(<ItemPanel assistantId={itemAssistantA} assistantName="Synthetic" api={api} openItemTarget={{assistantId:itemAssistantA,itemId:notificationId,nonce:1}}/> )
 await waitFor(()=>expect(within(screen.getByRole('region',{name:'事项详情'})).getByLabelText('编辑标题')).toHaveValue('最新通知事项'))
 await act(async()=>resolveManual({ok:true,data:{item:itemRecord(),proposal:null,receipts:[]}}))
 expect(within(screen.getByRole('region',{name:'事项详情'})).getByLabelText('编辑标题')).toHaveValue('最新通知事项')
})