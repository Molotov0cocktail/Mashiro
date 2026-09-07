import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { afterEach, expect, it } from 'vitest'
import { AssistantService } from '../../src/main/assistant/assistant-service.js'
import { SqliteStore } from '../../src/main/data/sqlite.js'
import { ItemService } from '../../src/main/item/item-service.js'
import {
  ReminderService,
  assertReminderTime,
  type ReminderPlatform
} from '../../src/main/reminder/reminder-service.js'
import type { ReminderChanged } from '../../src/shared/reminder-contract.js'

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
  const create = (
    dueAt = '2030-01-01T00:00:01+00:00',
    commandId = randomUUID(),
    itemId = item.objectId!
  ) => {
    const input = {
      ...base,
      commandId,
      mutation: {
        action: 'create' as const,
        itemId,
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
it('unchanged ticks do not broadcast or rewrite pending recovery records', () => {
  const f = fixture()
  f.service.tick()
  f.service.tick()
  expect(f.events).toHaveLength(0)
  f.create()
  f.time(60000)
  f.service.recover()
  const before = f.records()[0]!.updatedAt
  const count = f.events.length
  f.time(1000)
  f.service.tick()
  f.service.tick()
  expect(f.events).toHaveLength(count)
  expect(f.records()[0]!.updatedAt).toBe(before)
})
it('broadcasts a committed item cancellation once even when no reminder service write occurs', () => {
  const f = fixture()
  f.create()
  f.events.splice(0)
  f.items.applyMutation(
    f.base.assistantId,
    randomUUID(),
    { action: 'transition', id: f.item.objectId!, expectedVersion: 1, status: 'completed' },
    []
  )
  f.service.tick()
  expect(f.events).toEqual([{ kind: 'changed', itemId: null }])
  f.service.tick()
  expect(f.events).toHaveLength(1)
})
it('commits one stable command and suppresses simultaneous scheduler and repeated tick delivery', () => {
  const f = fixture()
  const made = f.create()
  expect(f.service.mutate(made.input)).toEqual({ ok: true, data: made.receipt })
  f.time(1000)
  f.service.tick()
  f.service.tick()
  const second = new ReminderService(f.store, f.clock)
  second.attach(f.platform, () => undefined)
  second.tick()
  expect(f.shown).toHaveLength(1)
  expect(f.records()[0]!.state).toBe('DISPLAY_OBSERVED')
  expect(
    f.service.mutate({
      ...made.input,
      mutation: { ...made.input.mutation, dueAt: '2030-01-01T00:00:02+00:00' }
    })
  ).toMatchObject({ ok: false, error: { code: 'CONFLICT' } })
})
it('rolls back business and receipt together before COMMIT', () => {
  const f = fixture((phase) => {
    if (phase === 'before-commit') throw Error('injected')
  })
  const commandId = randomUUID()
  expect(
    f.service.mutate({
      ...f.base,
      commandId,
      mutation: {
        action: 'create',
        itemId: f.item.objectId,
        expectedItemVersion: 1,
        dueAt: '2030-01-01T00:00:01Z',
        timeZone: 'UTC'
      }
    })
  ).toMatchObject({ ok: false })
  expect(f.records()).toHaveLength(0)
  expect(f.service.operation({ ...f.base, commandId })).toMatchObject({
    ok: true,
    data: { state: 'CONFIRMED_NOT_APPLIED' }
  })
})
it('crash after durable claim becomes unknown on recovery and never blindly resends', () => {
  const f = fixture((phase) => {
    if (phase === 'after-claim') throw Error('crash')
  })
  f.create()
  f.time(1000)
  expect(() => f.service.tick()).toThrow('crash')
  const recovered = new ReminderService(f.store, f.clock)
  recovered.attach(f.platform, () => undefined)
  recovered.recover()
  recovered.tick()
  expect(f.records()[0]!.state).toBe('RESULT_UNKNOWN')
  expect(f.shown).toHaveLength(0)
})
it('approved 24-hour default catches only the latest missed reminder per item without duplicate activation', () => {
  const f = fixture()
  f.create()
  const latest = f.create('2030-01-01T00:00:02+00:00')
  expect(f.service.runtime({ protocolVersion: 1 })).toMatchObject({
    ok: true,
    data: { version: 0, policy: { mode: 'EXPLICIT', catchUpMinutes: 1440, merge: true } }
  })
  f.time(60000)
  f.service.recover()
  expect(f.records().filter((r) => r.state === 'EXPIRED')).toHaveLength(1)
  expect(f.records().find((r) => r.id === latest.receipt.reminderId)?.state).toBe(
    'DISPLAY_OBSERVED'
  )
  expect(f.shown).toHaveLength(1)
  expect(f.shown[0]!.count).toBe(1)
  f.service.recover()
  expect(f.shown).toHaveLength(1)
  f.shown[0]!.event('click')
  f.shown[0]!.event('click')
  expect(f.events.filter((e) => e.kind === 'open-item')).toHaveLength(1)
})
it('approved default expires reminders beyond 24 hours and preserves a user-selected disabled policy across service restart', () => {
  const f = fixture()
  f.create()
  f.time(86402000)
  f.service.recover()
  expect(f.records()[0]!.state).toBe('EXPIRED')
  expect(f.shown).toHaveLength(0)
  expect(
    f.service.configure({
      protocolVersion: 1,
      expectedVersion: 0,
      policy: { mode: 'EXPLICIT', catchUpMinutes: 0, merge: false },
      loginStartup: false
    }).ok
  ).toBe(true)
  const recovered = new ReminderService(f.store, f.clock)
  expect(recovered.runtime({ protocolVersion: 1 })).toMatchObject({
    ok: true,
    data: { version: 1, policy: { mode: 'EXPLICIT', catchUpMinutes: 0, merge: false } }
  })
  recovered.close()
})
it('explicit zero catchup expires missed schedules instead of silently delivering', () => {
  const f = fixture()
  f.create()
  f.time(60000)
  f.service.configure({
    protocolVersion: 1,
    expectedVersion: 0,
    policy: { mode: 'EXPLICIT', catchUpMinutes: 0, merge: false },
    loginStartup: false
  })
  expect(f.records()[0]!.state).toBe('EXPIRED')
  expect(f.shown).toHaveLength(0)
})
it('ordinary item title edit preserves schedule but completion cancels and stale notification click is inert', () => {
  const f = fixture()
  f.create()
  const inspect = f.items.inspect({ ...f.base, type: 'item', id: f.item.objectId })
  if (!inspect.ok) throw Error('fixture')
  f.items.applyMutation(
    f.base.assistantId,
    randomUUID(),
    {
      action: 'update',
      id: f.item.objectId!,
      expectedVersion: 1,
      content: { ...inspect.data.item!.content, title: '已改名' }
    },
    []
  )
  f.time(1000)
  f.service.tick()
  expect(f.shown).toHaveLength(1)
  f.items.applyMutation(
    f.base.assistantId,
    randomUUID(),
    { action: 'transition', id: f.item.objectId!, expectedVersion: 2, status: 'completed' },
    []
  )
  f.service.tick()
  f.shown[0]!.event('click')
  expect(f.shown[0]!.closed).toBe(true)
  expect(f.records()[0]!.state).toBe('CANCELLED')
  expect(f.events.filter((e) => e.kind === 'open-item')).toHaveLength(0)
})
it('rescheduling creates a fresh occurrence identity and blocks previous callbacks', () => {
  const f = fixture()
  const made = f.create()
  f.time(1000)
  f.service.tick()
  const changed = f.service.mutate({
    ...f.base,
    commandId: randomUUID(),
    mutation: {
      action: 'reschedule',
      id: made.receipt.reminderId,
      expectedVersion: 1,
      expectedItemVersion: 1,
      dueAt: '2030-01-01T00:00:02Z',
      timeZone: 'UTC'
    }
  })
  expect(changed).toMatchObject({
    ok: true,
    data: { reminderId: made.receipt.reminderId, reminderVersion: 2 }
  })
  f.shown[0]!.event('click')
  f.time(1000)
  f.service.tick()
  expect(f.shown).toHaveLength(2)
  expect(f.events.filter((e) => e.kind === 'open-item')).toHaveLength(0)
  f.shown[1]!.event('click')
  f.service.activate(made.receipt.reminderId!, 2)
  expect(f.events.filter((e) => e.kind === 'open-item')).toHaveLength(1)
})
it('notification unsupported is known failure; native throw is honest unknown', () => {
  const f = fixture()
  f.create()
  f.platform.notificationSupported = () => false
  f.time(1000)
  f.service.tick()
  expect(f.records()[0]!.state).toBe('FAILED')
  f.create('2030-01-01T00:00:02Z')
  f.platform.notificationSupported = () => true
  f.platform.show = () => {
    throw Error('native boundary unknown')
  }
  f.time(1000)
  f.service.tick()
  expect(f.records().some((r) => r.state === 'RESULT_UNKNOWN')).toBe(true)
})

it.each(['completed', 'cancelled'] as const)(
  'persists %s cancellation before an item reopens between ticks',
  (status) => {
    const f = fixture()
    f.create()
    f.items.applyMutation(
      f.base.assistantId,
      randomUUID(),
      { action: 'transition', id: f.item.objectId!, expectedVersion: 1, status },
      []
    )
    f.items.applyMutation(
      f.base.assistantId,
      randomUUID(),
      { action: 'transition', id: f.item.objectId!, expectedVersion: 2, status: 'open' },
      []
    )
    f.time(1000)
    f.service.tick()
    expect(f.records()[0]!.state).toBe('CANCELLED')
    expect(f.shown).toHaveLength(0)
  }
)
it('rolls back reminder cancellation when the enclosing item receipt cannot commit', () => {
  const f = fixture()
  f.create()
  f.store.database.exec(
    "CREATE TRIGGER reject_review_receipt BEFORE INSERT ON item_commands BEGIN SELECT RAISE(ABORT,'synthetic receipt fault'); END"
  )
  expect(() =>
    f.items.applyMutation(
      f.base.assistantId,
      randomUUID(),
      { action: 'transition', id: f.item.objectId!, expectedVersion: 1, status: 'completed' },
      []
    )
  ).toThrow()
  expect(f.items.inspect({ ...f.base, type: 'item', id: f.item.objectId! })).toMatchObject({
    ok: true,
    data: { item: { content: { status: 'open' } } }
  })
  expect(f.records()[0]!.state).toBe('SCHEDULED')
  f.time(1000)
  f.service.tick()
  expect(f.shown).toHaveLength(1)
})
it('keeps a merged notification until its last valid member is cancelled and ignores old clicks', () => {
  const f = fixture()
  const first = f.create()
  const otherItem = f.items.applyMutation(
    f.base.assistantId,
    randomUUID(),
    {
      action: 'create',
      content: {
        kind: 'task',
        title: '另一合成事项',
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
  const second = f.create(undefined, undefined, otherItem.objectId!)
  f.time(60000)
  f.service.configure({
    protocolVersion: 1,
    expectedVersion: 0,
    policy: { mode: 'EXPLICIT', catchUpMinutes: 2, merge: true },
    loginStartup: false
  })
  const cancel = (id: string) =>
    f.service.mutate({
      ...f.base,
      commandId: randomUUID(),
      mutation: { action: 'cancel', id, expectedVersion: 1 }
    })
  expect(f.shown).toHaveLength(1)
  expect(f.shown[0]!.count).toBe(2)
  expect(cancel(first.receipt.reminderId!).ok).toBe(true)
  expect(f.shown[0]!.closed).toBe(false)
  expect(cancel(second.receipt.reminderId!).ok).toBe(true)
  expect(f.shown[0]!.closed).toBe(true)
  const before = f.events.length
  f.shown[0]!.event('click')
  expect(f.events).toHaveLength(before)
})

it('validates offset against IANA zone including DST gap and permits explicit ambiguous offsets', () => {
  const before = Date.parse('2029-01-01T00:00:00Z')
  expect(() =>
    assertReminderTime('2030-03-10T02:30:00-05:00', 'America/New_York', before)
  ).toThrow()
  expect(() =>
    assertReminderTime('2030-11-03T01:30:00-04:00', 'America/New_York', before)
  ).not.toThrow()
  expect(() =>
    assertReminderTime('2030-11-03T01:30:00-05:00', 'America/New_York', before)
  ).not.toThrow()
  expect(() => assertReminderTime('2030-01-01T09:00:00+00:00', 'Asia/Shanghai', before)).toThrow()
})
it('rejects extra authority fields, stale versions, completed items and proposal identities', () => {
  const f = fixture()
  const made = f.create()
  expect(f.service.mutate({ ...made.input, arbitraryNetwork: true })).toMatchObject({
    ok: false,
    error: { code: 'INVALID_INPUT' }
  })
  expect(
    f.service.mutate({
      ...f.base,
      commandId: randomUUID(),
      mutation: { action: 'cancel', id: made.receipt.reminderId, expectedVersion: 2 }
    })
  ).toMatchObject({ ok: false, error: { code: 'STALE_WRITE' } })
  expect(
    f.service.mutate({
      ...made.input,
      commandId: randomUUID(),
      mutation: { ...made.input.mutation, itemId: randomUUID() }
    })
  ).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
  f.items.applyMutation(
    f.base.assistantId,
    randomUUID(),
    { action: 'transition', id: f.item.objectId!, expectedVersion: 1, status: 'completed' },
    []
  )
  expect(
    f.service.mutate({
      ...made.input,
      commandId: randomUUID(),
      mutation: { ...made.input.mutation, expectedItemVersion: 2 }
    })
  ).toMatchObject({ ok: false, error: { code: 'PERMISSION_DENIED' } })
})
