import type { DatabaseSync } from 'node:sqlite'

export const schemaVersion = 1

const requiredTables = ['assistants', 'assistant_state'] as const
const requiredTriggers = [
  'assistant_no_delete',
  'assistant_state_no_delete',
  'assistant_no_archive_primary',
  'assistant_no_archive_current',
  'assistant_state_primary_active',
  'assistant_state_current_active'
] as const

const ddl = [
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
      database.exec(ddl)
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
