import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, basename } from 'node:path'
import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { openProductionSession } from '../../src/main/data/production-session.js'
import { restoreProductionAtStartup } from '../../src/main/data/production-startup-restore.js'
import { SqliteStore } from '../../src/main/data/sqlite.js'

it('startup restores settled later tombstones even when the current SQLite is damaged, without changing its bytes', async () => {
  const root = mkdtempSync(join(realpathSync.native(tmpdir()), 'mashiro-gov-damaged-'))
  const config = join(root, '配置'),
    data = join(root, '损坏原库'),
    target = join(root, '恢复'),
    backup = join(root, '备份')
  for (const path of [config, data, target, backup]) mkdirSync(path)
  const session = await openProductionSession({
    configurationDirectory: config,
    choose: async () => ({ action: 'create', directory: data }),
    prepareExisting: async () => {},
    onOwnershipLost: () => {}
  })
  if (!session) throw Error('NO_SESSION')
  try {
    await session.backup(backup, () => {})
    const id = randomUUID(),
      store = new SqliteStore(session.databasePath)
    store.database.prepare("INSERT INTO item_tombstones VALUES('proposal',?)").run(id)
    store.close()
    await session.release()
    const damaged = Buffer.from('SYNTHETIC-DAMAGED-CURRENT-SQLITE')
    writeFileSync(session.databasePath, damaged)
    const choices = [backup, target]
    expect(
      await restoreProductionAtStartup(
        {
          showMessageBox: async () => ({ response: 1 }),
          showOpenDialog: async () => ({ canceled: false, filePaths: [choices.shift()!] })
        },
        config
      )
    ).toBe(target)
    expect(readFileSync(session.databasePath)).toEqual(damaged)
    const restored = new SqliteStore(join(target, 'mashiro.sqlite'))
    try {
      expect(
        restored.database
          .prepare("SELECT 1 FROM item_tombstones WHERE kind='proposal' AND id=?")
          .get(id)
      ).toBeDefined()
    } finally {
      restored.close()
    }
  } finally {
    await session.release()
    const actual = realpathSync.native(root)
    if (
      dirname(actual) !== realpathSync.native(tmpdir()) ||
      !basename(actual).startsWith('mashiro-gov-damaged-')
    )
      rejectUnownedRoot()
    rmSync(actual, { recursive: true, force: true })
  }
})

function rejectUnownedRoot(): never {
  throw Error('UNOWNED_ROOT')
}
