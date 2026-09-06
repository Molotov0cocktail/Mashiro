import type { DatabaseSync } from 'node:sqlite'

const tables = [
  'items',
  'item_proposals',
  'item_commands',
  'item_sources',
  'item_permissions',
  'item_recipients',
  'item_confirmations',
  'item_rejections',
  'item_tombstones',
  'item_retained_edges'
] as const
export function migrateItems(database: DatabaseSync): void {
  if (Number(database.prepare('PRAGMA user_version').get()!.user_version) !== 7) return
  if (
    database.prepare('PRAGMA integrity_check').get()!.integrity_check !== 'ok' ||
    database.prepare('PRAGMA foreign_key_check').all().length
  )
    throw Error('Storage integrity failed before item upgrade')
  database.exec('BEGIN IMMEDIATE')
  try {
    database.exec(`
      CREATE TABLE items(id TEXT PRIMARY KEY,version INTEGER NOT NULL CHECK(version>0),origin_proposal_id TEXT UNIQUE,record_json TEXT NOT NULL);
      CREATE TABLE item_proposals(id TEXT PRIMARY KEY,version INTEGER NOT NULL CHECK(version>0),origin_assistant_id TEXT NOT NULL,state TEXT NOT NULL,identity_hash TEXT NOT NULL,record_json TEXT NOT NULL);
      CREATE UNIQUE INDEX item_proposal_identity ON item_proposals(origin_assistant_id,identity_hash);
      CREATE TABLE item_commands(id TEXT PRIMARY KEY,assistant_id TEXT NOT NULL,intent_hash TEXT NOT NULL,receipt_json TEXT NOT NULL);
      CREATE TABLE item_sources(node_type TEXT NOT NULL,node_id TEXT NOT NULL,node_version INTEGER NOT NULL,source_type TEXT NOT NULL,source_id TEXT NOT NULL,source_assistant TEXT NOT NULL,source_version INTEGER NOT NULL,PRIMARY KEY(node_type,node_id,node_version,source_type,source_id,source_assistant,source_version));
      CREATE TABLE item_permissions(assistant_id TEXT PRIMARY KEY,version INTEGER NOT NULL,read_allowed INTEGER NOT NULL,write_allowed INTEGER NOT NULL,propose_allowed INTEGER NOT NULL);
      CREATE TABLE item_recipients(assistant_id TEXT NOT NULL,fingerprint TEXT NOT NULL,allowed INTEGER NOT NULL,PRIMARY KEY(assistant_id,fingerprint));
      CREATE TABLE item_confirmations(id TEXT PRIMARY KEY,assistant_id TEXT NOT NULL,command_id TEXT NOT NULL,epoch INTEGER NOT NULL,payload_json TEXT NOT NULL,state TEXT NOT NULL);
      CREATE TABLE item_rejections(identity_hash TEXT PRIMARY KEY,proposal_id TEXT NOT NULL);
      CREATE TABLE item_retained_edges(item_id TEXT NOT NULL,item_version INTEGER NOT NULL,source_json TEXT NOT NULL,recipients_json TEXT NOT NULL,PRIMARY KEY(item_id,item_version,source_json));
      CREATE TABLE item_tombstones(kind TEXT NOT NULL,id TEXT NOT NULL,PRIMARY KEY(kind,id));
      CREATE TRIGGER item_proposal_no_resurrection BEFORE INSERT ON item_proposals WHEN EXISTS(SELECT 1 FROM assistant_tombstones WHERE id=NEW.origin_assistant_id) OR EXISTS(SELECT 1 FROM item_tombstones WHERE kind='proposal' AND id=NEW.id) BEGIN SELECT RAISE(ABORT,'proposal_retired'); END;
    `)
    for (const table of tables.filter((name) => name !== 'item_confirmations'))
      for (const action of ['INSERT', 'UPDATE', 'DELETE'])
        database.exec(
          `CREATE TRIGGER retention_epoch_${table}_${action} AFTER ${action} ON ${table} BEGIN UPDATE retention_state SET epoch=epoch+1 WHERE singleton=1; END;`
        )
    database.exec('PRAGMA user_version=8; COMMIT')
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }
}
export function verifyItems(database: DatabaseSync): void {
  const epochs = tables
    .filter((t) => t !== 'item_confirmations')
    .flatMap((t) => ['INSERT', 'UPDATE', 'DELETE'].map((a) => 'retention_epoch_' + t + '_' + a))
  for (const name of [
    ...tables,
    ...epochs,
    'item_proposal_no_resurrection',
    'item_proposal_identity'
  ])
    if (!database.prepare('SELECT 1 FROM sqlite_master WHERE name=?').get(name))
      throw Error('Item schema incomplete')
}
