import { randomUUID } from 'node:crypto'
import { mkdtempSync, realpathSync, rmSync, lstatSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { AssistantService } from '../../src/main/assistant/assistant-service.js'
import { SqliteStore } from '../../src/main/data/sqlite.js'
import { MemoryService } from '../../src/main/memory/memory-service.js'
import { RetentionService } from '../../src/main/retention/retention-service.js'

const cleanups: (() => void)[] = []
afterEach(() =>
  cleanups
    .splice(0)
    .reverse()
    .forEach((cleanup) => cleanup())
)

function fixture() {
  const base = realpathSync.native(tmpdir())
  const root = mkdtempSync(join(base, 'mashiro-review009-'))
  const assistants = AssistantService.open(join(root, 'state.sqlite'))
  const created = assistants.create({
    protocolVersion: 1,
    displayName: '合成容量审核',
    expectedStateRevision: 0
  })
  if (!created.ok) throw Error('assistant fixture')
  const assistantId = created.data.assistants[0]!.id
  const store = new SqliteStore(join(root, 'state.sqlite'))
  const memory = new MemoryService(store, join(root, 'memory'), () => ({
    fingerprint: 'synthetic',
    display: 'synthetic'
  }))
  const retention = new RetentionService(store, join(root, 'memory'), memory)
  cleanups.push(() => {
    retention.close()
    store.close()
    assistants.close()
    if (dirname(root) !== base || lstatSync(root).isSymbolicLink())
      throw Error('unsafe fixture root')
    rmSync(root, { recursive: true, force: true })
  })
  const mutation = (
    action: 'remember' | 'correct',
    id: string | null,
    version: number | null,
    markdown: string
  ) =>
    memory.mutate({
      protocolVersion: 1,
      assistantId,
      commandId: randomUUID(),
      mutation: {
        action,
        targetId: id,
        expectedVersion: version,
        kind: 'continuity',
        scope: 'assistant',
        title: '合成记忆',
        markdown,
        nature: 'faithful-summary',
        event: null
      }
    })
  const saved = mutation('remember', null, null, 'before')
  if (!saved.ok || !saved.data.objectId) throw Error('memory fixture')
  const id = saved.data.objectId
  const move = (zone: 'persistent' | 'staging' | 'trash', version: number) =>
    retention.move({
      protocolVersion: 1,
      assistantId,
      commandId: randomUUID(),
      id,
      expectedVersion: version,
      expectedEpoch: retention.epoch,
      zone
    })
  const record = () =>
    JSON.parse(
      (
        store.database.prepare('SELECT record_json FROM memory_objects WHERE id=?').get(id) as {
          record_json: string
        }
      ).record_json
    )
  return { id, mutation, move, record }
}

it('ordinary correction preserves the user-selected staging zone', async () => {
  const f = fixture()
  expect(await f.move('staging', 1)).toMatchObject({ ok: true })
  expect(f.mutation('correct', f.id, 2, 'corrected')).toMatchObject({ ok: true })
  expect(f.record()).toMatchObject({ retention: 'staging', objectVersion: 3 })
})

it('a move whose file read crosses a newer correction returns a stale transition', async () => {
  const f = fixture()
  const pendingMove = f.move('staging', 1)
  expect(f.mutation('correct', f.id, 1, 'newer accepted version')).toMatchObject({ ok: true })
  expect(await pendingMove).toMatchObject({ ok: false, error: { code: 'STALE_PREVIEW' } })
  expect(f.record()).toMatchObject({ retention: 'persistent', objectVersion: 2 })
})
