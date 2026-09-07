import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, existsSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, expect, it, vi } from 'vitest'
import {
  openProductionSession,
  type ProductionSession
} from '../../src/main/data/production-session.js'
import { prepareProductionMaintenance } from '../../src/main/data/production-maintenance.js'
import { ProductionLocationStore } from '../../src/main/data/production-location.js'
import { verifyProductionBackup } from '../../src/main/data/production-backup.js'
import { SqliteStore } from '../../src/main/data/sqlite.js'
import { DatabaseSync } from 'node:sqlite'
import { schemaVersion } from '../../src/main/data/schema.js'
import { openProductionApplicationData } from '../../src/main/data/production-bootstrap.js'

const roots: string[] = [],
  sessions: ProductionSession[] = []
afterEach(async () => {
  for (const session of sessions.splice(0)) await session.release()
  for (const root of roots.splice(0)) {
    const actual = realpathSync.native(root)
    if (
      dirname(actual) !== realpathSync.native(tmpdir()) ||
      !basename(actual).startsWith('mashiro-maintenance-')
    )
      throw Error('TEST_SCOPE')
    rmSync(actual, { recursive: true, force: true })
  }
})
async function fixture() {
  const root = mkdtempSync(join(realpathSync.native(tmpdir()), 'mashiro-maintenance-'))
  roots.push(root)
  const config = join(root, 'config'),
    source = join(root, '源 data'),
    target = join(root, '新 data'),
    backups = join(root, 'backups')
  for (const path of [config, source, target, backups]) mkdirSync(path)
  const prepareExisting = async (path: string) => {
    const store = new SqliteStore(path)
    store.close()
  }
  const session = await openProductionSession({
    configurationDirectory: config,
    choose: async () => ({ action: 'create', directory: source }),
    prepareExisting,
    onOwnershipLost: vi.fn()
  })
  if (!session) throw Error('SESSION')
  sessions.push(session)
  const dialogs = {
    showOpenDialog: vi.fn(async () => ({ canceled: false, filePaths: [target] })),
    showMessageBox: vi.fn(async () => ({ response: 1 }))
  }
  return { config, source, target, backups, session, dialogs, prepareExisting }
}
it('relocates through verified snapshot and atomic selection while preserving original data and reopening the same identity', async () => {
  const f = await fixture()
  const bytes = readFileSync(join(f.source, 'mashiro.sqlite'))
  const plan = await prepareProductionMaintenance({
    kind: 'relocate',
    dialogs: f.dialogs,
    backupParentDirectory: f.backups
  })
  expect(await plan!.run(f.session, () => {})).toBe(true)
  expect(new ProductionLocationStore(f.config).inspect()).toMatchObject({
    state: 'READY',
    locator: { dataPath: f.target, dataSetId: f.session.dataSetId }
  })
  expect(readFileSync(join(f.source, 'mashiro.sqlite'))).toEqual(bytes)
  await f.session.release()
  const choose = vi.fn(async () => ({ action: 'cancel' as const }))
  const reopened = await openProductionSession({
    configurationDirectory: f.config,
    choose,
    prepareExisting: f.prepareExisting,
    onOwnershipLost: vi.fn()
  })
  if (!reopened) throw Error('SESSION')
  sessions.push(reopened)
  expect(reopened.dataPath).toBe(f.target)
  expect(choose).not.toHaveBeenCalled()
})
it('a cancelled plan or active writer cannot create a backup or change the locator', async () => {
  const f = await fixture()
  const before = readFileSync(join(f.config, 'location.json'))
  f.dialogs.showMessageBox.mockResolvedValueOnce({ response: 0 })
  expect(
    await prepareProductionMaintenance({
      kind: 'backup',
      dialogs: f.dialogs,
      backupParentDirectory: f.backups
    })
  ).toBeNull()
  const plan = await prepareProductionMaintenance({
    kind: 'backup',
    dialogs: f.dialogs,
    backupParentDirectory: f.backups
  })
  await expect(
    plan!.run(f.session, () => {
      throw Error('WRITERS_ACTIVE')
    })
  ).rejects.toThrow('WRITERS_ACTIVE')
  expect(readFileSync(join(f.config, 'location.json'))).toEqual(before)
  expect(existsSync(join(f.target, 'backup.json'))).toBe(false)
})
it('can restore a compatible snapshot when the current schema is unsupported, preserving the original database', async () => {
  const f = await fixture()
  const snapshot = join(f.backups, 'before-upgrade')
  mkdirSync(snapshot)
  await f.session.backup(snapshot, () => {})
  await f.session.release()
  const database = new DatabaseSync(join(f.source, 'mashiro.sqlite'))
  database.exec('PRAGMA user_version=' + (schemaVersion + 1))
  database.close()
  const futureBytes = readFileSync(join(f.source, 'mashiro.sqlite'))
  f.dialogs.showMessageBox
    .mockResolvedValueOnce({ response: 2 })
    .mockResolvedValueOnce({ response: 1 })
  f.dialogs.showOpenDialog
    .mockResolvedValueOnce({ canceled: false, filePaths: [snapshot] })
    .mockResolvedValueOnce({ canceled: false, filePaths: [f.target] })
  const recovered = await openProductionApplicationData({
    paths: {
      configurationDirectory: f.config,
      defaultDataDirectory: f.source,
      backupParentDirectory: f.backups
    },
    dialogs: f.dialogs,
    onOwnershipLost: vi.fn(),
    assertQuiescent() {}
  })
  if (!recovered) throw Error('SESSION')
  sessions.push(recovered)
  expect(recovered.dataPath).toBe(f.target)
  expect(recovered.dataSetId).toBe(f.session.dataSetId)
  expect(readFileSync(join(f.source, 'mashiro.sqlite'))).toEqual(futureBytes)
  expect(new ProductionLocationStore(f.config).inspect()).toMatchObject({
    state: 'READY',
    locator: { dataPath: f.target }
  })
})
it('native backup produces a complete verified envelope and requests exit without selecting it', async () => {
  const f = await fixture()
  const before = readFileSync(join(f.config, 'location.json'))
  const plan = await prepareProductionMaintenance({
    kind: 'backup',
    dialogs: f.dialogs,
    backupParentDirectory: f.backups
  })
  expect(await plan!.run(f.session, () => {})).toBe(false)
  expect(verifyProductionBackup(f.target).dataSetId).toBe(f.session.dataSetId)
  expect(readFileSync(join(f.config, 'location.json'))).toEqual(before)
  await f.session.release()
  await expect(f.session.backup(f.backups, () => {})).rejects.toThrow('PRODUCTION_SESSION_RELEASED')
})
