// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { ReminderPanel } from '../../../src/renderer/src/features/reminders/ReminderPanel'
import { itemApi010Defaults, itemAssistantA, itemRecord } from '../../../tests/renderer/item-api-fixture'
import { reminderApi012Defaults } from '../../../tests/renderer/reminder-api-fixture'
afterEach(cleanup)
it('review: changing an ambiguous wall clock invalidates the previously chosen instant', async()=>{
 const api=reminderApi012Defaults()
 render(<ReminderPanel assistantId={itemAssistantA} assistantName="Synthetic" api={api} itemApi={itemApi010Defaults()} item={itemRecord()}/> )
 await waitFor(()=>expect(api.query).toHaveBeenCalled())
 fireEvent.change(screen.getByLabelText('提醒时区'),{target:{value:'America/New_York'}})
 fireEvent.change(screen.getByLabelText('提醒本地日期和时间'),{target:{value:'2030-11-03T01:30:00'}})
 fireEvent.click(screen.getByRole('radio',{name:/UTC-04:00/}))
 expect(screen.getByRole('button',{name:'保存提醒'})).toBeEnabled()
 fireEvent.change(screen.getByLabelText('提醒本地日期和时间'),{target:{value:'2030-11-03T01:45:00'}})
 expect(screen.getByRole('button',{name:'保存提醒'})).toBeDisabled()
})