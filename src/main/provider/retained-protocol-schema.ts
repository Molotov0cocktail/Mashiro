import type { DatabaseSync } from 'node:sqlite'

const columns =
  'id,assistant_id,request_id,endpoint_fingerprint,model,adapter_version,status,messages_json,created_at,protocol,mode,chat_mode'
function tableSql(name: string, retained: boolean): string {
  return `CREATE TABLE ${name}(
    id TEXT PRIMARY KEY NOT NULL, assistant_id TEXT NOT NULL REFERENCES assistants(id),
    request_id TEXT NOT NULL, endpoint_fingerprint TEXT NOT NULL, model TEXT NOT NULL,
    adapter_version TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('active','closed','interrupted')),
    messages_json TEXT NOT NULL CHECK(length(messages_json)<=524288), created_at TEXT NOT NULL,
    protocol TEXT NOT NULL DEFAULT 'chat-completions-v1' CHECK(protocol='chat-completions-v1'),
    mode TEXT NOT NULL DEFAULT 'standard-non-preserved' CHECK(${retained ? "mode IN ('standard-non-preserved','retained-thinking')" : "mode='standard-non-preserved'"}),
    chat_mode TEXT NOT NULL DEFAULT 'normal' CHECK(chat_mode='normal'),
    UNIQUE(assistant_id,request_id))`
}
const guards = [
  "CREATE TRIGGER retention_segment_update BEFORE UPDATE OF messages_json ON protocol_segments WHEN NEW.messages_json<>'[]' AND EXISTS(SELECT 1 FROM content_tombstones WHERE kind='round' AND id=NEW.request_id) BEGIN SELECT RAISE(IGNORE); END",
  ...['INSERT', 'UPDATE', 'DELETE'].map(
    (action) =>
      `CREATE TRIGGER retention_epoch_protocol_segments_${action} AFTER ${action} ON protocol_segments BEGIN UPDATE retention_state SET epoch=epoch+1 WHERE singleton=1; END`
  )
]
const normalized = (sql: string): string => sql.replace(/[\s";]/g, '').toLowerCase()
function verify(database: DatabaseSync, retained: boolean): void {
  const table = database
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='protocol_segments'")
    .get()
  if (
    !table ||
    normalized(String(table.sql)) !== normalized(tableSql('protocol_segments', retained))
  )
    throw Error('PROTOCOL_SCHEMA_INVALID')
  const actual = database
    .prepare("SELECT sql FROM sqlite_master WHERE type='trigger' AND tbl_name='protocol_segments'")
    .all()
    .map((row) => normalized(String(row.sql)))
  if (
    actual.length !== guards.length ||
    guards.some((guard) => !actual.includes(normalized(guard)))
  )
    throw Error('PROTOCOL_GUARD_INVALID')
  if (
    !database
      .prepare('PRAGMA foreign_key_list(tool_operations)')
      .all()
      .some(
        (row) => row.table === 'protocol_segments' && row.from === 'segment_id' && row.to === 'id'
      )
  )
    throw Error('PROTOCOL_OPERATION_FOREIGN_KEY_INVALID')
}

export function migrateRetainedProtocol(database: DatabaseSync): void {
  const version = Number(database.prepare('PRAGMA user_version').get()!.user_version)
  if (version === 15) {
    verify(database, false)
    if (
      database.prepare('PRAGMA integrity_check').get()!.integrity_check !== 'ok' ||
      database.prepare('PRAGMA foreign_key_check').all().length
    )
      throw Error('PROTOCOL_MIGRATION_INTEGRITY')
    const enabled = Number(database.prepare('PRAGMA foreign_keys').get()!.foreign_keys)
    if (enabled !== 1) throw Error('PROTOCOL_MIGRATION_FOREIGN_KEYS_DISABLED')
    database.exec('PRAGMA foreign_keys=OFF')
    try {
      database.exec('BEGIN IMMEDIATE')
      try {
        const count = database.prepare('SELECT count(*) AS n FROM protocol_segments').get()!.n
        database.exec(tableSql('protocol_segments_next', true))
        database.exec(
          `INSERT INTO protocol_segments_next(${columns}) SELECT ${columns} FROM protocol_segments`
        )
        if (database.prepare('SELECT count(*) AS n FROM protocol_segments_next').get()!.n !== count)
          throw Error('PROTOCOL_MIGRATION_COUNT')
        database.exec(
          'DROP TABLE protocol_segments; ALTER TABLE protocol_segments_next RENAME TO protocol_segments'
        )
        for (const guard of guards) database.exec(guard)
        verify(database, true)
        if (database.prepare('PRAGMA foreign_key_check').all().length)
          throw Error('PROTOCOL_MIGRATION_FOREIGN_KEY')
        database.exec('PRAGMA user_version=16; COMMIT')
      } catch (error) {
        database.exec('ROLLBACK')
        throw error
      }
    } finally {
      database.exec('PRAGMA foreign_keys=ON')
    }
  }
  if (Number(database.prepare('PRAGMA user_version').get()!.user_version) >= 16)
    verify(database, true)
}
