import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { AssistantService } from '../../src/main/assistant/assistant-service.js'

const roots: string[] = []
const services: AssistantService[] = []
function service(): { value: AssistantService; db: string } {
  const root = mkdtempSync(join(tmpdir(), 'mashiro-f1-unit-'))
  roots.push(root)
  const db = join(root, 'mashiro.sqlite')
  const value = AssistantService.open(db)
  services.push(value)
  return { value, db }
}
afterEach(() => {
  for (const value of services.splice(0)) {
    try {
      value.close()
    } catch {
      /* a persistence test closes its service before reopening */
    }
  }
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('assistant lifecycle', () => {
  it('creates stable identities and preserves them across rename and reopen', () => {
    const { value, db } = service()
    const first = value.create({
      protocolVersion: 1,
      displayName: ' Mashiro ',
      expectedStateRevision: 0
    })
    expect(first.ok).toBe(true)
    if (!first.ok) return
    const id = first.data.assistants[0]!.id
    expect(first.data.primaryAssistantId).toBe(id)
    expect(first.data.currentAssistantId).toBe(id)
    const renamed = value.rename({
      protocolVersion: 1,
      assistantId: id,
      displayName: '真白',
      expectedAssistantVersion: 1,
      expectedStateRevision: 1
    })
    expect(renamed.ok).toBe(true)
    if (!renamed.ok) return
    expect(renamed.data.assistants[0]).toMatchObject({ id, displayName: '真白', version: 2 })
    value.close()
    const reopened = AssistantService.open(db)
    const snapshot = reopened.list({ protocolVersion: 1 })
    expect(snapshot.ok).toBe(true)
    if (snapshot.ok) expect(snapshot.data.assistants[0]).toMatchObject({ id, displayName: '真白' })
    reopened.close()
  })

  it('keeps one primary and archives a non-primary without deleting it', () => {
    const { value } = service()
    const a = value.create({ protocolVersion: 1, displayName: 'A', expectedStateRevision: 0 })
    expect(a.ok).toBe(true)
    if (!a.ok) return
    const b = value.create({ protocolVersion: 1, displayName: 'B', expectedStateRevision: 1 })
    expect(b.ok).toBe(true)
    if (!b.ok) return
    const aid = a.data.assistants[0]!.id
    const second = b.data.assistants.find((x) => x.id !== aid)!
    const switched = value.switch({
      protocolVersion: 1,
      assistantId: second.id,
      expectedStateRevision: 2
    })
    expect(switched.ok).toBe(true)
    const archived = value.archive({
      protocolVersion: 1,
      assistantId: second.id,
      expectedAssistantVersion: 1,
      expectedStateRevision: 3
    })
    expect(archived.ok).toBe(true)
    if (!archived.ok) return
    expect(archived.data.assistants).toHaveLength(2)
    expect(archived.data.assistants.find((x) => x.id === second.id)?.isArchived).toBe(true)
    expect(archived.data.primaryAssistantId).toBe(aid)
    expect(archived.data.currentAssistantId).toBe(aid)
  })

  it('rejects stale, forged, primary archive, and hostile names without mutation', () => {
    const { value } = service()
    const created = value.create({ protocolVersion: 1, displayName: 'A', expectedStateRevision: 0 })
    expect(created.ok).toBe(true)
    if (!created.ok) return
    const before = created.data
    const id = before.assistants[0]!.id
    const stale = value.rename({
      protocolVersion: 1,
      assistantId: id,
      displayName: 'lost',
      expectedAssistantVersion: 1,
      expectedStateRevision: 0
    })
    expect(stale).toMatchObject({ ok: false, error: { code: 'STALE_WRITE' } })
    const forged = value.switch({
      protocolVersion: 1,
      assistantId: '00000000-0000-4000-8000-000000000000',
      expectedStateRevision: 1
    })
    expect(forged).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
    const primary = value.archive({
      protocolVersion: 1,
      assistantId: id,
      expectedAssistantVersion: 1,
      expectedStateRevision: 1
    })
    expect(primary).toMatchObject({ ok: false, error: { code: 'PRIMARY_ARCHIVE_FORBIDDEN' } })
    const injection = value.create({
      protocolVersion: 1,
      displayName: "x'); DROP TABLE assistants;--",
      expectedStateRevision: 1
    })
    expect(injection.ok).toBe(true)
    const invalid = value.create({
      protocolVersion: 1,
      displayName: '\u0000bad',
      expectedStateRevision: 2
    })
    expect(invalid).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } })
  })
})
