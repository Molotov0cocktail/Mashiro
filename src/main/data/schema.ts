import type { DatabaseSync } from 'node:sqlite'

export const schemaVersion = 6

const requiredTables = [
  'assistants',
  'assistant_state',
  'provider_connections',
  'assistant_provider_bindings',
  'timeline_messages',
  'history_permissions',
  'history_recipient_grants',
  'protocol_segments',
  'tool_operations',
  'protocol_results',
  'timeline_sources',
  'provider_capability_evidence',
  'memory_objects',
  'memory_versions',
  'memory_commands',
  'memory_dependencies',
  'memory_permissions',
  'memory_recipients',
  'memory_index',
  'memory_suppressions',
  'memory_previews',
  'memory_cleanup',
  'memory_pending'
] as const
const requiredTriggers = [
  'assistant_no_delete',
  'assistant_state_no_delete',
  'assistant_no_archive_primary',
  'assistant_no_archive_current',
  'assistant_state_primary_active',
  'assistant_state_current_active'
] as const

const v1Ddl = [
  'CREATE TABLE assistants (id TEXT PRIMARY KEY NOT NULL, display_name TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, archived_at TEXT NULL, version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1), CHECK (length(trim(display_name)) BETWEEN 1 AND 80));',
  'CREATE TABLE assistant_state (singleton INTEGER PRIMARY KEY CHECK (singleton = 1), primary_assistant_id TEXT NULL REFERENCES assistants(id) ON DELETE RESTRICT, current_assistant_id TEXT NULL REFERENCES assistants(id) ON DELETE RESTRICT, revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0));',
  'INSERT INTO assistant_state(singleton, primary_assistant_id, current_assistant_id, revision) VALUES (1, NULL, NULL, 0);',
  "CREATE TRIGGER assistant_no_delete BEFORE DELETE ON assistants BEGIN SELECT RAISE(ABORT, 'assistant_delete_forbidden'); END;",
  "CREATE TRIGGER assistant_state_no_delete BEFORE DELETE ON assistant_state BEGIN SELECT RAISE(ABORT, 'assistant_state_delete_forbidden'); END;",
  "CREATE TRIGGER assistant_no_archive_primary BEFORE UPDATE OF archived_at ON assistants WHEN OLD.archived_at IS NULL AND NEW.archived_at IS NOT NULL AND (SELECT primary_assistant_id FROM assistant_state WHERE singleton = 1) = OLD.id BEGIN SELECT RAISE(ABORT, 'primary_archive_forbidden'); END;",
  "CREATE TRIGGER assistant_no_archive_current BEFORE UPDATE OF archived_at ON assistants WHEN OLD.archived_at IS NULL AND NEW.archived_at IS NOT NULL AND (SELECT current_assistant_id FROM assistant_state WHERE singleton = 1) = OLD.id BEGIN SELECT RAISE(ABORT, 'current_archive_forbidden'); END;",
  "CREATE TRIGGER assistant_state_primary_active BEFORE UPDATE OF primary_assistant_id ON assistant_state WHEN (NEW.primary_assistant_id IS NULL AND EXISTS (SELECT 1 FROM assistants WHERE archived_at IS NULL)) OR (NEW.primary_assistant_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM assistants WHERE id = NEW.primary_assistant_id AND archived_at IS NULL)) BEGIN SELECT RAISE(ABORT, 'primary_must_be_active'); END;",
  "CREATE TRIGGER assistant_state_current_active BEFORE UPDATE OF current_assistant_id ON assistant_state WHEN (NEW.current_assistant_id IS NULL AND EXISTS (SELECT 1 FROM assistants WHERE archived_at IS NULL)) OR (NEW.current_assistant_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM assistants WHERE id = NEW.current_assistant_id AND archived_at IS NULL)) BEGIN SELECT RAISE(ABORT, 'current_must_be_active'); END;",
  'PRAGMA user_version = 1;'
].join('\n')

const v2Ddl = [
  'CREATE TABLE provider_connections (id TEXT PRIMARY KEY NOT NULL, display_name TEXT NOT NULL, base_url TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)), has_persistent_credential INTEGER NOT NULL DEFAULT 0 CHECK (has_persistent_credential IN (0, 1)), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1), CHECK (length(trim(display_name)) BETWEEN 1 AND 80));',
  'CREATE TABLE assistant_provider_bindings (assistant_id TEXT PRIMARY KEY NOT NULL REFERENCES assistants(id) ON DELETE RESTRICT, connection_id TEXT NOT NULL REFERENCES provider_connections(id) ON DELETE RESTRICT, model TEXT NOT NULL, updated_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1), CHECK (length(trim(model)) BETWEEN 1 AND 160));',
  'PRAGMA user_version = 2;'
].join('\n')

const v3Ddl = [
  "CREATE TABLE timeline_messages (sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, assistant_id TEXT NOT NULL REFERENCES assistants(id) ON DELETE RESTRICT, request_id TEXT NOT NULL, role TEXT NOT NULL CHECK (role IN ('user', 'assistant')), content TEXT NOT NULL CHECK (length(content) <= 120000), status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed', 'cancelled', 'interrupted')), created_at TEXT NOT NULL, source_session_id TEXT NULL, source_message_id TEXT NULL, UNIQUE(assistant_id, source_session_id, source_message_id), UNIQUE(assistant_id, request_id, role));",
  'CREATE INDEX timeline_assistant_sequence ON timeline_messages(assistant_id, sequence);',
  'PRAGMA user_version = 3;'
].join('\n')

export class StorageInconsistentError extends Error {}

function schemaObjectExists(
  database: DatabaseSync,
  type: 'table' | 'trigger',
  name: string
): boolean {
  return Boolean(
    database.prepare('SELECT 1 FROM sqlite_master WHERE type = ? AND name = ?').get(type, name)
  )
}

function verifyV1Objects(database: DatabaseSync): void {
  for (const table of ['assistants', 'assistant_state']) {
    if (!schemaObjectExists(database, 'table', table)) {
      throw new StorageInconsistentError('Storage table missing before upgrade')
    }
  }
  for (const trigger of requiredTriggers) {
    if (!schemaObjectExists(database, 'trigger', trigger)) {
      throw new StorageInconsistentError('Storage guard missing before upgrade')
    }
  }
}

export function initializeOrVerifySchema(database: DatabaseSync): void {
  const version = Number(
    (database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version
  )
  if (version > schemaVersion) throw new StorageInconsistentError('Unsupported storage schema')
  if (version === 0) {
    const objectCount = Number(
      (
        database
          .prepare(
            "SELECT count(*) AS value FROM sqlite_master WHERE type IN ('table', 'trigger') AND name NOT LIKE 'sqlite_%'"
          )
          .get() as { value: number }
      ).value
    )
    if (objectCount !== 0) throw new StorageInconsistentError('Unversioned storage is not empty')
    database.exec('BEGIN IMMEDIATE')
    try {
      database.exec(v1Ddl)
      database.exec('COMMIT')
    } catch (error) {
      database.exec('ROLLBACK')
      throw error
    }
  }

  const afterCreate = Number(
    (database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version
  )
  if (afterCreate === 1) {
    verifyV1Objects(database)
    const check = database.prepare('PRAGMA integrity_check').get() as {
      integrity_check: string
    }
    if (check.integrity_check !== 'ok') {
      throw new StorageInconsistentError('Storage integrity check failed before upgrade')
    }
    database.exec('BEGIN IMMEDIATE')
    try {
      database.exec(v2Ddl)
      database.exec('COMMIT')
    } catch (error) {
      database.exec('ROLLBACK')
      throw error
    }
  }

  const beforeV3 = Number(
    (database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version
  )
  if (beforeV3 === 2) {
    verifyV1Objects(database)
    for (const table of ['provider_connections', 'assistant_provider_bindings']) {
      if (!schemaObjectExists(database, 'table', table)) {
        throw new StorageInconsistentError('Storage table missing before upgrade')
      }
    }
    const integrity = database.prepare('PRAGMA integrity_check').get() as {
      integrity_check: string
    }
    if (
      integrity.integrity_check !== 'ok' ||
      database.prepare('PRAGMA foreign_key_check').all().length
    ) {
      throw new StorageInconsistentError('Storage integrity check failed before upgrade')
    }
    database.exec('BEGIN IMMEDIATE')
    try {
      database.exec(v3Ddl)
      database.exec('COMMIT')
    } catch (error) {
      database.exec('ROLLBACK')
      throw error
    }
  }

  const beforeV4 = Number(
    (database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version
  )
  if (beforeV4 === 3) {
    verifyV1Objects(database)
    for (const table of [
      'timeline_messages',
      'provider_connections',
      'assistant_provider_bindings'
    ]) {
      if (!schemaObjectExists(database, 'table', table))
        throw new StorageInconsistentError('Storage table missing before upgrade')
    }
    const check = database.prepare('PRAGMA integrity_check').get() as { integrity_check: string }
    if (check.integrity_check !== 'ok' || database.prepare('PRAGMA foreign_key_check').all().length)
      throw new StorageInconsistentError('Storage integrity check failed before upgrade')
    database.exec('BEGIN IMMEDIATE')
    try {
      database.exec(`CREATE TABLE history_permissions (
        assistant_id TEXT PRIMARY KEY NOT NULL REFERENCES assistants(id) ON DELETE RESTRICT,
        read_history INTEGER NOT NULL CHECK(read_history IN (0,1)),
        version INTEGER NOT NULL CHECK(version > 0));
        CREATE TABLE history_recipient_grants (
        assistant_id TEXT NOT NULL REFERENCES assistants(id) ON DELETE RESTRICT,
        endpoint_fingerprint TEXT NOT NULL,
        send_history INTEGER NOT NULL CHECK(send_history IN (0,1)),
        PRIMARY KEY(assistant_id,endpoint_fingerprint));
        PRAGMA user_version = 4;`)
      database.exec('COMMIT')
    } catch (error) {
      database.exec('ROLLBACK')
      throw error
    }
  }
  const beforeV5 = Number(
    (database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version
  )
  if (beforeV5 === 4) {
    verifyV1Objects(database)
    for (const table of requiredTables.slice(0, 7)) {
      if (!schemaObjectExists(database, 'table', table))
        throw new StorageInconsistentError('Storage table missing before upgrade')
    }
    const check = database.prepare('PRAGMA integrity_check').get() as { integrity_check: string }
    if (check.integrity_check !== 'ok' || database.prepare('PRAGMA foreign_key_check').all().length)
      throw new StorageInconsistentError('Storage integrity check failed before upgrade')
    database.exec('BEGIN IMMEDIATE')
    try {
      database.exec(`CREATE TABLE protocol_segments(
        id TEXT PRIMARY KEY NOT NULL, assistant_id TEXT NOT NULL REFERENCES assistants(id),
        request_id TEXT NOT NULL, endpoint_fingerprint TEXT NOT NULL, model TEXT NOT NULL,
        adapter_version TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('active','closed','interrupted')),
        messages_json TEXT NOT NULL CHECK(length(messages_json)<=524288), created_at TEXT NOT NULL,
        protocol TEXT NOT NULL DEFAULT 'chat-completions-v1' CHECK(protocol='chat-completions-v1'),
        mode TEXT NOT NULL DEFAULT 'standard-non-preserved' CHECK(mode='standard-non-preserved'),
        chat_mode TEXT NOT NULL DEFAULT 'normal' CHECK(chat_mode='normal'),
        UNIQUE(assistant_id,request_id));
      CREATE TABLE tool_operations(
        id TEXT PRIMARY KEY NOT NULL, segment_id TEXT NOT NULL REFERENCES protocol_segments(id),
        model_request_id TEXT NOT NULL, tool_call_id TEXT NOT NULL,
        arguments_json TEXT NOT NULL CHECK(length(arguments_json)<=32768),
        record_json TEXT NOT NULL, arguments_version INTEGER NOT NULL DEFAULT 1 CHECK(arguments_version=1),
        expected_object_version INTEGER NULL, UNIQUE(segment_id,model_request_id,tool_call_id));
      CREATE TABLE protocol_results(operation_id TEXT PRIMARY KEY NOT NULL REFERENCES tool_operations(id), result_json TEXT NOT NULL CHECK(length(result_json)<=32768));
      CREATE TABLE timeline_sources(assistant_id TEXT NOT NULL REFERENCES assistants(id),request_id TEXT NOT NULL,source_request_id TEXT NOT NULL,PRIMARY KEY(assistant_id,request_id,source_request_id));
      CREATE TABLE provider_capability_evidence(endpoint_fingerprint TEXT NOT NULL,model TEXT NOT NULL,adapter_version TEXT NOT NULL,mode TEXT NOT NULL,capability TEXT NOT NULL,observed_at TEXT NOT NULL,PRIMARY KEY(endpoint_fingerprint,model,adapter_version,mode,capability));
      PRAGMA user_version=5;`)
      database.exec('COMMIT')
    } catch (error) {
      database.exec('ROLLBACK')
      throw error
    }
  }
  const beforeV6 = Number(
    (database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version
  )
  if (beforeV6 === 5) {
    verifyV1Objects(database)
    for (const table of requiredTables.slice(0, 12))
      if (!schemaObjectExists(database, 'table', table))
        throw new StorageInconsistentError('Storage table missing before upgrade')
    const integrity = database.prepare('PRAGMA integrity_check').get() as {
      integrity_check: string
    }
    if (
      integrity.integrity_check !== 'ok' ||
      database.prepare('PRAGMA foreign_key_check').all().length
    )
      throw new StorageInconsistentError('Storage integrity check failed before upgrade')
    database.exec('BEGIN IMMEDIATE')
    try {
      database.exec(`
        CREATE TABLE memory_objects(id TEXT PRIMARY KEY,version INTEGER NOT NULL,record_json TEXT NOT NULL);
        CREATE TABLE memory_versions(object_id TEXT NOT NULL,version INTEGER NOT NULL,file_name TEXT NOT NULL,body_hash TEXT NOT NULL,metadata_json TEXT NOT NULL,PRIMARY KEY(object_id,version));
        CREATE TABLE memory_commands(id TEXT PRIMARY KEY,assistant_id TEXT NOT NULL,request_id TEXT,arguments_hash TEXT NOT NULL,intent_json TEXT NOT NULL,state TEXT NOT NULL,receipt_json TEXT,created_at TEXT NOT NULL);
        CREATE TABLE memory_dependencies(node_type TEXT NOT NULL,node_id TEXT NOT NULL,node_version INTEGER NOT NULL,source_type TEXT NOT NULL,source_id TEXT NOT NULL,source_assistant TEXT NOT NULL,source_version INTEGER NOT NULL,PRIMARY KEY(node_type,node_id,node_version,source_type,source_id,source_version));
        CREATE TABLE memory_permissions(assistant_id TEXT NOT NULL,scope TEXT NOT NULL,version INTEGER NOT NULL,read_allowed INTEGER NOT NULL,write_allowed INTEGER NOT NULL,inferences_allowed INTEGER NOT NULL,PRIMARY KEY(assistant_id,scope));
        CREATE TABLE memory_recipients(assistant_id TEXT NOT NULL,scope TEXT NOT NULL,fingerprint TEXT NOT NULL,allowed INTEGER NOT NULL,PRIMARY KEY(assistant_id,scope,fingerprint));
        CREATE TABLE memory_index(object_id TEXT PRIMARY KEY,version INTEGER NOT NULL,title TEXT NOT NULL,body TEXT NOT NULL);
        CREATE TABLE memory_suppressions(source_type TEXT NOT NULL,source_id TEXT NOT NULL,source_version INTEGER NOT NULL,kind TEXT NOT NULL,object_id TEXT NOT NULL,PRIMARY KEY(source_type,source_id,source_version,kind,object_id));
        CREATE TABLE memory_previews(id TEXT PRIMARY KEY,assistant_id TEXT NOT NULL,kind TEXT NOT NULL,payload_json TEXT NOT NULL,state TEXT NOT NULL);
        CREATE TABLE memory_cleanup(object_id TEXT PRIMARY KEY,state TEXT NOT NULL);
        CREATE TABLE memory_pending(object_id TEXT PRIMARY KEY,version INTEGER NOT NULL,state TEXT NOT NULL);
        PRAGMA user_version=6;
      `)
      database.exec('COMMIT')
    } catch (error) {
      database.exec('ROLLBACK')
      throw error
    }
  }
  const current = Number(
    (database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version
  )
  if (current !== schemaVersion)
    throw new StorageInconsistentError('Storage schema version mismatch')
  for (const table of requiredTables) {
    if (!schemaObjectExists(database, 'table', table)) {
      throw new StorageInconsistentError('Storage table missing')
    }
  }
  for (const trigger of requiredTriggers) {
    if (!schemaObjectExists(database, 'trigger', trigger)) {
      throw new StorageInconsistentError('Storage guard missing')
    }
  }
}
