import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'

const stateDdl =
  'CREATE TABLE production_governance_state(singleton INTEGER PRIMARY KEY CHECK(singleton=1),instance_id TEXT NOT NULL CHECK(length(instance_id)=36))'
const commitsDdl =
  'CREATE TABLE production_governance_commits(token TEXT PRIMARY KEY NOT NULL CHECK(length(token)=36))'
const normalize = (sql: string) => sql.replace(/[\s";]/g, '').toLowerCase()

export function verifyProductionGovernanceSchema(database: DatabaseSync): void {
  for (const [name, ddl] of [
    ['production_governance_state', stateDdl],
    ['production_governance_commits', commitsDdl]
  ]) {
    const row = database
      .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?")
      .get(name!)
    if (!row || normalize(String(row.sql)) !== normalize(ddl!))
      throw Error('GOVERNANCE_SCHEMA_INVALID')
  }
  const rows = database
    .prepare('SELECT singleton,instance_id FROM production_governance_state')
    .all()
  if (
    rows.length !== 1 ||
    rows[0]!.singleton !== 1 ||
    !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(String(rows[0]!.instance_id))
  )
    throw Error('GOVERNANCE_DATABASE_INSTANCE_INVALID')
}

/** Separate from schema16; the orchestrator wires this migration only after the 015 freeze commits. */
export function migrateProductionGovernance(database: DatabaseSync): void {
  const version = Number(database.prepare('PRAGMA user_version').get()!.user_version)
  if (version === 16) {
    database.exec('BEGIN IMMEDIATE')
    try {
      database.exec(stateDdl)
      database.exec(commitsDdl)
      database.prepare('INSERT INTO production_governance_state VALUES(1,?)').run(randomUUID())
      verifyProductionGovernanceSchema(database)
      database.exec('PRAGMA user_version=17; COMMIT')
    } catch (error) {
      database.exec('ROLLBACK')
      throw error
    }
  }
  if (Number(database.prepare('PRAGMA user_version').get()!.user_version) >= 17)
    verifyProductionGovernanceSchema(database)
}

/** Only an isolated restoration copy, with snapshot marker still held, receives a fresh instance. */
export function rotateRestoredGovernanceInstance(database: DatabaseSync): string {
  verifyProductionGovernanceSchema(database)
  const id = randomUUID()
  database.exec('BEGIN IMMEDIATE')
  try {
    database
      .prepare('UPDATE production_governance_state SET instance_id=? WHERE singleton=1')
      .run(id)
    database.exec('DELETE FROM production_governance_commits; COMMIT')
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }
  return id
}
