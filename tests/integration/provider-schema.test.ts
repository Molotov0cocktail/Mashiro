import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { AssistantService } from '../../src/main/assistant/assistant-service.js'
import { SqliteStore } from '../../src/main/data/sqlite.js'

const roots: string[] = []
function databasePath(): string {
  const root = mkdtempSync(join(tmpdir(), 'mashiro-provider-schema-'))
  roots.push(root)
  return join(root, 'mashiro.sqlite')
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('provider schema v2', () => {
  it('creates v2 storage and preserves assistant identities across restart', () => {
    const path = databasePath()
    const first = AssistantService.open(path)
    const created = first.create({
      protocolVersion: 1,
      displayName: 'Provider assistant',
      expectedStateRevision: 0
    })
    expect(created.ok).toBe(true)
    const id = created.ok ? created.data.assistants[0]!.id : ''
    first.close()

    const database = new DatabaseSync(path)
    expect(
      (database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version
    ).toBe(2)
    expect(
      database
        .prepare(
          "SELECT count(*) AS value FROM sqlite_master WHERE type = 'table' AND name IN ('provider_connections', 'assistant_provider_bindings')"
        )
        .get()
    ).toEqual({ value: 2 })
    database.close()

    const second = AssistantService.open(path)
    const snapshot = second.list({ protocolVersion: 1 })
    expect(snapshot.ok && snapshot.data.assistants[0]!.id).toBe(id)
    second.close()
  })

  it('rolls back the first v2 DDL when the second fails and preserves real v1 state', () => {
    const path = databasePath()
    const service = AssistantService.open(path)
    const created = service.create({
      protocolVersion: 1,
      displayName: 'Legacy assistant',
      expectedStateRevision: 0
    })
    if (!created.ok) throw new Error('legacy fixture failed')
    const assistantId = created.data.assistants[0]!.id
    service.close()

    const legacy = new DatabaseSync(path)
    legacy.exec('DROP TABLE assistant_provider_bindings')
    legacy.exec('DROP TABLE provider_connections')
    legacy.exec('CREATE TABLE assistant_provider_bindings (broken TEXT)')
    legacy.exec('PRAGMA user_version = 1')
    legacy.close()

    expect(() => new SqliteStore(path)).toThrow()

    const database = new DatabaseSync(path)
    expect(
      (database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version
    ).toBe(1)
    expect(
      database
        .prepare(
          "SELECT count(*) AS value FROM sqlite_master WHERE type = 'table' AND name = 'provider_connections'"
        )
        .get()
    ).toEqual({ value: 0 })
    expect(
      database
        .prepare(
          "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'assistant_provider_bindings'"
        )
        .get()
    ).toEqual({ sql: 'CREATE TABLE assistant_provider_bindings (broken TEXT)' })
    expect(database.prepare('SELECT id, display_name, version FROM assistants').get()).toEqual({
      id: assistantId,
      display_name: 'Legacy assistant',
      version: 1
    })
    expect(
      database
        .prepare(
          'SELECT primary_assistant_id, current_assistant_id, revision FROM assistant_state WHERE singleton = 1'
        )
        .get()
    ).toEqual({
      primary_assistant_id: assistantId,
      current_assistant_id: assistantId,
      revision: 1
    })
    database.close()
  })
})
