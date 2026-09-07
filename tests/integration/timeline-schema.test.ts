import { removeRetentionFixture } from './retention-legacy-fixture.js'
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { AssistantService } from '../../src/main/assistant/assistant-service.js'
import { SqliteStore } from '../../src/main/data/sqlite.js'
import { CredentialVault } from '../../src/main/provider/credential-vault.js'

const roots: string[] = []
const connectionId = '00000000-0000-4000-8000-000000000101'
const protector = {
  isEncryptionAvailable: () => true,
  encryptString: (value: string) => Buffer.from(Buffer.from(value).map((byte) => byte ^ 0xa5)),
  decryptString: (value: Buffer) => Buffer.from(value.map((byte) => byte ^ 0xa5)).toString()
}

type V2Evidence = {
  assistants: unknown[]
  state: unknown
  connections: unknown[]
  bindings: unknown[]
}

function populatedV2(): {
  path: string
  evidence: V2Evidence
  credentialDirectory: string
  credentialBytes: Buffer
} {
  const root = mkdtempSync(join(tmpdir(), 'mashiro-timeline-schema-'))
  roots.push(root)
  const path = join(root, 'mashiro.sqlite')
  const assistants = AssistantService.open(path)
  const first = assistants.create({
    protocolVersion: 1,
    displayName: 'Legacy archived',
    expectedStateRevision: 0
  })
  if (!first.ok) throw new Error('legacy first assistant fixture failed')
  const firstId = first.data.assistants[0]!.id
  const second = assistants.create({
    protocolVersion: 1,
    displayName: 'Legacy current',
    expectedStateRevision: 1
  })
  if (!second.ok) throw new Error('legacy second assistant fixture failed')
  const current = second.data.assistants.find((assistant) => assistant.id !== firstId)!
  const switched = assistants.switch({
    protocolVersion: 1,
    assistantId: current.id,
    expectedStateRevision: 2
  })
  if (!switched.ok) throw new Error('legacy switch fixture failed')
  const primary = assistants.setPrimary({
    protocolVersion: 1,
    assistantId: current.id,
    expectedAssistantVersion: current.version,
    expectedStateRevision: 3
  })
  if (!primary.ok) throw new Error('legacy primary fixture failed')
  const archived = assistants.archive({
    protocolVersion: 1,
    assistantId: firstId,
    expectedAssistantVersion: 1,
    expectedStateRevision: 4
  })
  if (!archived.ok) throw new Error('legacy archive fixture failed')
  assistants.close()

  const database = new DatabaseSync(path)
  removeRetentionFixture(database)
  database.exec(
    'DROP TABLE memory_pending; DROP TABLE memory_cleanup; DROP TABLE memory_previews; DROP TABLE memory_suppressions; DROP TABLE memory_index; DROP TABLE memory_recipients; DROP TABLE memory_permissions; DROP TABLE memory_dependencies; DROP TABLE memory_commands; DROP TABLE memory_versions; DROP TABLE memory_objects; DROP TABLE provider_capability_evidence; DROP TABLE protocol_results; DROP TABLE tool_operations; DROP TABLE protocol_segments; DROP TABLE timeline_sources; DROP TABLE history_recipient_grants; DROP TABLE history_permissions; DROP TABLE timeline_messages'
  )
  database.exec('PRAGMA user_version = 2')
  database
    .prepare(
      'INSERT INTO provider_connections(id, display_name, base_url, enabled, has_persistent_credential, created_at, updated_at, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .run(
      connectionId,
      'Legacy Provider',
      'https://legacy.example/v1',
      1,
      1,
      '2026-09-05T00:00:00.000Z',
      '2026-09-05T01:00:00.000Z',
      3
    )
  database
    .prepare(
      'INSERT INTO assistant_provider_bindings(assistant_id, connection_id, model, updated_at, version) VALUES (?, ?, ?, ?, ?)'
    )
    .run(current.id, connectionId, 'legacy-model', '2026-09-05T02:00:00.000Z', 2)
  const evidence = readV2Evidence(database)
  database.close()

  const credentialDirectory = join(root, 'credentials')
  const vault = new CredentialVault(credentialDirectory, protector)
  vault.setPersistent(connectionId, 'v2-protected-secret')
  const credentialBytes = readFileSync(join(credentialDirectory, connectionId + '.credential'))
  if (credentialBytes.includes(Buffer.from('v2-protected-secret'))) {
    throw new Error('credential fixture was not protected')
  }
  return { path, evidence, credentialDirectory, credentialBytes }
}

function readV2Evidence(database: DatabaseSync): V2Evidence {
  return {
    assistants: database
      .prepare(
        'SELECT id, display_name, created_at, updated_at, archived_at, version FROM assistants ORDER BY created_at, id'
      )
      .all(),
    state: database
      .prepare(
        'SELECT primary_assistant_id, current_assistant_id, revision FROM assistant_state WHERE singleton = 1'
      )
      .get(),
    connections: database
      .prepare(
        'SELECT id, display_name, base_url, enabled, has_persistent_credential, created_at, updated_at, version FROM provider_connections ORDER BY id'
      )
      .all(),
    bindings: database
      .prepare(
        'SELECT assistant_id, connection_id, model, updated_at, version FROM assistant_provider_bindings ORDER BY assistant_id'
      )
      .all()
  }
}

function expectCredentialPreserved(item: ReturnType<typeof populatedV2>): void {
  expect(readFileSync(join(item.credentialDirectory, connectionId + '.credential'))).toEqual(
    item.credentialBytes
  )
  expect(new CredentialVault(item.credentialDirectory, protector).get(connectionId)).toBe(
    'v2-protected-secret'
  )
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('timeline schema v3', () => {
  it('upgrades a populated v2 database without changing assistants, state, connections, bindings, or protected credentials', () => {
    const item = populatedV2()
    const upgraded = new SqliteStore(item.path)
    upgraded.close()

    const database = new DatabaseSync(item.path)
    expect(
      (database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version
    ).toBe(13)
    expect(readV2Evidence(database)).toEqual(item.evidence)
    expectCredentialPreserved(item)
    expect(database.prepare('SELECT count(*) AS value FROM timeline_messages').get()).toEqual({
      value: 0
    })
    expect(
      database
        .prepare(
          "SELECT tbl_name FROM sqlite_master WHERE type = 'index' AND name = 'timeline_assistant_sequence'"
        )
        .get()
    ).toEqual({ tbl_name: 'timeline_messages' })
    database.close()
  })

  it('rolls back all v3 changes after a later DDL failure and preserves populated v2 state', () => {
    const item = populatedV2()
    const collision = new DatabaseSync(item.path)
    collision.exec('CREATE TABLE migration_collision(value TEXT)')
    collision.exec('CREATE INDEX timeline_assistant_sequence ON migration_collision(value)')
    collision.close()

    expect(() => new SqliteStore(item.path)).toThrow()

    const database = new DatabaseSync(item.path)
    expect(
      (database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version
    ).toBe(2)
    expect(readV2Evidence(database)).toEqual(item.evidence)
    expectCredentialPreserved(item)
    expect(
      database
        .prepare(
          "SELECT count(*) AS value FROM sqlite_master WHERE type = 'table' AND name = 'timeline_messages'"
        )
        .get()
    ).toEqual({ value: 0 })
    expect(
      database
        .prepare(
          "SELECT tbl_name FROM sqlite_master WHERE type = 'index' AND name = 'timeline_assistant_sequence'"
        )
        .get()
    ).toEqual({ tbl_name: 'migration_collision' })
    database.close()
  })
})
