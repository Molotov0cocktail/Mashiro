import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { expect, it, vi } from 'vitest'
import { openProductionSession } from '../../src/main/data/production-session.js'
import { SqliteStore } from '../../src/main/data/sqlite.js'
import { AssistantService } from '../../src/main/assistant/assistant-service.js'
import { ItemService } from '../../src/main/item/item-service.js'
import { ReminderService, type ReminderPlatform } from '../../src/main/reminder/reminder-service.js'

function cleanOwnedRoot(root: string): void {
  const actual = realpathSync.native(root)
  if (
    dirname(actual) !== realpathSync.native(tmpdir()) ||
    !basename(actual).startsWith('mashiro-root-reminder-restore-')
  )
    throw Error('UNOWNED_ROOT')
  rmSync(actual, { recursive: true, force: true })
}

it.each(['cancel', 'handle', 'unchanged'] as const)(
  'restoring an old backup preserves reminder outcome %s without disabling healthy schedules',
  async (action) => {
    const root = mkdtempSync(join(realpathSync.native(tmpdir()), 'mashiro-root-reminder-restore-'))
    const config = join(root, '配置'),
      data = join(root, '原始'),
      backup = join(root, '备份'),
      target = join(root, '恢复')
    for (const path of [config, data, backup, target]) mkdirSync(path)
    const session = await openProductionSession({
      configurationDirectory: config,
      choose: async () => ({ action: 'create', directory: data }),
      prepareExisting: async () => {},
      onOwnershipLost: () => {}
    })
    if (!session) throw Error('SESSION_REQUIRED')
    const stores: SqliteStore[] = []
    const reminders: ReminderService[] = []
    let now = Date.parse('2030-01-01T00:00:00Z')
    try {
      const assistants = AssistantService.open(session.databasePath)
      const made = assistants.create({
        protocolVersion: 1,
        displayName: '恢复提醒合成',
        expectedStateRevision: 0
      })
      assistants.close()
      if (!made.ok) throw Error('ASSISTANT_REQUIRED')
      const assistantId = made.data.assistants[0]!.id
      const open = (path: string) => {
        const store = new SqliteStore(path)
        stores.push(store)
        const service = new ReminderService(store, () => new Date(now))
        reminders.push(service)
        return { store, service }
      }
      const first = open(session.databasePath)
      const items = new ItemService(
        first.store,
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
            title: '仍保留的正式事项',
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
      const created = first.service.mutate({
        protocolVersion: 1,
        assistantId,
        commandId: randomUUID(),
        mutation: {
          action: 'create',
          itemId: item.objectId!,
          expectedItemVersion: 1,
          dueAt: '2030-01-01T00:01:00+00:00',
          timeZone: 'UTC'
        }
      })
      if (!created.ok || !created.data.reminderId) throw Error('REMINDER_REQUIRED')
      first.service.close()
      first.store.close()
      const receipt = await session.backup(backup, () => {})
      const later = open(session.databasePath)
      if (action !== 'unchanged') {
        const changed = later.service.mutate({
          protocolVersion: 1,
          assistantId,
          commandId: randomUUID(),
          mutation: { action, id: created.data.reminderId, expectedVersion: 1 }
        })
        expect(changed.ok).toBe(true)
      }
      later.service.close()
      later.store.close()
      await session.restore(backup, target, receipt, () => {})
      const restored = open(join(target, 'mashiro.sqlite'))
      const show = vi.fn<ReminderPlatform['show']>(() => ({ close() {} }))
      restored.service.attach(
        {
          notificationSupported: () => true,
          loginStartupSupported: () => false,
          getLoginStartup: () => false,
          setLoginStartup: () => {},
          show
        },
        () => {}
      )
      now += 120000
      restored.service.recover()
      restored.service.tick()
      expect(show).toHaveBeenCalledTimes(action === 'unchanged' ? 1 : 0)
      const result = restored.service.query({ protocolVersion: 1, assistantId })
      expect(result.ok).toBe(true)
      if (result.ok && action !== 'unchanged')
        expect(
          result.data.records.find((record) => record.id === created.data.reminderId)?.state
        ).toBe(action === 'cancel' ? 'CANCELLED' : 'HANDLED')
      expect(
        restored.store.database.prepare('SELECT id FROM items WHERE id=?').get(item.objectId!)
      ).toBeDefined()
    } finally {
      for (const service of reminders) service.close()
      for (const store of stores) if (store.database.isOpen) store.close()
      await session.release()
      cleanOwnedRoot(root)
    }
  }
)
