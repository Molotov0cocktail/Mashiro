import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { expect, it, vi } from 'vitest'
import { SqliteStore } from '../../src/main/data/sqlite.js'
import { StewardService } from '../../src/main/background/steward-service.js'
import { removeStewardFixture } from './retention-legacy-fixture.js'
import { stewardFixture } from './steward-fixture.js'

it('rolls a schema12 collision back to a genuine v11 pending layout and preserves old rows', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mashiro-steward-migration-')),
    path = join(dir, 'state.sqlite')
  try {
    const store = new SqliteStore(path)
    removeStewardFixture(store.database)
    store.database.exec(
      "PRAGMA user_version=11; INSERT INTO memory_pending VALUES('old',7,'pending'); CREATE TABLE steward_slots(sentinel TEXT); INSERT INTO steward_slots VALUES('preserve')"
    )
    store.close()
    expect(() => new SqliteStore(path)).toThrow()
    const raw = new DatabaseSync(path)
    expect(raw.prepare('PRAGMA user_version').get()!.user_version).toBe(11)
    expect(
      raw
        .prepare('PRAGMA table_info(memory_pending)')
        .all()
        .map((r) => r.name)
    ).toEqual(['object_id', 'version', 'state'])
    expect(raw.prepare('SELECT * FROM memory_pending').all()).toEqual([
      { object_id: 'old', version: 7, state: 'pending' }
    ])
    expect(raw.prepare('SELECT * FROM steward_slots').all()).toEqual([{ sentinel: 'preserve' }])
    raw.exec('DROP TABLE steward_slots')
    raw.close()
    const migrated = new SqliteStore(path)
    expect(
      migrated.database.prepare('SELECT object_id,version,state FROM memory_pending').all()
    ).toEqual([{ object_id: 'old', version: 7, state: 'pending' }])
    migrated.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
it('resumes a saved local candidate after restart with no credential and no extra send', async () => {
  let fail = true
  const f = stewardFixture({
    fault: (phase) => {
      if (phase === 'candidate-saved' && fail) {
        fail = false
        throw Error('crash after persisted response')
      }
    }
  })
  f.remember()
  f.configure()
  await vi.waitFor(() => expect(f.snapshot().jobs[0]?.state).toBe('FAILED_CONFIRMED'))
  const job = f.snapshot().jobs[0]!,
    originalResolve = f.provider.resolve
  f.provider.resolve = (config, requireCredential = true) => {
    if (requireCredential) throw Error('no key')
    return originalResolve(config)
  }
  f.service.close()
  f.store.database
    .prepare(
      "UPDATE steward_jobs SET record_json=json_set(record_json,'$.state','RUNNING') WHERE id=?"
    )
    .run(job.id)
  const reopened = new StewardService(
    f.store,
    f.memory,
    f.provider,
    () => new Date('2030-01-01T12:00:00Z')
  )
  try {
    await vi.waitFor(() =>
      expect(reopened.query(f.base)).toMatchObject({
        ok: true,
        data: { jobs: [{ state: 'COMPLETED' }] }
      })
    )
    expect(f.send).toHaveBeenCalledTimes(1)
  } finally {
    reopened.close()
  }
})
it('file-ready failure has zero accepted writes and retries the frozen plan under the same slot identity', async () => {
  let fail = false
  const f = stewardFixture({
    memoryFault: (phase) => {
      if (phase === 'file-ready' && fail) {
        fail = false
        throw Error('file failure')
      }
    }
  })
  f.remember()
  fail = true
  f.configure()
  await vi.waitFor(() => expect(f.snapshot().jobs[0]?.state).toBe('FAILED_CONFIRMED'))
  const job = f.snapshot().jobs[0]!,
    commandId = job.slots[0]!.commandId
  expect(f.store.database.prepare('SELECT count(*) AS n FROM memory_objects').get()!.n).toBe(1)
  expect(
    f.service.control({
      ...f.base,
      jobId: job.id,
      expectedVersion: job.version,
      commandId: randomUUID(),
      action: 'retry'
    }).ok
  ).toBe(true)
  await vi.waitFor(() => expect(f.snapshot().jobs[0]?.state).toBe('COMPLETED'))
  expect(f.snapshot().jobs[0]!.slots[0]!.commandId).toBe(commandId)
  expect(f.send).toHaveBeenCalledTimes(1)
})
it('SQL-committed but lost memory return preserves the same successful slot receipt', async () => {
  let fail = false
  const f = stewardFixture({
    memoryFault: (phase) => {
      if (phase === 'after-commit' && fail) {
        fail = false
        throw Error('lost return')
      }
    }
  })
  f.remember()
  fail = true
  f.configure()
  await vi.waitFor(() => expect(f.snapshot().jobs[0]?.state).toBe('COMPLETED'))
  expect(f.snapshot().jobs[0]!.slots).toHaveLength(1)
  expect(f.store.database.prepare('SELECT count(*) AS n FROM memory_objects').get()!.n).toBe(2)
  expect(f.send).toHaveBeenCalledTimes(1)
})
