import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { it, expect } from 'vitest'
import { SqliteStore } from '../../src/main/data/sqlite.js'
it('persists independent steward actor and shared candidate schema without inventing an assistant', () => {
  const directory = mkdtempSync(join(tmpdir(), 'mashiro-steward-schema-'))
  const store = new SqliteStore(join(directory, 'state.sqlite'))
  try {
    expect(store.database.prepare('PRAGMA user_version').get()!.user_version).toBe(15)
    expect(store.database.prepare('SELECT count(*) AS n FROM assistants').get()!.n).toBe(0)
    expect(store.database.prepare('SELECT count(*) AS n FROM steward_configs').get()!.n).toBe(0)
    expect(
      store.database
        .prepare('PRAGMA table_info(memory_pending)')
        .all()
        .map((r) => r.name)
    ).toContain('entry_kind')
  } finally {
    store.close()
    rmSync(directory, { recursive: true, force: true })
  }
})
