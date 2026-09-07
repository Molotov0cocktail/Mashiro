import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { afterEach, expect, it, vi } from 'vitest'
import { AssistantService } from '../../src/main/assistant/assistant-service.js'
import { ItemService } from '../../src/main/item/item-service.js'
import { SqliteStore } from '../../src/main/data/sqlite.js'
import { ReminderService, type ReminderPlatform } from '../../src/main/reminder/reminder-service.js'

const cleanups: (() => void)[] = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup()
  vi.restoreAllMocks()
})
function fixture(count = 1) {
  const root = mkdtempSync(join(tmpdir(), 'mashiro-review014-lifecycle-'))
  cleanups.push(() => rmSync(root, { recursive: true, force: true }))
  const path = join(root, 'synthetic.sqlite')
  const assistants = AssistantService.open(path)
  const created = assistants.create({
    protocolVersion: 1,
    displayName: '独立退出通知合成',
    expectedStateRevision: 0
  })
  if (!created.ok) throw Error('fixture assistant')
  const assistantId = created.data.assistants[0]!.id
  assistants.close()
  const store = new SqliteStore(path)
  let closed = false
  const closeDatabase = () => {
    if (!closed) store.close()
    closed = true
  }
  cleanups.push(closeDatabase)
  const items = new ItemService(
    store,
    () => ({ fingerprint: null, display: null }),
    () => undefined
  )
  let now = Date.parse('2030-01-01T00:00:00Z')
  const service = new ReminderService(store, () => new Date(now))
  cleanups.push(() => service.close())
  const changed = vi.fn()
  const nativeClose = vi.fn()
  const callbacks: ((kind: 'show' | 'failed' | 'click') => void)[] = []
  const show = vi.fn<ReminderPlatform['show']>((_input, event) => {
    callbacks.push(event)
    return { close: nativeClose }
  })
  service.attach(
    {
      notificationSupported: () => true,
      loginStartupSupported: () => false,
      getLoginStartup: () => false,
      setLoginStartup: () => {
        throw Error('unexpected')
      },
      show
    },
    changed
  )
  const itemIds: string[] = []
  const base = { protocolVersion: 1 as const, assistantId }
  for (let index = 0; index < count; index++) {
    const item = items.applyMutation(
      assistantId,
      randomUUID(),
      {
        action: 'create',
        content: {
          kind: 'task',
          title: `退出合成事项${index}`,
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
    itemIds.push(item.objectId!)
    const result = service.mutate({
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
    if (!result.ok) throw Error('fixture reminder')
  }
  now += 1000
  service.tick()
  expect(show).toHaveBeenCalledTimes(1)
  const complete = (index: number) => {
    items.applyMutation(
      assistantId,
      randomUUID(),
      { action: 'transition', id: itemIds[index]!, expectedVersion: 1, status: 'completed' },
      []
    )
    service.tick()
  }
  return {
    service,
    store,
    closeDatabase,
    changed,
    nativeClose,
    show,
    complete,
    emit: (kind: 'show' | 'failed' | 'click') => callbacks[0]!(kind)
  }
}
it('repeated process close preserves an already displayed native notification', () => {
  const f = fixture()
  f.emit('show')
  f.service.close()
  f.service.close()
  expect(f.nativeClose).not.toHaveBeenCalled()
  expect(f.show).toHaveBeenCalledTimes(1)
})
it('after process close all late native events and scheduler entry points avoid the closed database', () => {
  const f = fixture()
  f.emit('show')
  f.service.close()
  f.closeDatabase()
  const prepare = vi.spyOn(f.store.database, 'prepare')
  f.changed.mockClear()
  for (const event of ['show', 'failed', 'click'] as const)
    expect(() => f.emit(event)).not.toThrow()
  expect(() => f.service.tick()).not.toThrow()
  expect(() => f.service.recover()).not.toThrow()
  f.service.activate(randomUUID(), 1)
  f.service.activateGroup('a'.repeat(64))
  f.service.close()
  expect(prepare).not.toHaveBeenCalled()
  expect(f.changed).not.toHaveBeenCalled()
  expect(f.show).toHaveBeenCalledTimes(1)
})
it('business completion retains a merged notification until its last valid item is completed', () => {
  const f = fixture(2)
  f.emit('show')
  f.complete(0)
  expect(f.nativeClose).not.toHaveBeenCalled()
  f.complete(1)
  expect(f.nativeClose).toHaveBeenCalledTimes(1)
  f.service.tick()
  f.service.close()
  expect(f.nativeClose).toHaveBeenCalledTimes(1)
})
