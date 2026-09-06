import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { afterEach, expect, it } from 'vitest'
import { AssistantService } from '../../../src/main/assistant/assistant-service.js'
import { SqliteStore } from '../../../src/main/data/sqlite.js'
import { ItemService } from '../../../src/main/item/item-service.js'
import {
  ReminderService,
  assertReminderTime,
  type ReminderPlatform
} from '../../../src/main/reminder/reminder-service.js'
import type { ReminderChanged } from '../../../src/shared/reminder-contract.js'

const cleanup: (() => void)[] = []
afterEach(() => {
  for (const fn of cleanup.splice(0).reverse()) fn()
})
function fixture(fault?: (phase: string) => void) {
  const root = mkdtempSync(join(tmpdir(), 'mashiro-reminders-'))
  cleanup.push(() => rmSync(root, { recursive: true, force: true }))
  const path = join(root, 'state.sqlite')
  const assistants = AssistantService.open(path)
  const made = assistants.create({
    protocolVersion: 1,
    displayName: '合成提醒',
    expectedStateRevision: 0
  })
  if (!made.ok) throw Error('fixture')
  const assistantId = made.data.assistants[0]!.id
  assistants.close()
  const store = new SqliteStore(path)
  cleanup.push(() => store.close())
  const items = new ItemService(
    store,
    () => ({ fingerprint: null, display: null }),
    () => undefined
  )
  const item = items.applyMutation(
    assistantId,
    randomUUID(),
    {
      action: 'create',
      content: {
        kind: 'task',
        title: '合成报告',
        description: '',
        status: 'open',
        dueAt: null,
        timeZone: null,
        parentId: null,
        relatedIds: [],
        counterpart: ''
      }
    },
    []
  )
  let now = Date.parse('2030-01-01T00:00:00Z')
  const clock = () => new Date(now)
  const service = new ReminderService(store, clock, fault)
  cleanup.push(() => service.close())
  const events: ReminderChanged[] = []
  const shown: {
    event: (kind: 'show' | 'failed' | 'click') => void
    closed: boolean
    count: number
  }[] = []
  const platform: ReminderPlatform = {
    notificationSupported: () => true,
    loginStartupSupported: () => false,
    getLoginStartup: () => false,
    setLoginStartup: () => {
      throw Error('unexpected')
    },
    show: (input, event) => {
      const record = { event, closed: false, count: input.count }
      shown.push(record)
      event('show')
      return {
        close: () => {
          record.closed = true
        }
      }
    }
  }
  service.attach(platform, (event) => events.push(event))
  const base = { protocolVersion: 1 as const, assistantId }
  const create = (dueAt = '2030-01-01T00:00:01+00:00', commandId = randomUUID()) => {
    const input = {
      ...base,
      commandId,
      mutation: {
        action: 'create' as const,
        itemId: item.objectId!,
        expectedItemVersion: 1,
        dueAt,
        timeZone: 'UTC'
      }
    }
    const result = service.mutate(input)
    if (!result.ok) throw Error(result.error.code)
    return { input, receipt: result.data }
  }
  const records = () => {
    const result = service.query(base)
    if (!result.ok) throw Error(result.error.code)
    return result.data.records
  }
  return {
    store,
    service,
    items,
    item,
    base,
    create,
    records,
    shown,
    platform,
    events,
    clock,
    time: (value: number) => {
      now += value
    }
  }
}
it('review: complete then reopen before scheduler cannot revive the original plan', () => {
  const f = fixture()
  f.create()
  f.items.applyMutation(f.base.assistantId, randomUUID(), {action:'transition',id:f.item.objectId!,expectedVersion:1,status:'completed'}, [])
  f.items.applyMutation(f.base.assistantId, randomUUID(), {action:'transition',id:f.item.objectId!,expectedVersion:2,status:'open'}, [])
  f.time(1000)
  f.service.tick()
  expect(f.records()[0]!.state).toBe('CANCELLED')
  expect(f.shown).toHaveLength(0)
})
it('review: cancelling one merged occurrence preserves the notification for its live sibling', () => {
  const f = fixture()
  const first=f.create()
  f.create()
  f.time(60000)
  f.service.configure({protocolVersion:1,expectedVersion:0,policy:{mode:'EXPLICIT',catchUpMinutes:2,merge:true},loginStartup:false})
  expect(f.shown).toHaveLength(1)
  f.service.mutate({...f.base,commandId:randomUUID(),mutation:{action:'cancel',id:first.receipt.reminderId,expectedVersion:1}})
  expect(f.shown[0]!.closed).toBe(false)
})
it('review: failed post-show claim recovers unknown without replay and explicit reschedule alone makes a new occurrence', () => {
  let fail=true
  const f=fixture(phase=>{if(phase==='after-show' && fail)throw Error('post-show fault')})
  const first=f.create()
  f.platform.show=(input,event)=>{f.shown.push({event,closed:false,count:input.count});return {close:()=>undefined}}
  f.time(1000)
  expect(()=>f.service.tick()).toThrow('post-show fault')
  fail=false
  const recovered=new ReminderService(f.store,f.clock)
  recovered.attach(f.platform,()=>undefined)
  cleanup.push(()=>recovered.close())
  recovered.recover()
  recovered.tick()
  expect(f.records()[0]!.state).toBe('RESULT_UNKNOWN')
  expect(f.shown).toHaveLength(1)
  expect(recovered.mutate({...f.base,commandId:randomUUID(),mutation:{action:'reschedule',id:first.receipt.reminderId,expectedVersion:1,expectedItemVersion:1,dueAt:'2030-01-01T00:00:02Z',timeZone:'UTC'}}).ok).toBe(true)
  f.time(1000)
  recovered.tick()
  expect(f.shown).toHaveLength(2)
})