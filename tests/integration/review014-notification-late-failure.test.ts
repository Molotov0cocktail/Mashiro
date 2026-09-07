import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { afterEach, expect, it } from 'vitest'
import { AssistantService } from '../../src/main/assistant/assistant-service.js'
import { ItemService } from '../../src/main/item/item-service.js'
import { SqliteStore } from '../../src/main/data/sqlite.js'
import { ReminderService, type ReminderPlatform } from '../../src/main/reminder/reminder-service.js'

const cleanup: (() => void)[] = []
afterEach(() => {
  for (const fn of cleanup.splice(0).reverse()) fn()
})
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'mashiro-review014-notification-'))
  cleanup.push(() => rmSync(root, { recursive: true, force: true }))
  const path = join(root, 'synthetic.sqlite')
  const assistants = AssistantService.open(path)
  const created = assistants.create({
    protocolVersion: 1,
    displayName: '独立通知合成',
    expectedStateRevision: 0
  })
  if (!created.ok) throw Error('fixture assistant')
  const assistantId = created.data.assistants[0]!.id
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
        title: '独立通知事项',
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
  const service = new ReminderService(store, () => new Date(now))
  cleanup.push(() => service.close())
  let callback: ((kind: 'show' | 'failed' | 'click') => void) | undefined
  let shows = 0
  const platform: ReminderPlatform = {
    notificationSupported: () => true,
    loginStartupSupported: () => false,
    getLoginStartup: () => false,
    setLoginStartup: () => {
      throw Error('unexpected')
    },
    show: (_input, event) => {
      shows += 1
      callback = event
      return { close: () => undefined }
    }
  }
  service.attach(platform, () => undefined)
  const base = { protocolVersion: 1 as const, assistantId }
  const createdReminder = service.mutate({
    ...base,
    commandId: randomUUID(),
    mutation: {
      action: 'create',
      itemId: item.objectId!,
      expectedItemVersion: 1,
      dueAt: '2030-01-01T00:00:01+00:00',
      timeZone: 'UTC'
    }
  })
  if (!createdReminder.ok) throw Error('fixture reminder')
  now += 1000
  service.tick()
  const read = () => {
    const result = service.query(base)
    if (!result.ok) throw Error('fixture read')
    return result.data.records[0]!
  }
  const occurrence = () =>
    String(store.database.prepare('SELECT state FROM reminder_occurrences').get()!.state)
  return {
    service,
    items,
    assistantId,
    item,
    read,
    occurrence,
    emit: (kind: 'show' | 'failed') => {
      if (!callback) throw Error('no native dispatch')
      callback(kind)
    },
    shows: () => shows
  }
}
it('an asynchronous native failure after show supersedes display observation in both durable states', () => {
  const f = fixture()
  expect(f.read().state).toBe('DISPATCHING')
  f.emit('show')
  expect(f.read().state).toBe('DISPLAY_OBSERVED')
  f.emit('failed')
  expect(f.read().state).toBe('FAILED')
  expect(f.occurrence()).toBe('FAILED')
  f.service.tick()
  expect(f.shows()).toBe(1)
})
it('failure before show stays failed when a stale show arrives and is not redispatched', () => {
  const f = fixture()
  f.emit('failed')
  f.emit('show')
  expect(f.read().state).toBe('FAILED')
  expect(f.occurrence()).toBe('FAILED')
  f.service.tick()
  expect(f.shows()).toBe(1)
})
it('a completed item remains cancelled when native failure arrives after display', () => {
  const f = fixture()
  f.emit('show')
  f.items.applyMutation(
    f.assistantId,
    randomUUID(),
    {
      action: 'transition',
      id: f.item.objectId!,
      expectedVersion: 1,
      status: 'completed'
    },
    []
  )
  f.service.tick()
  expect(f.read().state).toBe('CANCELLED')
  f.emit('failed')
  expect(f.read().state).toBe('CANCELLED')
  expect(f.shows()).toBe(1)
})
