import { randomUUID, createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, expect, it } from 'vitest'
import { createProductionBackup } from '../../src/main/data/production-backup.js'
import { initializeProductionDataSet } from '../../src/main/data/production-initialize.js'
import { SqliteStore } from '../../src/main/data/sqlite.js'
import type { ProductionLease } from '../../src/main/data/production-lease.js'

it('verifies a completed snapshot read-only and rejects later file or receipt tampering', async () => {
  const f = await fixture()
  const receipt = await createProductionBackup(f.options)
  const { verifyProductionBackup } = await import('../../src/main/data/production-backup.js')
  expect(verifyProductionBackup(f.destination)).toEqual(receipt)
  const receiptPath = join(f.destination, 'backup.json')
  writeFileSync(
    receiptPath,
    JSON.stringify({
      ...receipt,
      files: [...receipt.files, { path: '../outside', bytes: 0, sha256: '0'.repeat(64) }]
    })
  )
  expect(() => verifyProductionBackup(f.destination)).toThrow()
  writeFileSync(receiptPath, JSON.stringify(receipt))
  writeFileSync(join(f.destination, 'payload', '.mashiro-dataset.json'), '{}')
  expect(() => verifyProductionBackup(f.destination)).toThrow('BACKUP_INVENTORY_INVALID')
})

it('refuses a live SQLite write transaction without publishing or altering the source', async () => {
  const f = await fixture()
  const active = new DatabaseSync(join(f.source, 'mashiro.sqlite'))
  active.exec('BEGIN IMMEDIATE')
  try {
    await expect(createProductionBackup(f.options)).rejects.toThrow()
    expect(existsSync(join(f.destination, 'backup.json'))).toBe(false)
    expect(existsSync(join(f.destination, 'payload'))).toBe(false)
  } finally {
    active.exec('ROLLBACK')
    active.close()
  }
})

it('checks the shutdown assertion before any snapshot copy', async () => {
  const f = await fixture()
  await expect(
    createProductionBackup({
      ...f.options,
      assertQuiescent() {
        throw new Error('WRITERS_ACTIVE')
      }
    })
  ).rejects.toThrow('WRITERS_ACTIVE')
  expect(existsSync(join(f.destination, 'payload'))).toBe(false)
})

it('marks snapshots so selecting their payload cannot resurrect an older dataset directly', async () => {
  const f = await fixture()
  await createProductionBackup(f.options)
  const { inspectProductionDataSet } = await import('../../src/main/data/production-location.js')
  expect(() => inspectProductionDataSet(join(f.destination, 'payload'))).toThrow(
    'SNAPSHOT_RESTORE_REQUIRED'
  )
})

const roots: string[] = []
const leases: ProductionLease[] = []
afterEach(async () => {
  for (const lease of leases.splice(0)) await lease.release()
  for (const root of roots.splice(0)) {
    if (
      dirname(realpathSync.native(root)) !== realpathSync.native(tmpdir()) ||
      !basename(root).startsWith('mashiro-backup-test-')
    )
      throw new Error('TEST_CLEANUP_SCOPE')
    rmSync(root, { recursive: true, force: true })
  }
})

async function fixture() {
  const root = mkdtempSync(join(realpathSync.native(tmpdir()), 'mashiro-backup-test-'))
  roots.push(root)
  const source = join(root, '源 数据'),
    destination = join(root, '备份 数据')
  mkdirSync(source)
  mkdirSync(destination)
  const initialized = await initializeProductionDataSet(
    source,
    (path) => {
      const store = new SqliteStore(path)
      store.close()
    },
    () => {}
  )
  leases.push(initialized.lease)
  return {
    source,
    destination,
    initialized,
    options: {
      sourceDirectory: source,
      destinationDirectory: destination,
      sourceLease: initialized.lease,
      signal: new AbortController().signal,
      assertQuiescent() {}
    }
  }
}

it('copies complete SQL governance and protected blob bytes without migrating or binding the snapshot', async () => {
  const f = await fixture()
  const database = new DatabaseSync(join(f.source, 'mashiro.sqlite'))
  database
    .prepare("INSERT INTO memory_suppressions VALUES('round',?,1,'withdrawal',?)")
    .run('synthetic-round', 'synthetic-object')
  database.close()
  mkdirSync(join(f.source, 'credentials'))
  const blob = Buffer.from([0, 1, 2, 255, 42])
  const name = randomUUID() + '.credential'
  writeFileSync(join(f.source, 'credentials', name), blob)
  const before = readFileSync(join(f.source, 'mashiro.sqlite'))
  const receipt = await createProductionBackup(f.options)
  expect(receipt.dataSetId).toBe(f.initialized.manifest.dataSetId)
  expect(receipt.credentialProtection).toBe('windows-original-user-required')
  expect(readFileSync(join(f.destination, 'payload', 'credentials', name))).toEqual(blob)
  expect(readFileSync(join(f.source, 'mashiro.sqlite'))).toEqual(before)
  const copied = new DatabaseSync(join(f.destination, 'payload', 'mashiro.sqlite'), {
    readOnly: true
  })
  try {
    expect(copied.prepare('SELECT source_id FROM memory_suppressions').get()?.source_id).toBe(
      'synthetic-round'
    )
    expect(
      copied.prepare("SELECT name FROM sqlite_master WHERE name='memory_branches'").get()
    ).toBeDefined()
  } finally {
    copied.close()
  }
  expect(existsSync(join(f.destination, 'location.json'))).toBe(false)
  expect(JSON.parse(readFileSync(join(f.destination, 'backup.json'), 'utf8'))).toEqual(receipt)
})

it('rejects a corrupt accepted body without creating a completed snapshot', async () => {
  const f = await fixture(),
    id = randomUUID(),
    file = randomUUID() + '.md'
  mkdirSync(join(f.source, 'memory'))
  writeFileSync(join(f.source, 'memory', file), 'corrupt')
  const database = new DatabaseSync(join(f.source, 'mashiro.sqlite'))
  database
    .prepare('INSERT INTO memory_objects VALUES(?,?,?)')
    .run(id, 1, JSON.stringify({ state: 'active', retention: 'persistent' }))
  database
    .prepare('INSERT INTO memory_versions VALUES(?,?,?,?,?)')
    .run(id, 1, file, createHash('sha256').update('accepted').digest('hex'), '{}')
  database.close()
  await expect(createProductionBackup(f.options)).rejects.toThrow('BACKUP_ACCEPTED_BODY_INVALID')
  expect(existsSync(join(f.destination, 'backup.json'))).toBe(false)
  expect(readFileSync(join(f.source, 'memory', file), 'utf8')).toBe('corrupt')
})

it('preserves permanent deletion markers without recreating old Markdown', async () => {
  const f = await fixture(),
    id = randomUUID()
  const database = new DatabaseSync(join(f.source, 'mashiro.sqlite'))
  database
    .prepare('INSERT INTO memory_objects VALUES(?,?,?)')
    .run(id, 1, JSON.stringify({ state: 'suppressed', retention: 'trash' }))
  database
    .prepare('INSERT INTO memory_versions VALUES(?,?,?,?,?)')
    .run(id, 1, '', createHash('sha256').update('').digest('hex'), '{}')
  database.close()
  const receipt = await createProductionBackup(f.options)
  expect(receipt.files.some((file) => file.path.startsWith('memory/'))).toBe(false)
  expect(existsSync(join(f.destination, 'payload', 'memory'))).toBe(false)
})

it('refuses overlap, nonempty destination, cancellation and a forged ownership token', async () => {
  const f = await fixture()
  await expect(
    createProductionBackup({ ...f.options, destinationDirectory: f.source })
  ).rejects.toThrow('BACKUP_LOCATION_OVERLAP')
  const aborted = AbortSignal.abort()
  await expect(createProductionBackup({ ...f.options, signal: aborted })).rejects.toThrow(
    'BACKUP_CANCELLED'
  )
  await expect(
    createProductionBackup({
      ...f.options,
      sourceLease: { dataPath: f.source, async release() {} }
    })
  ).rejects.toThrow('DATA_SET_NOT_OWNED')
  writeFileSync(join(f.destination, 'keep.txt'), 'keep')
  await expect(createProductionBackup(f.options)).rejects.toThrow('BACKUP_DESTINATION_NOT_EMPTY')
  expect(readFileSync(join(f.destination, 'keep.txt'), 'utf8')).toBe('keep')
})

it('detects domain mutation during a yielded copy and leaves no completed receipt', async () => {
  const f = await fixture()
  mkdirSync(join(f.source, 'memory'))
  const file = join(f.source, 'memory', randomUUID() + '.md.tmp')
  writeFileSync(file, 'before')
  let checks = 0
  await expect(
    createProductionBackup({
      ...f.options,
      assertQuiescent() {
        checks++
        if (checks === 3) writeFileSync(file, 'after')
      }
    })
  ).rejects.toThrow()
  expect(existsSync(join(f.destination, 'backup.json'))).toBe(false)
  expect(readFileSync(file, 'utf8')).toBe('after')
})
