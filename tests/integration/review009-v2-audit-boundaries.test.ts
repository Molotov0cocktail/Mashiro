import { randomUUID } from 'node:crypto'
import { mkdtempSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { SqliteStore } from '../../src/main/data/sqlite.js'
import { AssistantRepository } from '../../src/main/assistant/assistant-repository.js'
import { MemoryService } from '../../src/main/memory/memory-service.js'
import { RetentionPolicyService } from '../../src/main/retention/retention-policy-service.js'

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'mashiro-review009-v2-race-'))
  const store = new SqliteStore(join(root, 'state.sqlite'))
  const assistantId = new AssistantRepository(store).create('独立审计反例', 0).assistants[0]!.id
  const memory = new MemoryService(store, join(root, 'memory'), () => ({
    fingerprint: 'synthetic',
    display: 'synthetic'
  }))
  const remember = () =>
    memory.mutate({
      protocolVersion: 1,
      assistantId,
      commandId: randomUUID(),
      mutation: {
        action: 'remember' as const,
        targetId: null,
        expectedVersion: null,
        kind: 'continuity' as const,
        scope: 'assistant' as const,
        title: '审计',
        markdown: 'AAAA',
        nature: 'faithful-summary' as const,
        event: null
      }
    })
  const made = remember()
  if (!made.ok) throw Error('FIXTURE')
  vi.spyOn(memory, 'watchRetentionFiles').mockImplementation(() => () => undefined)
  const policy = new RetentionPolicyService(store, memory, () => undefined)
  memory.setRetentionPolicyGuard(policy)
  const complete = () => vi.waitFor(() => expect(policy.snapshot().audit.state).toBe('COMPLETE'))
  return {
    root,
    store,
    memory,
    policy,
    remember,
    complete,
    id: made.data.objectId,
    close: () => {
      policy.close()
      store.close()
      vi.restoreAllMocks()
    }
  }
}

it('missing watch events do not allow a same-size external edit with restored mtime to retain KNOWN admission', async () => {
  const f = fixture()
  try {
    await f.complete()
    const file = String(
      f.store.database
        .prepare('SELECT file_name FROM memory_versions WHERE object_id=? AND version=1')
        .get(f.id)!.file_name
    )
    const path = join(f.root, 'memory', file)
    const before = statSync(path)
    writeFileSync(path, 'BBBB')
    utimesSync(path, before.atime, before.mtime)
    expect(f.remember()).toMatchObject({ ok: false, error: { code: 'MEASUREMENT_UNKNOWN' } })
    expect(f.store.database.prepare('SELECT count(*) AS n FROM memory_objects').get()!.n).toBe(1)
  } finally {
    f.close()
  }
})

it.each(['delete', 'suppress'] as const)(
  'an old measured result cannot restore a %s commit or its occupied capacity',
  async (action) => {
    const f = fixture()
    try {
      const real = f.memory.retentionMeasurement.bind(f.memory)
      let applied = false
      vi.spyOn(f.memory, 'retentionMeasurement').mockImplementation((record) => {
        const measured = real(record)
        if (!applied) {
          applied = true
          f.store.transaction(() => {
            if (action === 'delete')
              f.store.database.prepare('DELETE FROM memory_objects WHERE id=?').run(record.id)
            else
              f.store.database
                .prepare('UPDATE memory_objects SET record_json=? WHERE id=?')
                .run(
                  JSON.stringify({ ...record, state: 'suppressed', retention: 'trash' }),
                  record.id
                )
            f.store.database.exec(
              'UPDATE retention_state SET generation=generation+1,epoch=epoch+1'
            )
          })
          f.policy.invalidateAudit()
        }
        return measured
      })
      await f.complete()
      expect(applied).toBe(true)
      expect(f.policy.snapshot().usage).toMatchObject({ acceptedBytes: 0, unknownObjects: 0 })
      const ledger = f.store.database
        .prepare('SELECT * FROM retention_policy_objects WHERE object_id=?')
        .get(f.id)
      if (action === 'delete') expect(ledger).toBeUndefined()
      else expect(ledger).toMatchObject({ zone: 'trash', measurement_state: 'EXCLUDED' })
    } finally {
      f.close()
    }
  }
)

it('deleting the last accepted object immediately releases the already measured ledger rather than leaving a ghost', async () => {
  const f = fixture()
  try {
    await f.complete()
    expect(f.policy.snapshot().usage.acceptedBytes).toBe(4)
    f.store.transaction(() => {
      f.store.database.exec(
        'DELETE FROM memory_objects; UPDATE retention_state SET generation=generation+1,epoch=epoch+1'
      )
    })
    f.policy.invalidateAudit()
    await f.complete()
    expect(f.policy.snapshot().usage).toMatchObject({ acceptedBytes: 0, unknownObjects: 0 })
    expect(
      f.store.database.prepare('SELECT count(*) AS n FROM retention_policy_objects').get()!.n
    ).toBe(0)
  } finally {
    f.close()
  }
})
