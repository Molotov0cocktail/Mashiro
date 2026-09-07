import type { DatabaseSync } from 'node:sqlite'

const policyDdl = `CREATE TABLE retention_policy(
  singleton INTEGER PRIMARY KEY CHECK(singleton=1),
  revision INTEGER NOT NULL CHECK(revision>=1),
  capacity_enabled INTEGER NOT NULL CHECK(capacity_enabled IN (0,1)),
  capacity_bytes INTEGER NOT NULL CHECK(capacity_bytes>=1),
  staging_enabled INTEGER NOT NULL CHECK(staging_enabled IN (0,1)),
  staging_days INTEGER NOT NULL CHECK(staging_days BETWEEN 1 AND 36500),
  activated_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  restored_paused INTEGER NOT NULL DEFAULT 0 CHECK(restored_paused IN (0,1)),
  scheduler_generation INTEGER NOT NULL DEFAULT 1 CHECK(scheduler_generation>=1))`
const objectsDdl = `CREATE TABLE retention_policy_objects(
  object_id TEXT PRIMARY KEY NOT NULL,
  object_version INTEGER NOT NULL CHECK(object_version>0),
  zone TEXT NOT NULL CHECK(zone IN ('persistent','staging','trash')),
  accepted_bytes INTEGER CHECK(accepted_bytes>=0),
  measurement_state TEXT NOT NULL CHECK(measurement_state IN ('KNOWN','UNKNOWN','EXCLUDED')),
  body_hash TEXT,
  file_name TEXT,
  file_identity TEXT,
  governance_generation INTEGER NOT NULL CHECK(governance_generation>=0),
  staging_entered_at TEXT,
  staging_generation INTEGER NOT NULL CHECK(staging_generation>=0))`
const previewsDdl = `CREATE TABLE retention_policy_previews(
  id TEXT PRIMARY KEY NOT NULL,
  assistant_id TEXT NOT NULL,
  expected_revision INTEGER NOT NULL,
  intent_hash TEXT NOT NULL,
  impact_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('pending','closed')))`
const commandsDdl = `CREATE TABLE retention_policy_commands(
  id TEXT PRIMARY KEY NOT NULL,
  assistant_id TEXT NOT NULL,
  intent_hash TEXT NOT NULL,
  result_json TEXT NOT NULL)`
const runsDdl = `CREATE TABLE retention_policy_runs(
  id TEXT PRIMARY KEY NOT NULL,
  ordinal INTEGER NOT NULL UNIQUE CHECK(ordinal>0),
  policy_revision INTEGER NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('RUNNING','COMPLETED','FAILED')),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  moved INTEGER NOT NULL DEFAULT 0 CHECK(moved>=0),
  skipped INTEGER NOT NULL DEFAULT 0 CHECK(skipped>=0),
  failed INTEGER NOT NULL DEFAULT 0 CHECK(failed>=0),
  error TEXT)`
const receiptsDdl = `CREATE TABLE retention_policy_receipts(
  object_id TEXT NOT NULL,
  staging_generation INTEGER NOT NULL,
  policy_revision INTEGER NOT NULL,
  object_version INTEGER NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('MOVED','SKIPPED','FAILED')),
  run_id TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  detail TEXT,
  PRIMARY KEY(object_id,staging_generation,policy_revision))`
const dueIndex =
  'CREATE INDEX retention_policy_objects_due ON retention_policy_objects(zone,staging_entered_at,object_id)'
const runIndex = 'CREATE INDEX retention_policy_runs_recent ON retention_policy_runs(ordinal DESC)'
const normalized = (sql: string): string => sql.replace(/[\s";]/g, '').toLowerCase()

function assertObject(database: DatabaseSync, type: string, name: string, sql: string): void {
  const row = database
    .prepare('SELECT sql FROM sqlite_master WHERE type=? AND name=?')
    .get(type, name)
  if (!row || normalized(String(row.sql)) !== normalized(sql))
    throw Error('RETENTION_POLICY_SCHEMA_INVALID')
}

export function verifyRetentionPolicy(database: DatabaseSync): void {
  assertObject(database, 'table', 'retention_policy', policyDdl)
  assertObject(database, 'table', 'retention_policy_objects', objectsDdl)
  assertObject(database, 'table', 'retention_policy_previews', previewsDdl)
  assertObject(database, 'table', 'retention_policy_commands', commandsDdl)
  assertObject(database, 'table', 'retention_policy_runs', runsDdl)
  assertObject(database, 'table', 'retention_policy_receipts', receiptsDdl)
  assertObject(database, 'index', 'retention_policy_objects_due', dueIndex)
  assertObject(database, 'index', 'retention_policy_runs_recent', runIndex)
  const rows = database.prepare('SELECT * FROM retention_policy').all()
  if (rows.length !== 1 || rows[0]!.singleton !== 1) throw Error('RETENTION_POLICY_STATE_INVALID')
}

export function migrateRetentionPolicy(database: DatabaseSync): void {
  const version = Number(database.prepare('PRAGMA user_version').get()!.user_version)
  if (version === 18) {
    database.exec('BEGIN IMMEDIATE')
    try {
      database.exec(policyDdl)
      database.exec(objectsDdl)
      database.exec(previewsDdl)
      database.exec(commandsDdl)
      database.exec(runsDdl)
      database.exec(receiptsDdl)
      database.exec(dueIndex)
      database.exec(runIndex)
      const now = new Date().toISOString()
      database
        .prepare('INSERT INTO retention_policy VALUES(1,1,1,104857600,1,90,?,?,0,1)')
        .run(now, now)
      database
        .prepare(
          `INSERT INTO retention_policy_objects(object_id,object_version,zone,accepted_bytes,measurement_state,body_hash,file_name,file_identity,governance_generation,staging_entered_at,staging_generation)
           SELECT id,version,json_extract(record_json,'$.retention'),NULL,'UNKNOWN',NULL,NULL,NULL,
             (SELECT generation FROM retention_state WHERE singleton=1),
             CASE json_extract(record_json,'$.retention') WHEN 'staging' THEN ? ELSE NULL END,
             CASE json_extract(record_json,'$.retention') WHEN 'staging' THEN 1 ELSE 0 END
           FROM memory_objects`
        )
        .run(now)
      verifyRetentionPolicy(database)
      database.exec('PRAGMA user_version=19; COMMIT')
    } catch (error) {
      database.exec('ROLLBACK')
      throw error
    }
  } else if (version !== 19) throw Error('RETENTION_POLICY_MIGRATION_VERSION')
  verifyRetentionPolicy(database)
}
