// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ItemPanel } from '../../src/renderer/src/features/items/ItemPanel'
import { itemApi010Defaults, itemAssistantA, itemId, itemReceipt } from './item-api-fixture'
afterEach(cleanup)
it('independent: visible local verification restores the original pending manifest without releasing identity', async () => {
  const api = itemApi010Defaults()
  const seeded = await api.preview({protocolVersion: 1, assistantId:itemAssistantA,commandId:crypto.randomUUID(),action:'delete',targets:[{id:itemId,expectedVersion:2}]})
  if (!seeded.ok) throw new Error('synthetic fixture')
  api.preview = vi.fn(async input => {
    if(input.action !== 'recover') throw new Error('synthetic lost preview')
    return {ok:true as const,data:{...seeded.data,receipt:{...seeded.data.receipt,operationId:input.commandId}}}
  })
  api.operation = vi.fn(async input => ({ok:true as const,data:itemReceipt({operationId:input.commandId,state:'PENDING_CONFIRMATION',confirmationId:seeded.data.confirmationId})}))
  const registry = new Map<string,string>()
  render(<ItemPanel assistantId={itemAssistantA} assistantName="Alpha" api={api} pendingCommands={registry}/>)
  const row = await screen.findByRole('article',{name:'正式事项：周五交报告'})
  fireEvent.click(within(row).getByRole('button',{name:'查看与编辑'}))
  fireEvent.click(await screen.findByRole('button',{name:'永久删除此事项'}))
  await screen.findByText(/确认预览结果未知/)
  const original = vi.mocked(api.preview).mock.calls[0]![0].commandId
  fireEvent.click(screen.getByRole('button',{name:'核查本地状态'}))
  await waitFor(()=>expect(api.operation).toHaveBeenCalled())
  await waitFor(()=>expect(api.preview).toHaveBeenLastCalledWith({protocolVersion:1,assistantId:itemAssistantA,commandId:original,action:'recover'}))
  expect([...registry.values()]).toContain(original)
  expect(await screen.findByRole('region',{name:'事项删除确认'})).toHaveTextContent('周五交报告')
  expect(api.confirm).not.toHaveBeenCalled()
})
