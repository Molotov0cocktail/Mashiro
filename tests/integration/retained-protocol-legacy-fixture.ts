import type { DatabaseSync } from 'node:sqlite'

/** Synthetic fixtures only: restore the actual pre-v16 CHECK, not just its version number. */
export function removeRetainedProtocolFixture(database: DatabaseSync): void {
  const table = database
    .prepare("SELECT sql FROM sqlite_master WHERE name='protocol_segments'")
    .get()
  if (!table || !String(table.sql).includes('retained-thinking')) return
  if (
    database.prepare("SELECT 1 FROM protocol_segments WHERE mode<>'standard-non-preserved'").get()
  )
    throw Error('CANNOT_DOWNGRADE_RETAINED_FIXTURE')
  const enabled = Number(database.prepare('PRAGMA foreign_keys').get()!.foreign_keys)
  const guards = database
    .prepare(
      "SELECT name,sql FROM sqlite_master WHERE type='trigger' AND tbl_name='protocol_segments'"
    )
    .all()
  for (const guard of guards)
    if (
      !/^retention_(segment_update|epoch_protocol_segments_(INSERT|UPDATE|DELETE))$/.test(
        String(guard.name)
      )
    )
      throw Error('UNEXPECTED_FIXTURE_GUARD')
  database.exec('PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE')
  try {
    database.exec(`CREATE TABLE protocol_segments_old(
      id TEXT PRIMARY KEY NOT NULL, assistant_id TEXT NOT NULL REFERENCES assistants(id),
      request_id TEXT NOT NULL, endpoint_fingerprint TEXT NOT NULL, model TEXT NOT NULL,
      adapter_version TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('active','closed','interrupted')),
      messages_json TEXT NOT NULL CHECK(length(messages_json)<=524288), created_at TEXT NOT NULL,
      protocol TEXT NOT NULL DEFAULT 'chat-completions-v1' CHECK(protocol='chat-completions-v1'),
      mode TEXT NOT NULL DEFAULT 'standard-non-preserved' CHECK(mode='standard-non-preserved'),
      chat_mode TEXT NOT NULL DEFAULT 'normal' CHECK(chat_mode='normal'), UNIQUE(assistant_id,request_id));
      INSERT INTO protocol_segments_old SELECT * FROM protocol_segments;
      DROP TABLE protocol_segments; ALTER TABLE protocol_segments_old RENAME TO protocol_segments;`)
    for (const guard of guards) database.exec(String(guard.sql))
    if (database.prepare('PRAGMA foreign_key_check').all().length)
      throw Error('FIXTURE_FOREIGN_KEY')
    database.exec('COMMIT')
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  } finally {
    database.exec('PRAGMA foreign_keys=' + enabled)
  }
}
