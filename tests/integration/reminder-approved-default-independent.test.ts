import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { AssistantService } from '../../src/main/assistant/assistant-service.js'
import { SqliteStore } from '../../src/main/data/sqlite.js'
import { ItemService } from '../../src/main/item/item-service.js'
import { ReminderService, type ReminderPlatform } from '../../src/main/reminder/reminder-service.js'
import type { ReminderChanged } from '../../src/shared/reminder-contract.js'

const cleanup: (() => void)[] = []
afterEach(() => {
  for (const dispose of cleanup.splice(0).reverse()) dispose()
})

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'mashiro-reminder-default-review-'))
  cleanup.push(() => rmSync(root, { recursive: true, force: true }))
  const databasePath = join(root, 'state.sqlite')
  const assistants = AssistantService.open(databasePath)
  const created = assistants.create({
    protocolVersion: 1,
    displayName: '默认提醒复核',
    expectedStateRevision: 0
  })
  if (!created.ok) throw new Error(created.error.code)
  const assistantId = created.data.assistants[0]!.id
  assistants.close()
  const store = new SqliteStore(databasePath)
  cleanup.push(() => store.close())
  const items = new ItemService(
    store,
    () => ({ fingerprint: null, display: null }),
    () => undefined
  )
  let now = Date.parse('2030-01-01T00:00:00Z')
  const clock = () => new Date(now)
  const service = new ReminderService(store, clock)
  cleanup.push(() => service.close())
  const shown: { count: number; groupId: string }[] = []
  const events: ReminderChanged[] = []
  const platform: ReminderPlatform = {
    notificationSupported: () => true,
    loginStartupSupported: () => false,
    getLoginStartup: () => false,
    setLoginStartup: () => {
      throw new Error('unexpected')
    },
    show(input, event) {
      if (!input.groupId) throw new Error('missing durable group')
      shown.push({ count: input.count, groupId: input.groupId })
      event('show')
      return { close() {} }
    }
  }
  service.attach(platform, (event) => events.push(event))
  const createReminder = (title: string, dueAt = '2030-01-01T00:00:01Z') => {
    const item = items.applyMutation(
      assistantId,
      randomUUID(),
      {
        action: 'create',
        content: {
          kind: 'task',
          title,
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
    const result = service.mutate({
      protocolVersion: 1,
      assistantId,
      commandId: randomUUID(),
      mutation: {
        action: 'create',
        itemId: item.objectId!,
        expectedItemVersion: 1,
        dueAt,
        timeZone: 'UTC'
      }
    })
    if (!result.ok) throw new Error(result.error.code)
    return { itemId: item.objectId!, reminderId: result.data.reminderId! }
  }
  return {
    assistantId,
    store,
    clock,
    service,
    platform,
    events,
    shown,
    createReminder,
    setNow(value: string) {
      now = Date.parse(value)
    }
  }
}

it('includes the exact 24-hour boundary and merges different items under the approved default', () => {
  const f = fixture()
  f.createReminder('第一项')
  f.createReminder('第二项')
  f.setNow('2030-01-02T00:00:01Z')

  f.service.recover()

  expect(f.shown).toHaveLength(1)
  expect(f.shown[0]).toMatchObject({ count: 2, groupId: expect.stringMatching(/^[a-f0-9]{64}$/) })
  const result = f.service.query({ protocolVersion: 1, assistantId: f.assistantId })
  expect(result).toMatchObject({
    ok: true,
    data: {
      runtime: {
        version: 0,
        policy: { mode: 'EXPLICIT', catchUpMinutes: 1440, merge: true }
      },
      records: [{ state: 'DISPLAY_OBSERVED' }, { state: 'DISPLAY_OBSERVED' }]
    }
  })
})

it('keeps the approved multi-item catch-up in one notification beyond one hundred items', () => {
  const f = fixture()
  for (let index = 0; index < 101; index += 1) f.createReminder('事项 ' + index)
  f.setNow('2030-01-01T00:01:00Z')

  f.service.recover()

  expect(f.shown).toHaveLength(1)
  expect(f.shown[0]).toMatchObject({
    count: 101,
    groupId: expect.stringMatching(/^[a-f0-9]{64}$/)
  })
})
it('keeps durable group business activation unique while each valid click can navigate again', () => {
  const f = fixture()
  for (let index = 0; index < 101; index += 1) f.createReminder('重启事项 ' + index)
  f.setNow('2030-01-01T00:01:00Z')
  f.service.recover()
  const groupId = f.shown[0]!.groupId
  f.service.close()

  const recovered = new ReminderService(f.store, f.clock)
  cleanup.push(() => recovered.close())
  recovered.attach(f.platform, (event) => f.events.push(event))
  f.events.splice(0)
  recovered.activateGroup('not-a-group')
  recovered.activateGroup('0'.repeat(64))
  expect(f.events).toEqual([])

  recovered.activateGroup(groupId)
  recovered.activateGroup(groupId)
  expect(f.events).toEqual([
    { kind: 'open-reminders', itemId: null },
    { kind: 'open-reminders', itemId: null }
  ])
  expect(
    Number(
      f.store.database.prepare('SELECT COUNT(*) AS count FROM reminder_activations').get()?.count ??
        0
    )
  ).toBe(1)
})

it('opens only the surviving item when one durable group member was cancelled', () => {
  const f = fixture()
  const cancelled = f.createReminder('将取消')
  const surviving = f.createReminder('仍有效')
  f.setNow('2030-01-01T00:01:00Z')
  f.service.recover()
  const groupId = f.shown[0]!.groupId
  expect(
    f.service.mutate({
      protocolVersion: 1,
      assistantId: f.assistantId,
      commandId: randomUUID(),
      mutation: { action: 'cancel', id: cancelled.reminderId, expectedVersion: 1 }
    })
  ).toMatchObject({ ok: true })

  f.service.close()
  const recovered = new ReminderService(f.store, f.clock)
  cleanup.push(() => recovered.close())
  recovered.attach(f.platform, (event) => f.events.push(event))
  f.events.splice(0)
  recovered.activateGroup(groupId)

  expect(f.events).toEqual([{ kind: 'open-item', itemId: surviving.itemId }])
})

it('keeps activation inert when every durable group member was cancelled', () => {
  const f = fixture()
  const first = f.createReminder('取消一')
  const second = f.createReminder('取消二')
  f.setNow('2030-01-01T00:01:00Z')
  f.service.recover()
  const groupId = f.shown[0]!.groupId
  for (const reminder of [first, second])
    expect(
      f.service.mutate({
        protocolVersion: 1,
        assistantId: f.assistantId,
        commandId: randomUUID(),
        mutation: { action: 'cancel', id: reminder.reminderId, expectedVersion: 1 }
      })
    ).toMatchObject({ ok: true })

  f.events.splice(0)
  f.service.activateGroup(groupId)
  expect(f.events).toEqual([])
})
