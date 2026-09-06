import type { DatabaseSync } from 'node:sqlite'

const tables = [
  'retention_state',
  'retention_commands',
  'retention_previews',
  'retention_jobs',
  'retention_job_items',
  'content_tombstones',
  'assistant_tombstones',
  'retained_source_edges',
  'retention_original_trash'
]
export function migrateRetention(database: DatabaseSync): void {
  if (Number(database.prepare('PRAGMA user_version').get()!.user_version) !== 6) return
  database.exec('BEGIN IMMEDIATE')
  try {
    database.exec(`
      CREATE TABLE retention_state(singleton INTEGER PRIMARY KEY CHECK(singleton=1), epoch INTEGER NOT NULL, generation INTEGER NOT NULL);
      INSERT INTO retention_state VALUES(1,0,0);
      CREATE TABLE retention_commands(id TEXT PRIMARY KEY,assistant_id TEXT NOT NULL,intent_hash TEXT NOT NULL,receipt_json TEXT NOT NULL);
      CREATE TABLE retention_previews(id TEXT PRIMARY KEY,assistant_id TEXT NOT NULL,nonce TEXT NOT NULL,epoch INTEGER NOT NULL,manifest_json TEXT NOT NULL,state TEXT NOT NULL);
      CREATE TABLE retention_jobs(id TEXT PRIMARY KEY,assistant_id TEXT NOT NULL,command_id TEXT NOT NULL,state TEXT NOT NULL,created_at TEXT NOT NULL,error TEXT);
      CREATE TABLE retention_job_items(job_id TEXT NOT NULL REFERENCES retention_jobs(id),kind TEXT NOT NULL,resource_id TEXT NOT NULL,expected_hash TEXT NOT NULL,state TEXT NOT NULL,PRIMARY KEY(job_id,kind,resource_id));
      CREATE TABLE content_tombstones(kind TEXT NOT NULL,id TEXT NOT NULL,version INTEGER NOT NULL,reason TEXT NOT NULL,epoch INTEGER NOT NULL,PRIMARY KEY(kind,id,version));
      CREATE TABLE assistant_tombstones(id TEXT PRIMARY KEY,epoch INTEGER NOT NULL);
      CREATE TABLE retention_original_trash(request_id TEXT PRIMARY KEY,assistant_id TEXT NOT NULL,accepted_json TEXT NOT NULL,epoch INTEGER NOT NULL);
      CREATE TABLE retained_source_edges(object_id TEXT NOT NULL,object_version INTEGER NOT NULL,source_type TEXT NOT NULL,source_id TEXT NOT NULL,source_version INTEGER NOT NULL,source_assistant TEXT NOT NULL,recipients_json TEXT NOT NULL,epoch INTEGER NOT NULL,PRIMARY KEY(object_id,object_version,source_type,source_id,source_version));
      DROP TRIGGER assistant_state_primary_active;
      DROP TRIGGER assistant_state_current_active;
      CREATE TRIGGER assistant_state_primary_active BEFORE UPDATE OF primary_assistant_id ON assistant_state WHEN
        (NEW.primary_assistant_id IS NULL AND EXISTS(SELECT 1 FROM assistants WHERE archived_at IS NULL AND id NOT IN(SELECT id FROM assistant_tombstones))) OR
        (NEW.primary_assistant_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM assistants WHERE id=NEW.primary_assistant_id AND archived_at IS NULL AND id NOT IN(SELECT id FROM assistant_tombstones)))
        BEGIN SELECT RAISE(ABORT,'primary_must_be_active'); END;
      CREATE TRIGGER assistant_state_current_active BEFORE UPDATE OF current_assistant_id ON assistant_state WHEN
        (NEW.current_assistant_id IS NULL AND EXISTS(SELECT 1 FROM assistants WHERE archived_at IS NULL AND id NOT IN(SELECT id FROM assistant_tombstones))) OR
        (NEW.current_assistant_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM assistants WHERE id=NEW.current_assistant_id AND archived_at IS NULL AND id NOT IN(SELECT id FROM assistant_tombstones)))
        BEGIN SELECT RAISE(ABORT,'current_must_be_active'); END;
      CREATE TRIGGER retention_timeline_insert BEFORE INSERT ON timeline_messages WHEN EXISTS(SELECT 1 FROM assistant_tombstones WHERE id=NEW.assistant_id) OR EXISTS(SELECT 1 FROM content_tombstones WHERE kind='round' AND id=NEW.request_id) BEGIN SELECT RAISE(ABORT,'content_retired'); END;
      CREATE TRIGGER retention_timeline_update BEFORE UPDATE OF content ON timeline_messages WHEN NEW.content<>'' AND (EXISTS(SELECT 1 FROM assistant_tombstones WHERE id=NEW.assistant_id) OR EXISTS(SELECT 1 FROM content_tombstones WHERE kind='round' AND id=NEW.request_id)) BEGIN SELECT RAISE(IGNORE); END;
      CREATE TRIGGER retention_segment_update BEFORE UPDATE OF messages_json ON protocol_segments WHEN NEW.messages_json<>'[]' AND EXISTS(SELECT 1 FROM content_tombstones WHERE kind='round' AND id=NEW.request_id) BEGIN SELECT RAISE(IGNORE); END;
      CREATE VIEW readable_timeline_messages AS SELECT * FROM timeline_messages WHERE assistant_id NOT IN(SELECT id FROM assistant_tombstones) AND request_id NOT IN(SELECT id FROM content_tombstones WHERE kind='round') AND request_id NOT IN(SELECT request_id FROM retention_original_trash) AND request_id NOT IN(SELECT source_id FROM memory_suppressions WHERE kind='withdrawal' AND source_type IN('round','user-round'));
    `)
    // Every authority/content mutation invalidates a preview. Cleanup bookkeeping does not.
    for (const table of [
      'assistants',
      'assistant_state',
      'timeline_messages',
      'history_permissions',
      'history_recipient_grants',
      'assistant_provider_bindings',
      'provider_connections',
      'memory_objects',
      'memory_versions',
      'memory_commands',
      'memory_previews',
      'memory_dependencies',
      'memory_permissions',
      'memory_recipients',
      'memory_suppressions',
      'timeline_sources',
      'protocol_segments',
      'tool_operations'
    ])
      for (const action of ['INSERT', 'UPDATE', 'DELETE'])
        database.exec(
          `CREATE TRIGGER retention_epoch_${table}_${action} AFTER ${action} ON ${table} BEGIN UPDATE retention_state SET epoch=epoch+1 WHERE singleton=1; END;`
        )
    database.exec('PRAGMA user_version=7; COMMIT')
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }
}
export function verifyRetention(database: DatabaseSync): void {
  for (const name of tables)
    if (!database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name))
      throw new Error('Retention schema is incomplete')
  for (const name of [
    'readable_timeline_messages',
    'retention_timeline_insert',
    'retention_timeline_update',
    'retention_segment_update'
  ])
    if (!database.prepare('SELECT 1 FROM sqlite_master WHERE name=?').get(name))
      throw new Error('Retention guard is incomplete')
  if (
    !database
      .prepare('PRAGMA table_info(retention_state)')
      .all()
      .some((column) => column.name === 'generation')
  )
    throw new Error('Retention generation is missing')
}
export function retentionEpoch(database: DatabaseSync): number {
  return Number(
    database.prepare('SELECT epoch FROM retention_state WHERE singleton=1').get()!.epoch
  )
}
