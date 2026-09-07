import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { SqliteStore } from '../../src/main/data/sqlite.js'
import { migrateRetentionPolicy } from '../../src/main/retention/retention-policy-schema.js'

const databases: DatabaseSync[] = []
const roots: string[] = []

afterEach(() => {
  for (const database of databases.splice(0)) database.close()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function schema18(): DatabaseSync {
  const database = new DatabaseSync(':memory:')
  databases.push(database)
  database.exec(`
    CREATE TABLE memory_objects(id TEXT PRIMARY KEY,version INTEGER NOT NULL,record_json TEXT NOT NULL);
    CREATE TABLE retention_state(singleton INTEGER PRIMARY KEY,generation INTEGER NOT NULL);
    INSERT INTO retention_state VALUES(1,0);
    PRAGMA user_version=18;
  `)
  return database
}

it('adds the default policy and gives legacy staging objects one shared activation baseline', () => {
  const database = schema18()
  database
    .prepare('INSERT INTO memory_objects VALUES(?,?,?)')
    .run('00000000-0000-4000-8000-000000000001', 4, JSON.stringify({ retention: 'staging' }))
  database
    .prepare('INSERT INTO memory_objects VALUES(?,?,?)')
    .run('00000000-0000-4000-8000-000000000002', 2, JSON.stringify({ retention: 'persistent' }))

  migrateRetentionPolicy(database)

  expect(database.prepare('PRAGMA user_version').get()).toEqual({ user_version: 19 })
  const policy = database.prepare('SELECT * FROM retention_policy').get()!
  expect(policy).toMatchObject({
    revision: 1,
    capacity_enabled: 1,
    capacity_bytes: 100 * 1024 * 1024,
    staging_enabled: 1,
    staging_days: 90,
    restored_paused: 0
  })
  expect(
    database
      .prepare(
        'SELECT object_id,measurement_state,staging_entered_at,staging_generation FROM retention_policy_objects ORDER BY object_id'
      )
      .all()
  ).toEqual([
    {
      object_id: '00000000-0000-4000-8000-000000000001',
      measurement_state: 'UNKNOWN',
      staging_entered_at: policy.activated_at,
      staging_generation: 1
    },
    {
      object_id: '00000000-0000-4000-8000-000000000002',
      measurement_state: 'UNKNOWN',
      staging_entered_at: null,
      staging_generation: 0
    }
  ])
})

it('upgrades a complete persisted schema18 database without disturbing earlier domain tables', () => {
  const root = mkdtempSync(join(tmpdir(), 'mashiro-retention-policy-schema-'))
  roots.push(root)
  const databasePath = join(root, 'state.sqlite')
  new SqliteStore(databasePath).close()
  const oldDatabase = new DatabaseSync(databasePath)
  oldDatabase.exec(`
    DROP TABLE retention_policy_receipts;
    DROP TABLE retention_policy_runs;
    DROP TABLE retention_policy_commands;
    DROP TABLE retention_policy_previews;
    DROP TABLE retention_policy_objects;
    DROP TABLE retention_policy;
    PRAGMA user_version=18;
  `)
  oldDatabase.close()

  const migrated = new SqliteStore(databasePath)
  expect(migrated.database.prepare('PRAGMA user_version').get()).toEqual({ user_version: 19 })
  expect(
    migrated.database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('assistants','memory_objects','retention_policy') ORDER BY name"
      )
      .all()
  ).toEqual([{ name: 'assistants' }, { name: 'memory_objects' }, { name: 'retention_policy' }])
  expect(migrated.database.prepare('SELECT * FROM retention_policy').get()).toMatchObject({
    revision: 1,
    capacity_enabled: 1,
    capacity_bytes: 100 * 1024 * 1024,
    staging_enabled: 1,
    staging_days: 90
  })
  migrated.close()
})

it('rolls back every new schema object and keeps version 18 when a later name collides', () => {
  const database = schema18()
  database.exec('CREATE TABLE retention_policy_commands(existing TEXT)')

  expect(() => migrateRetentionPolicy(database)).toThrow()

  expect(database.prepare('PRAGMA user_version').get()).toEqual({ user_version: 18 })
  expect(
    database
      .prepare("SELECT name FROM sqlite_master WHERE name LIKE 'retention_policy%' ORDER BY name")
      .all()
  ).toEqual([{ name: 'retention_policy_commands' }])
})
