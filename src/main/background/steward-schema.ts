import type { DatabaseSync } from 'node:sqlite'

export const stewardTables = [
  'steward_configs',
  'discovery_configs',
  'steward_jobs',
  'steward_attempts',
  'steward_slots',
  'steward_consumptions',
  'steward_controls',
  'memory_branches',
  'branch_members',
  'memory_conflicts'
] as const
export function migrateSteward(database: DatabaseSync): void {
  if (Number(database.prepare('PRAGMA user_version').get()!.user_version) === 11) {
    if (
      database.prepare('PRAGMA integrity_check').get()!.integrity_check !== 'ok' ||
      database.prepare('PRAGMA foreign_key_check').all().length
    )
      throw Error('Steward migration precondition')
    database.exec('BEGIN IMMEDIATE')
    try {
      database.exec(`
        ALTER TABLE memory_pending ADD COLUMN entry_kind TEXT NOT NULL DEFAULT 'accepted-memory' CHECK(entry_kind IN('accepted-memory','shared-candidate'));
        ALTER TABLE memory_pending ADD COLUMN authority_assistant TEXT NOT NULL DEFAULT '';
        ALTER TABLE memory_pending ADD COLUMN source_digest TEXT NOT NULL DEFAULT '';
        ALTER TABLE memory_pending ADD COLUMN sources_json TEXT NOT NULL DEFAULT '[]';
        ALTER TABLE memory_pending ADD COLUMN candidate_json TEXT;
        ALTER TABLE memory_pending ADD COLUMN created_at TEXT NOT NULL DEFAULT '';
        UPDATE memory_pending SET authority_assistant=COALESCE((SELECT json_extract(record_json,'$.ownerAssistantId') FROM memory_objects WHERE id=object_id),''), source_digest=COALESCE((SELECT body_hash FROM memory_versions WHERE memory_versions.object_id=memory_pending.object_id AND memory_versions.version=memory_pending.version),''), created_at=COALESCE((SELECT json_extract(record_json,'$.updatedAt') FROM memory_objects WHERE id=object_id),'');
        CREATE TABLE steward_configs(singleton INTEGER PRIMARY KEY CHECK(singleton=1),record_json TEXT NOT NULL);
        CREATE TABLE discovery_configs(assistant_id TEXT PRIMARY KEY NOT NULL,record_json TEXT NOT NULL);
        CREATE TABLE steward_jobs(id TEXT PRIMARY KEY NOT NULL,source_key TEXT NOT NULL UNIQUE,source_digest TEXT NOT NULL,inputs_json TEXT,candidate_json TEXT,record_json TEXT NOT NULL);
        CREATE TABLE steward_attempts(id TEXT PRIMARY KEY NOT NULL,job_id TEXT NOT NULL,actor_key TEXT NOT NULL,window_id TEXT NOT NULL,input_characters INTEGER NOT NULL CHECK(input_characters>0),state TEXT NOT NULL CHECK(state IN('SENDING','SETTLED','UNKNOWN')),usage_json TEXT);
        CREATE INDEX steward_budget_window ON steward_attempts(actor_key,window_id);
        CREATE TABLE steward_slots(job_id TEXT NOT NULL,slot_id TEXT NOT NULL,command_id TEXT NOT NULL UNIQUE,arguments_hash TEXT NOT NULL,plan_json TEXT NOT NULL,receipt_json TEXT,PRIMARY KEY(job_id,slot_id));
        CREATE TABLE steward_consumptions(source_key TEXT PRIMARY KEY NOT NULL,job_id TEXT NOT NULL,outcome TEXT NOT NULL);
        CREATE TABLE steward_controls(id TEXT PRIMARY KEY NOT NULL,arguments_json TEXT NOT NULL);
        CREATE TABLE memory_branches(id TEXT PRIMARY KEY NOT NULL,version INTEGER NOT NULL,record_json TEXT NOT NULL);
        CREATE TABLE branch_members(branch_id TEXT NOT NULL,memory_id TEXT NOT NULL,memory_version INTEGER NOT NULL,relation TEXT NOT NULL,source_json TEXT NOT NULL,PRIMARY KEY(branch_id,memory_id));
        CREATE TABLE memory_conflicts(id TEXT PRIMARY KEY NOT NULL,version INTEGER NOT NULL,record_json TEXT NOT NULL);
        PRAGMA user_version=12;
      `)
      database.exec('COMMIT')
    } catch (error) {
      database.exec('ROLLBACK')
      throw error
    }
  }
  if (Number(database.prepare('PRAGMA user_version').get()!.user_version) === 12) {
    if (
      database.prepare('PRAGMA integrity_check').get()!.integrity_check !== 'ok' ||
      database.prepare('PRAGMA foreign_key_check').all().length
    )
      throw Error('Branch guard migration precondition')
    database.exec('BEGIN IMMEDIATE')
    try {
      database.exec(
        "ALTER TABLE memory_branches ADD COLUMN governance_digest TEXT NOT NULL DEFAULT ''; PRAGMA user_version=13;"
      )
      database.exec('COMMIT')
    } catch (error) {
      database.exec('ROLLBACK')
      throw error
    }
  }
  for (const name of stewardTables)
    if (!database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name))
      throw Error('Steward schema incomplete')
  const columns: Record<(typeof stewardTables)[number], string[]> = {
    steward_configs: ['singleton', 'record_json'],
    discovery_configs: ['assistant_id', 'record_json'],
    steward_jobs: [
      'id',
      'source_key',
      'source_digest',
      'inputs_json',
      'candidate_json',
      'record_json'
    ],
    steward_attempts: [
      'id',
      'job_id',
      'actor_key',
      'window_id',
      'input_characters',
      'state',
      'usage_json'
    ],
    steward_slots: [
      'job_id',
      'slot_id',
      'command_id',
      'arguments_hash',
      'plan_json',
      'receipt_json'
    ],
    steward_consumptions: ['source_key', 'job_id', 'outcome'],
    steward_controls: ['id', 'arguments_json'],
    memory_branches: ['id', 'version', 'record_json', 'governance_digest'],
    branch_members: ['branch_id', 'memory_id', 'memory_version', 'relation', 'source_json'],
    memory_conflicts: ['id', 'version', 'record_json']
  }
  for (const table of stewardTables)
    if (
      JSON.stringify(
        database
          .prepare('PRAGMA table_info(' + table + ')')
          .all()
          .map((r) => r.name)
      ) !== JSON.stringify(columns[table])
    )
      throw Error('Steward columns invalid')
  const fields = database
    .prepare('PRAGMA table_info(memory_pending)')
    .all()
    .map((r) => r.name)
  if (
    JSON.stringify(fields) !==
    JSON.stringify([
      'object_id',
      'version',
      'state',
      'entry_kind',
      'authority_assistant',
      'source_digest',
      'sources_json',
      'candidate_json',
      'created_at'
    ])
  )
    throw Error('Steward pending schema invalid')
}
