import type { DatabaseSync } from 'node:sqlite'

const ddl = `CREATE TABLE memory_round_evidence(
  assistant_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  object_id TEXT NOT NULL,
  object_version INTEGER NOT NULL CHECK(object_version>0),
  owner_assistant_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('PREPARED','DISPATCH_STARTED','RESPONSE_OBSERVED')),
  created_at TEXT NOT NULL,
  dispatched_at TEXT,
  UNIQUE(assistant_id,request_id,object_id,object_version))`
const index =
  'CREATE INDEX memory_round_evidence_request ON memory_round_evidence(assistant_id,request_id)'
const normalized = (sql: string): string => sql.replace(/[\s";]/g, '').toLowerCase()
export function verifyMemoryRound(database: DatabaseSync): void {
  for (const [type, name, expected] of [
    ['table', 'memory_round_evidence', ddl],
    ['index', 'memory_round_evidence_request', index]
  ]) {
    const row = database
      .prepare('SELECT sql FROM sqlite_master WHERE type=? AND name=?')
      .get(type!, name!)
    if (!row || normalized(String(row.sql)) !== normalized(expected!))
      throw Error('MEMORY_ROUND_SCHEMA_INVALID')
  }
}
export function migrateMemoryRound(database: DatabaseSync): void {
  const version = Number(database.prepare('PRAGMA user_version').get()!.user_version)
  if (version === 17) {
    database.exec('BEGIN IMMEDIATE')
    try {
      database.exec(ddl)
      database.exec(index)
      verifyMemoryRound(database)
      database.exec('PRAGMA user_version=18; COMMIT')
    } catch (error) {
      database.exec('ROLLBACK')
      throw error
    }
  } else if (version < 18) throw Error('MEMORY_ROUND_MIGRATION_VERSION')
  verifyMemoryRound(database)
}
