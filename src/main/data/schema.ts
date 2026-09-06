import type { DatabaseSync } from 'node:sqlite'

export const schemaVersion = 3

const requiredTables = [
  'assistants',
  'assistant_state',
  'provider_connections',
  'assistant_provider_bindings'
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
