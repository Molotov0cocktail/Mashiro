import { randomUUID } from 'node:crypto'
import { mkdtempSync, mkdirSync, renameSync, readFileSync, rmSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { SqliteStore } from '../../src/main/data/sqlite.js'
import {
  openProductionSession,
  type ProductionSession
} from '../../src/main/data/production-session.js'
import { prepareProductionData } from '../../src/main/data/production-prepare.js'
import { openProductionApplicationData } from '../../src/main/data/production-bootstrap.js'
it('an explicit empty dataset bridge restores the original backup with later original-dataset governance', async () => {
  const root = mkdtempSync(join(realpathSync.native(tmpdir()), 'mashiro-review014-bridge-'))
  const config = join(root, 'config'),
    data = join(root, 'original'),
    backups = join(root, 'backups'),
    bridge = join(root, 'bridge'),
    target = join(root, 'restored')
  for (const path of [config, data, backups, bridge, target]) mkdirSync(path)
  const sessions: ProductionSession[] = []
  try {
    const initial = await openProductionSession({
      configurationDirectory: config,
      choose: async () => ({ action: 'create', directory: data }),
      prepareExisting: async (_path, directory, signal, lease, authorizeReplacement) =>
        prepareProductionData({
          dataDirectory: directory,
          backupParentDirectory: backups,
          signal,
          lease,
          authorizeReplacement,
          assertQuiescent() {}
        }),
      onOwnershipLost() {}
    })
    if (!initial) throw Error('INITIAL_FIXTURE')
    sessions.push(initial)
    const backup = join(backups, 'complete')
    mkdirSync(backup)
    const receipt = await initial.backup(backup, () => {})
    const oldBackup = readFileSync(join(backup, 'payload', 'mashiro.sqlite'))
    const deletedId = randomUUID()
    const original = new SqliteStore(initial.databasePath)
    try {
      original.database.prepare("INSERT INTO item_tombstones VALUES('proposal',?)").run(deletedId)
    } finally {
      original.close()
    }
    await initial.release()
    // Both exact paths are children of this freshly created synthetic root; retain the original bytes.
    renameSync(data, join(root, 'original-unavailable-at-old-path'))
    const shown: string[] = []
    const current = await openProductionApplicationData({
      paths: {
        configurationDirectory: config,
        defaultDataDirectory: join(root, 'default'),
        backupParentDirectory: backups
      },
      dialogs: {
        async showMessageBox(options) {
          shown.push(options.title ?? '')
          expect(options.title).toBe('恢复 Mashiro 数据位置')
          const index = options.buttons!.indexOf('选择新数据位置')
          expect(index).toBeGreaterThanOrEqual(0)
          return { response: index }
        },
        async showOpenDialog() {
          return { canceled: false, filePaths: [bridge] }
        }
      },
      onOwnershipLost() {},
      assertQuiescent() {}
    })
    if (!current) throw Error('BRIDGE_FIXTURE')
    sessions.push(current)
    expect(shown).toEqual(['恢复 Mashiro 数据位置'])
    expect(current.dataSetId).not.toBe(initial.dataSetId)
    expect(current.dataPath).toBe(bridge)
    await current.restore(backup, target, receipt, () => {})
    await current.select(target, () => {})
    const restored = new SqliteStore(join(target, 'mashiro.sqlite'))
    try {
      expect(
        restored.database.prepare('SELECT id FROM item_tombstones WHERE id=?').get(deletedId)?.id
      ).toBe(deletedId)
      expect(restored.database.prepare('PRAGMA integrity_check').get()!.integrity_check).toBe('ok')
      expect(
        restored.database.prepare('SELECT restored_paused FROM retention_policy').get()!
          .restored_paused
      ).toBe(1)
    } finally {
      restored.close()
    }
    expect(readFileSync(join(backup, 'payload', 'mashiro.sqlite'))).toEqual(oldBackup)
    expect(JSON.parse(readFileSync(join(target, '.mashiro-dataset.json'), 'utf8')).dataSetId).toBe(
      initial.dataSetId
    )
  } finally {
    for (const session of sessions.reverse()) await session.release()
    rmSync(root, { recursive: true, force: true })
  }
})
