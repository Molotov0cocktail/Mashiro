// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ReminderPanel } from '../../../src/renderer/src/features/reminders/ReminderPanel'
import { itemApi010Defaults, itemAssistantA, itemRecord } from '../../../tests/renderer/item-api-fixture'
import { reminderApi012Defaults } from '../../../tests/renderer/reminder-api-fixture'
afterEach(cleanup)
it('review: changed create payload cannot dispatch before previous unknown command is resolved', async () => {
 const api=reminderApi012Defaults()
 api.mutate=vi.fn(async()=>{throw Error('lost receipt after possible commit')})
 const registry=new Map<string,string>()
 render(<ReminderPanel assistantId={itemAssistantA} assistantName="Synthetic" api={api} itemApi={itemApi010Defaults()} item={itemRecord()} pendingCommands={registry}/> )
 await waitFor(()=>expect(api.query).toHaveBeenCalled())
 fireEvent.change(screen.getByLabelText('提醒时区'),{target:{value:'Asia/Shanghai'}})
 fireEvent.change(screen.getByLabelText('提醒本地日期和时间'),{target:{value:'2030-09-12T09:30:00'}})
 fireEvent.click(screen.getByRole('button',{name:'保存提醒'}))
 await screen.findByText(/操作回执未确认/)
 await waitFor(()=>expect(screen.getByRole('button',{name:'核查本地提醒状态'})).toBeEnabled())
 fireEvent.change(screen.getByLabelText('提醒本地日期和时间'),{target:{value:'2030-09-12T10:30:00'}})
 fireEvent.click(screen.getByRole('button',{name:'保存提醒'}))
 await new Promise(resolve=>setTimeout(resolve,50))
 expect(api.mutate).toHaveBeenCalledTimes(1)
})