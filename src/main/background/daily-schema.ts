import type { DatabaseSync } from 'node:sqlite'
export const dailyTables = [
  'daily_configs',
  'daily_jobs',
  'daily_reports',
  'daily_commands',
  'daily_suppressions',
  'daily_item_checkpoints',
  'daily_item_changes',
  'usage_attempts',
  'operation_events'
] as const
export function migrateDaily(database: DatabaseSync) {
  if (Number(database.prepare('PRAGMA user_version').get()!.user_version) === 13) {
    if (
      database.prepare('PRAGMA integrity_check').get()!.integrity_check !== 'ok' ||
      database.prepare('PRAGMA foreign_key_check').all().length
    )
      throw Error('Daily migration precondition')
    database.exec('BEGIN IMMEDIATE')
    try {
      database.exec(`
        CREATE TABLE daily_configs(id TEXT PRIMARY KEY,assistant_id TEXT NOT NULL,feature TEXT NOT NULL,record_json TEXT NOT NULL,next_run TEXT,last_tick TEXT,UNIQUE(assistant_id,feature));
        CREATE TABLE daily_jobs(id TEXT PRIMARY KEY,source_key TEXT NOT NULL UNIQUE,record_json TEXT NOT NULL,inputs_json TEXT NOT NULL,candidate_json TEXT);
        CREATE TABLE daily_reports(id TEXT PRIMARY KEY,job_id TEXT NOT NULL UNIQUE,record_json TEXT NOT NULL,content_json TEXT NOT NULL,guard TEXT NOT NULL);
        CREATE TABLE daily_commands(id TEXT PRIMARY KEY,arguments_hash TEXT NOT NULL,receipt_json TEXT NOT NULL);
        CREATE TABLE daily_suppressions(identity TEXT PRIMARY KEY,command_id TEXT NOT NULL);
        CREATE TABLE daily_item_checkpoints(config_id TEXT NOT NULL,item_id TEXT NOT NULL,version INTEGER NOT NULL,content_json TEXT NOT NULL,PRIMARY KEY(config_id,item_id));
        CREATE TABLE daily_item_changes(item_id TEXT NOT NULL,version INTEGER NOT NULL,record_json TEXT NOT NULL,PRIMARY KEY(item_id,version));
        INSERT INTO daily_item_changes SELECT id,version,record_json FROM items;
        CREATE TABLE usage_attempts(id TEXT PRIMARY KEY,record_json TEXT NOT NULL);
        CREATE TABLE operation_events(id TEXT PRIMARY KEY,record_json TEXT NOT NULL);
        PRAGMA user_version=14;
      `)
      database.exec('COMMIT')
    } catch (error) {
      database.exec('ROLLBACK')
      throw error
    }
  }
  for (const table of dailyTables)
    if (!database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table))
      throw Error('Daily schema incomplete')
  const columns: Record<(typeof dailyTables)[number], string[]> = {
    daily_configs: ['id', 'assistant_id', 'feature', 'record_json', 'next_run', 'last_tick'],
    daily_jobs: ['id', 'source_key', 'record_json', 'inputs_json', 'candidate_json'],
    daily_reports: ['id', 'job_id', 'record_json', 'content_json', 'guard'],
    daily_commands: ['id', 'arguments_hash', 'receipt_json'],
    daily_suppressions: ['identity', 'command_id'],
    daily_item_checkpoints: ['config_id', 'item_id', 'version', 'content_json'],
    daily_item_changes: ['item_id', 'version', 'record_json'],
    usage_attempts: ['id', 'record_json'],
    operation_events: ['id', 'record_json']
  }
  for (const table of dailyTables)
    if (
      JSON.stringify(
        database
          .prepare('PRAGMA table_info(' + table + ')')
          .all()
          .map((row) => row.name)
      ) !== JSON.stringify(columns[table])
    )
      throw Error('Daily columns invalid')
}
