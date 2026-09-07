import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { SqliteStore } from '../../src/main/data/sqlite.js'
import { AssistantRepository } from '../../src/main/assistant/assistant-repository.js'
import { ToolRepository } from '../../src/main/provider/tool-repository.js'
import type { ToolSegment } from '../../src/main/provider/tool-repository.js'
it('real Repository participating updates retain full batch rollback and the 384 receipt window', () => {
  const root = mkdtempSync(join(tmpdir(), 'mashiro-review018-transaction-'))
  const store = new SqliteStore(join(root, 'state.sqlite'))
  try {
    const assistantId = new AssistantRepository(store).create('合成事务', 0).assistants[0]!.id
    const repository = new ToolRepository(store)
    const append = (participating: boolean, createdAt: string) => {
      const segment: ToolSegment = {
        id: randomUUID(),
        assistantId,
        requestId: randomUUID(),
        endpointFingerprint: 'synthetic',
        model: 'synthetic',
        adapterVersion: 'synthetic',
        mode: 'standard-non-preserved',
        messages: [],
        createdAt
      }
      repository.create(segment)
      const prepared = repository.prepare(
        segment,
        randomUUID(),
        {
          id: randomUUID(),
          type: 'function',
          function: { name: 'get_current_time', arguments: '{}' }
        },
        'local-user-intent'
      )
      const dispatching = { ...prepared, state: 'DISPATCHING' as const, updatedAt: createdAt }
      repository.update(dispatching, undefined, participating)
      const succeeded = { ...dispatching, state: 'SUCCEEDED' as const }
      repository.update(succeeded, JSON.stringify({ synthetic: true }), participating)
      repository.messages(segment.id, [], true)
      return succeeded
    }
    const old = append(false, '2026-01-01T00:00:00.000Z')
    const tables = [
      'protocol_segments',
      'tool_operations',
      'protocol_results',
      'usage_attempts',
      'background_attempts',
      'steward_attempts'
    ]
    const snapshot = () =>
      tables.map((table) => ({
        table,
        rows: store.database.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()
      }))
    const before = snapshot()
    expect(() => store.transaction(() => append(false, '2026-09-08T00:00:00.000Z'))).toThrow(
      'cannot start a transaction within a transaction'
    )
    expect(snapshot()).toEqual(before)
    expect(() =>
      store.transaction(() => {
        for (let i = 0; i < 384; i++) append(true, '2026-09-08T00:00:00.000Z')
        throw Error('SYNTHETIC_FINAL_GUARD_FAILURE')
      })
    ).toThrow('SYNTHETIC_FINAL_GUARD_FAILURE')
    expect(snapshot()).toEqual(before)
    store.transaction(() => {
      for (let i = 0; i < 384; i++) append(true, '2026-09-08T00:00:00.000Z')
    })
    expect(repository.read(assistantId)).toHaveLength(384)
    expect(repository.read(assistantId).some((row) => row.operationId === old.operationId)).toBe(
      false
    )
    expect(repository.read(assistantId, old.requestId)).toEqual([old])
    const after = snapshot()
    for (let i = 0; i < 3; i++) expect(after[i]!.rows).toHaveLength(before[i]!.rows.length + 384)
    expect(after.slice(3)).toEqual(before.slice(3))
    expect(store.database.prepare('PRAGMA integrity_check').get()!.integrity_check).toBe('ok')
    expect(store.database.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  } finally {
    store.close()
    rmSync(root, { recursive: true, force: true })
  }
})
