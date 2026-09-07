import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, expect, it, vi } from 'vitest'
import {
  openProductionSession,
  type ProductionSession
} from '../../src/main/data/production-session.js'
import { prepareProductionData } from '../../src/main/data/production-prepare.js'
import { SqliteStore } from '../../src/main/data/sqlite.js'
import { ProductionLocationStore } from '../../src/main/data/production-location.js'
import { acquireProductionLease } from '../../src/main/data/production-lease.js'

const roots: string[] = [],
  sessions: ProductionSession[] = []
afterEach(async () => {
  for (const session of sessions.splice(0)) await session.release()
  for (const root of roots.splice(0)) {
    const actual = realpathSync.native(root)
    if (
      dirname(actual) !== realpathSync.native(tmpdir()) ||
      !basename(actual).startsWith('mashiro-entry-review-')
    )
      throw Error('SCOPE')
    rmSync(actual, { recursive: true, force: true })
  }
})
async function fixture() {
  const root = mkdtempSync(join(realpathSync.native(tmpdir()), 'mashiro-entry-review-'))
  roots.push(root)
  const config = join(root, 'config'),
    data = join(root, 'data'),
    otherConfig = join(root, 'other-config'),
    target = join(root, 'target'),
    backups = join(root, 'backups')
  for (const path of [config, data, otherConfig, target, backups]) mkdirSync(path)
  const prepare: Parameters<typeof openProductionSession>[0]['prepareExisting'] = async (
    _database,
    path,
    signal,
    lease
  ) => {
    await prepareProductionData({
      dataDirectory: path,
      backupParentDirectory: backups,
      lease,
      signal,
      assertQuiescent() {}
    })
  }
  const first = await openProductionSession({
    configurationDirectory: config,
    choose: async () => ({ action: 'create', directory: data }),
    prepareExisting: prepare,
    onOwnershipLost: vi.fn()
  })
  const second = await openProductionSession({
    configurationDirectory: otherConfig,
    choose: async () => ({ action: 'create', directory: target }),
    prepareExisting: prepare,
    onOwnershipLost: vi.fn()
  })
  if (!first || !second) throw Error('SETUP')
  sessions.push(first, second)
  await second.release()
  return { config, data, target, first, prepare, backups }
}

it('rejects a current-version database with a missing mandatory application guard before changing the production locator', async () => {
  const f = await fixture(),
    locator = readFileSync(join(f.config, 'location.json'))
  const db = new DatabaseSync(join(f.target, 'mashiro.sqlite'))
  db.exec('DROP TRIGGER assistant_no_delete')
  expect(db.prepare('PRAGMA integrity_check').get()!.integrity_check).toBe('ok')
  expect(db.prepare('PRAGMA foreign_key_check').all()).toHaveLength(0)
  db.close()
  expect(() => new SqliteStore(join(f.target, 'mashiro.sqlite'))).toThrow()
  const outcome = await f.first
    .select(f.target, () => {})
    .then(
      () => 'selected',
      () => 'rejected'
    )
  expect({
    outcome,
    locatorUnchanged: readFileSync(join(f.config, 'location.json')).equals(locator)
  }).toEqual({ outcome: 'rejected', locatorUnchanged: true })
})

it('a writer becoming active during selection preparation leaves the locator unchanged and releases the target lease', async () => {
  const f = await fixture()
  await f.first.release()
  let active = false
  const session = await openProductionSession({
    configurationDirectory: f.config,
    choose: async () => ({ action: 'cancel' }),
    prepareExisting: async (database, path, signal, lease) => {
      await f.prepare(database, path, signal, lease)
      if (path === f.target) active = true
    },
    onOwnershipLost: vi.fn()
  })
  if (!session) throw Error('SESSION')
  sessions.push(session)
  const before = new ProductionLocationStore(f.config).inspect().fingerprint
  await expect(
    session.select(f.target, () => {
      if (active) throw Error('WRITERS_ACTIVE')
    })
  ).rejects.toThrow('WRITERS_ACTIVE')
  expect(new ProductionLocationStore(f.config).inspect().fingerprint).toBe(before)
  const target = await acquireProductionLease(f.target, vi.fn())
  await target.release()
})
