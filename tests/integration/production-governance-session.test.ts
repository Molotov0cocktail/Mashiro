import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
  unlinkSync
} from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { afterEach, expect, it, vi } from 'vitest'
import {
  openProductionSession,
  type ProductionSession
} from '../../src/main/data/production-session.js'
import { SqliteStore } from '../../src/main/data/sqlite.js'

const roots: string[] = [],
  sessions: ProductionSession[] = [],
  stores: SqliteStore[] = []
afterEach(async () => {
  for (const store of stores.splice(0)) store.close()
  for (const session of sessions.splice(0)) await session.release()
  for (const root of roots.splice(0)) {
    const actual = realpathSync.native(root)
    if (
      dirname(actual) !== realpathSync.native(tmpdir()) ||
      !basename(actual).startsWith('mashiro-governance-session-')
    )
      throw Error('UNOWNED_ROOT')
    rmSync(actual, { recursive: true, force: true })
  }
})
async function fixture() {
  const root = mkdtempSync(join(realpathSync.native(tmpdir()), 'mashiro-governance-session-'))
  roots.push(root)
  const config = join(root, '配置'),
    data = join(root, '数据')
  mkdirSync(config)
  mkdirSync(data)
  const options = {
    configurationDirectory: config,
    choose: async () => ({ action: 'create' as const, directory: data }),
    prepareExisting: async () => {},
    onOwnershipLost: vi.fn()
  }
  const open = async () => {
    const session = await openProductionSession(options)
    if (!session) throw Error('NO_SESSION')
    sessions.push(session)
    return session
  }
  const session = await open()
  return { config, data, session, open }
}
it('every actual service store records governance and an open writer prevents lease release', async () => {
  const f = await fixture()
  const a = new SqliteStore(f.session.databasePath),
    b = new SqliteStore(f.session.databasePath)
  stores.push(a, b)
  const id = randomUUID()
  a.database.prepare('INSERT INTO item_tombstones VALUES(?,?)').run('proposal', id)
  const journal = join(f.config, 'governance', 'governance-' + f.session.dataSetId + '.jsonl')
  expect(readFileSync(journal, 'utf8')).toContain(id)
  await expect(f.session.release()).rejects.toThrow('GOVERNANCE_WRITERS_STILL_OPEN')
  a.close()
  b.close()
  await f.session.release()
  const reopened = await f.open()
  expect(reopened.dataSetId).toBe(f.session.dataSetId)
})
it('missing READY ledger is never silently reenrolled as a fresh dataset', async () => {
  const f = await fixture()
  await f.session.release()
  unlinkSync(join(f.config, 'governance', 'governance-' + f.session.dataSetId + '.jsonl'))
  await expect(f.open()).rejects.toThrow()
  expect(readFileSync(join(f.config, 'governance-registry.json'), 'utf8')).toContain('READY')
})
it('a crash after durable PREPARING and before journal creation resumes only the same healthy untouched instance', async () => {
  const f = await fixture()
  await f.session.release()
  const registryPath = join(f.config, 'governance-registry.json')
  const registry = JSON.parse(readFileSync(registryPath, 'utf8'))
  registry.entries[0].state = 'PREPARING'
  // Keep the journal ID and hash-bound seed written by current PREPARING initialization.
  writeFileSync(registryPath, JSON.stringify(registry))
  unlinkSync(join(f.config, 'governance', 'governance-' + f.session.dataSetId + '.jsonl'))
  unlinkSync(join(f.data, '.mashiro-governance.json'))
  const restored = await f.open()
  expect(restored.dataSetId).toBe(f.session.dataSetId)
  expect(JSON.parse(readFileSync(registryPath, 'utf8')).entries[0].state).toBe('READY')
})
