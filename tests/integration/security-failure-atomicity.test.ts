import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { AssistantService } from '../../src/main/assistant/assistant-service.js'

const roots: string[] = []
const services: AssistantService[] = []

function openService(): { service: AssistantService; databasePath: string } {
  const root = mkdtempSync(join(tmpdir(), 'mashiro-f1-security-'))
  roots.push(root)
  const databasePath = join(root, 'mashiro.sqlite')
  const service = AssistantService.open(databasePath)
  services.push(service)
  return { service, databasePath }
}

afterEach(() => {
  for (const service of services.splice(0)) {
    try {
      service.close()
    } catch {
      // A test may close a service before inspecting the database independently.
    }
  }
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('trusted boundary and failure atomicity', () => {
  it('rejects malformed and hostile inputs without changing storage', () => {
    const { service } = openService()
    const initial = service.list({ protocolVersion: 1 })
    expect(initial).toMatchObject({ ok: true, data: { assistants: [], stateRevision: 0 } })

    const attempts = [
      { protocolVersion: 2, displayName: 'A', expectedStateRevision: 0 },
      { protocolVersion: 1, displayName: 'A', expectedStateRevision: 0, isPrimary: true },
      { protocolVersion: 1, displayName: '   ', expectedStateRevision: 0 },
      { protocolVersion: 1, displayName: `bad\u001fname`, expectedStateRevision: 0 },
      { protocolVersion: 1, displayName: '界'.repeat(81), expectedStateRevision: 0 }
    ]
    for (const attempt of attempts) {
      expect(service.create(attempt)).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } })
    }
    expect(service.list({ protocolVersion: 1 })).toEqual(initial)
  })

  it('rolls back an assistant update when a later statement fails', () => {
    const { service, databasePath } = openService()
    const created = service.create({
      protocolVersion: 1,
      displayName: 'Before',
      expectedStateRevision: 0
    })
    expect(created.ok).toBe(true)
    if (!created.ok) return
    const id = created.data.assistants[0]!.id

    const control = new DatabaseSync(databasePath)
    control.exec(
      "CREATE TRIGGER test_abort_state_revision BEFORE UPDATE OF revision ON assistant_state BEGIN SELECT RAISE(ABORT, 'synthetic_failure'); END;"
    )
    control.close()

    const failed = service.rename({
      protocolVersion: 1,
      assistantId: id,
      displayName: 'After',
      expectedAssistantVersion: 1,
      expectedStateRevision: 1
    })
    expect(failed).toMatchObject({
      ok: false,
      error: { code: 'STORAGE_UNAVAILABLE', message: 'Assistant storage is unavailable' }
    })
    expect(JSON.stringify(failed)).not.toMatch(/synthetic_failure|sqlite|\\|stack/iu)

    const cleanup = new DatabaseSync(databasePath)
    cleanup.exec('DROP TRIGGER test_abort_state_revision')
    cleanup.close()
    expect(service.list({ protocolVersion: 1 })).toMatchObject({
      ok: true,
      data: {
        stateRevision: 1,
        assistants: [{ id, displayName: 'Before', version: 1 }]
      }
    })
  })

  it('keeps one primary when a second connection submits a stale change', () => {
    const { service, databasePath } = openService()
    const first = service.create({ protocolVersion: 1, displayName: 'A', expectedStateRevision: 0 })
    const second = service.create({
      protocolVersion: 1,
      displayName: 'B',
      expectedStateRevision: 1
    })
    expect(first.ok && second.ok).toBe(true)
    if (!first.ok || !second.ok) return
    const a = first.data.assistants[0]!
    const b = second.data.assistants.find((assistant) => assistant.id !== a.id)!
    const other = AssistantService.open(databasePath)
    services.push(other)

    expect(
      service.setPrimary({
        protocolVersion: 1,
        assistantId: b.id,
        expectedAssistantVersion: b.version,
        expectedStateRevision: 2
      })
    ).toMatchObject({ ok: true, data: { primaryAssistantId: b.id, stateRevision: 3 } })
    expect(
      other.setPrimary({
        protocolVersion: 1,
        assistantId: a.id,
        expectedAssistantVersion: a.version,
        expectedStateRevision: 2
      })
    ).toMatchObject({ ok: false, error: { code: 'STALE_WRITE' } })
    expect(other.list({ protocolVersion: 1 })).toMatchObject({
      ok: true,
      data: { primaryAssistantId: b.id, stateRevision: 3 }
    })
  })

  it('refuses newer, unversioned-nonempty, and missing-guard schemas', () => {
    for (const setup of [
      (database: DatabaseSync) => database.exec('PRAGMA user_version = 2'),
      (database: DatabaseSync) => database.exec('CREATE TABLE foreign_object(value TEXT)')
    ]) {
      const root = mkdtempSync(join(tmpdir(), 'mashiro-f1-corrupt-'))
      roots.push(root)
      const databasePath = join(root, 'mashiro.sqlite')
      const database = new DatabaseSync(databasePath)
      setup(database)
      database.close()
      expect(() => AssistantService.open(databasePath)).toThrow()
    }

    const { service, databasePath } = openService()
    service.close()
    const database = new DatabaseSync(databasePath)
    database.exec('DROP TRIGGER assistant_no_delete')
    database.close()
    expect(() => AssistantService.open(databasePath)).toThrow('Storage guard missing')
  })
})
