import type { DatabaseSync } from 'node:sqlite'

export function migrateReminders(database: DatabaseSync): void {
  if (Number(database.prepare('PRAGMA user_version').get()!.user_version) === 9) {
    if (
      database.prepare('PRAGMA integrity_check').get()!.integrity_check !== 'ok' ||
      database.prepare('PRAGMA foreign_key_check').all().length
    )
      throw new Error('Storage integrity failed before reminder upgrade')
    database.exec('BEGIN IMMEDIATE')
    try {
      database.exec(`
        CREATE TABLE reminders(id TEXT PRIMARY KEY, item_id TEXT NOT NULL, version INTEGER NOT NULL CHECK(version>0), state TEXT NOT NULL, due_at TEXT NOT NULL, record_json TEXT NOT NULL);
        CREATE INDEX reminders_due ON reminders(state,due_at);
        CREATE TABLE reminder_commands(id TEXT PRIMARY KEY,assistant_id TEXT NOT NULL,arguments_hash TEXT NOT NULL,receipt_json TEXT NOT NULL);
        CREATE TABLE reminder_occurrences(reminder_id TEXT NOT NULL,version INTEGER NOT NULL,state TEXT NOT NULL,PRIMARY KEY(reminder_id,version));
        CREATE TABLE reminder_activations(identity TEXT PRIMARY KEY);
        CREATE TABLE reminder_previews(id TEXT PRIMARY KEY,assistant_id TEXT NOT NULL,record_json TEXT NOT NULL,proof_json TEXT NOT NULL);
        CREATE TABLE reminder_settings(singleton INTEGER PRIMARY KEY CHECK(singleton=1),version INTEGER NOT NULL,policy_json TEXT NOT NULL);
        INSERT INTO reminder_settings VALUES(1,0,'{"mode":"UNCONFIGURED"}');
        PRAGMA user_version=10;
      `)
      database.exec('COMMIT')
    } catch (error) {
      database.exec('ROLLBACK')
      throw error
    }
  }
  const columns = {
    reminders: ['id', 'item_id', 'version', 'state', 'due_at', 'record_json'],
    reminder_commands: ['id', 'assistant_id', 'arguments_hash', 'receipt_json'],
    reminder_occurrences: ['reminder_id', 'version', 'state'],
    reminder_settings: ['singleton', 'version', 'policy_json'],
    reminder_previews: ['id', 'assistant_id', 'record_json', 'proof_json'],
    reminder_activations: ['identity']
  } as const
  for (const name of Object.keys(columns) as (keyof typeof columns)[]) {
    if (!database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name))
      throw new Error('Reminder storage missing')
    const actual = database
      .prepare('PRAGMA table_info(' + name + ')')
      .all()
      .map((row) => String(row.name))
    if (JSON.stringify(actual) !== JSON.stringify(columns[name]))
      throw new Error('Reminder storage columns invalid')
  }
  if (!database.prepare('SELECT 1 FROM reminder_settings WHERE singleton=1').get())
    throw new Error('Reminder settings missing')
}
