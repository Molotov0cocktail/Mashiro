import { randomUUID } from 'node:crypto'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { AssistantRepository } from '../../src/main/assistant/assistant-repository.js'
import { SqliteStore } from '../../src/main/data/sqlite.js'
import { MemoryService } from '../../src/main/memory/memory-service.js'
import { RetentionService } from '../../src/main/retention/retention-service.js'

it('an expiry candidate captured before a real correction cannot move the corrected version', async () => {
  const root = mkdtempSync(join(tmpdir(), 'mashiro-review009-expiry-'))
  const store = new SqliteStore(join(root, 'state.sqlite'))
  const assistantId = new AssistantRepository(store).create('独立到期反例', 0).assistants[0]!.id
  const memory = new MemoryService(store, join(root, 'memory'), () => ({
    fingerprint: 'synthetic',
    display: 'synthetic'
  }))
  let now = new Date('2026-01-01T00:00:00.000Z')
  const retention = new RetentionService(
    store,
    join(root, 'memory'),
    memory,
    undefined,
    undefined,
    undefined,
    () => now
  )
  try {
    const common = {
      kind: 'continuity' as const,
      scope: 'assistant' as const,
      title: '真实纠正',
      nature: 'faithful-summary' as const,
      event: null
    }
    const made = memory.mutate({
      protocolVersion: 1,
      assistantId,
      commandId: randomUUID(),
      mutation: {
        ...common,
        action: 'remember',
        targetId: null,
        expectedVersion: null,
        markdown: '最初正文'
      }
    })
    if (!made.ok) throw Error('FIXTURE_CREATE')
    const id = made.data.objectId
    expect(
      await retention.move({
        protocolVersion: 1,
        assistantId,
        commandId: randomUUID(),
        id,
        expectedVersion: 1,
        expectedEpoch: retention.epoch,
        zone: 'staging'
      })
    ).toMatchObject({ ok: true })
    now = new Date('2026-04-02T00:00:00.000Z')
    const pending = retention.runPolicy({ protocolVersion: 1, assistantId, expectedRevision: 1 })
    expect(
      memory.mutate({
        protocolVersion: 1,
        assistantId,
        commandId: randomUUID(),
        mutation: {
          ...common,
          action: 'correct',
          targetId: id,
          expectedVersion: 2,
          markdown: '在到期提交前纠正的新正文'
        }
      })
    ).toMatchObject({ ok: true })
    expect(await pending).toMatchObject({ ok: true })
    const actual = JSON.parse(
      String(
        store.database.prepare('SELECT record_json FROM memory_objects WHERE id=?').get(id)!
          .record_json
      )
    )
    expect(actual).toMatchObject({ objectVersion: 3, retention: 'staging', state: 'active' })
    expect(
      store.database
        .prepare("SELECT count(*) AS n FROM retention_policy_receipts WHERE state='MOVED'")
        .get()!.n
    ).toBe(0)
  } finally {
    retention.close()
    store.close()
  }
})
