import type { DatabaseSync } from 'node:sqlite'

const tables = [
  'background_configs',
  'background_jobs',
  'background_attempts',
  'background_chapters',
  'background_controls'
]
export function migrateBackground(database: DatabaseSync): void {
  const version = Number(database.prepare('PRAGMA user_version').get()!.user_version)
  if (version === 10) {
    if (
      database.prepare('PRAGMA integrity_check').get()!.integrity_check !== 'ok' ||
      database.prepare('PRAGMA foreign_key_check').all().length
    )
      throw new Error('Background migration precondition failed')
    database.exec('BEGIN IMMEDIATE')
    try {
      database.exec(`
        CREATE TABLE background_configs(assistant_id TEXT PRIMARY KEY NOT NULL REFERENCES assistants(id), version INTEGER NOT NULL CHECK(version>0), record_json TEXT NOT NULL);
        CREATE TABLE background_jobs(id TEXT PRIMARY KEY NOT NULL, assistant_id TEXT NOT NULL REFERENCES assistants(id), source_key TEXT NOT NULL UNIQUE, source_digest TEXT NOT NULL, candidate_json TEXT, record_json TEXT NOT NULL);
        CREATE TABLE background_attempts(id TEXT PRIMARY KEY NOT NULL, job_id TEXT NOT NULL REFERENCES background_jobs(id), assistant_id TEXT NOT NULL, window_id TEXT NOT NULL, input_characters INTEGER NOT NULL CHECK(input_characters>0), state TEXT NOT NULL CHECK(state IN('SENDING','SETTLED','UNKNOWN')), usage_json TEXT, connection_id TEXT NOT NULL, fingerprint TEXT NOT NULL, model TEXT NOT NULL);
        CREATE INDEX background_usage_window ON background_attempts(assistant_id,window_id);
        CREATE TABLE background_chapters(id TEXT PRIMARY KEY NOT NULL, assistant_id TEXT NOT NULL REFERENCES assistants(id), job_id TEXT NOT NULL UNIQUE REFERENCES background_jobs(id), record_json TEXT NOT NULL);
        CREATE TABLE background_controls(id TEXT PRIMARY KEY NOT NULL, assistant_id TEXT NOT NULL, arguments_json TEXT NOT NULL);
        PRAGMA user_version=11;
      `)
      database.exec('COMMIT')
    } catch (error) {
      database.exec('ROLLBACK')
      throw error
    }
  }
  const columns: Record<string, string[]> = {
    background_configs: ['assistant_id', 'version', 'record_json'],
    background_jobs: [
      'id',
      'assistant_id',
      'source_key',
      'source_digest',
      'candidate_json',
      'record_json'
    ],
    background_attempts: [
      'id',
      'job_id',
      'assistant_id',
      'window_id',
      'input_characters',
      'state',
      'usage_json',
      'connection_id',
      'fingerprint',
      'model'
    ],
    background_chapters: ['id', 'assistant_id', 'job_id', 'record_json'],
    background_controls: ['id', 'assistant_id', 'arguments_json']
  }
  for (const name of tables) {
    if (!database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name))
      throw new Error('Background schema incomplete')
    const actual = database
      .prepare('PRAGMA table_info(' + name + ')')
      .all()
      .map((row) => String(row.name))
    if (JSON.stringify(actual) !== JSON.stringify(columns[name]))
      throw new Error('Background schema columns invalid')
  }
}
