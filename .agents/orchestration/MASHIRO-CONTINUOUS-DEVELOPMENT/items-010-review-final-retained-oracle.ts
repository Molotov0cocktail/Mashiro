import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { afterEach, expect, it } from 'vitest'
import { AssistantService } from '../../src/main/assistant/assistant-service.js'
import { SqliteStore } from '../../src/main/data/sqlite.js'
import { MemoryService } from '../../src/main/memory/memory-service.js'
import { RetentionService } from '../../src/main/retention/retention-service.js'
import { TimelineRepository } from '../../src/main/provider/timeline-repository.js'
import { ItemService } from '../../src/main/item/item-service.js'
import { emptyItem } from '../../src/main/item/item-intent.js'
const cleanup: (() => void)[] = []
afterEach(() =>
  cleanup
    .splice(0)
    .reverse()
    .forEach((f) => f())
)
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'mashiro-item-retention-'))
  cleanup.push(() => rmSync(root, { recursive: true, force: true }))
  const path = join(root, 'state.sqlite'),
    assistants = AssistantService.open(path),
    ids: string[] = []
  for (let i = 0; i < 2; i++) {
    const r = assistants.create({
      protocolVersion: 1,
      displayName: '合成' + i,
      expectedStateRevision: i
    })
    if (!r.ok) throw Error('fixture')
    ids.push(r.data.assistants.find((a) => a.displayName === '合成' + i)!.id)
  }
  assistants.close()
  const store = new SqliteStore(path)
  cleanup.push(() => store.close())
  const memory = new MemoryService(store, join(root, 'memory'), () => ({
    fingerprint: 'endpoint',
    display: '合成'
  }))
  const items = new ItemService(
    store,
    () => ({ fingerprint: 'endpoint', display: '合成' }),
    (s, a, f, v) => memory.assertSource(s, a, f, [], v)
  )
  memory.setDomainSourceCheck((s, a, f, v) => items.assertSource(s, a, f, v))
  const retention = new RetentionService(store, join(root, 'memory'), memory)
  cleanup.push(() => retention.close())
  const timeline = new TimelineRepository(store),
    requestId = randomUUID()
  timeline.insert(
    ids[0]!,
    (['user', 'assistant'] as const).map((role) => ({
      id: randomUUID(),
      requestId,
      role,
      content: '私有合成源',
      status: 'completed' as const,
      createdAt: new Date().toISOString(),
      saved: true
    }))
  )
  for (const id of ids) {
    store.database.prepare('INSERT INTO history_permissions VALUES(?,1,1)').run(id)
    store.database.prepare('INSERT INTO history_recipient_grants VALUES(?,?,1)').run(id, 'endpoint')
    items.setPermissions({
      protocolVersion: 1,
      assistantId: id,
      expectedVersion: 0,
      read: true,
      write: true,
      propose: true,
      receive: true
    })
  }
  const source = { type: 'user-round' as const, id: requestId, assistantId: ids[0]!, version: 1 }
  return { store, memory, items, retention, ids, source, requestId }
}
it('independent: a retained direct source cannot mask withdrawal of a transitive source', async () => {
  const f = fixture(), a = f.ids[0]!, b = f.ids[1]!
  const leaf = { type: 'manual' as const, id: randomUUID(), assistantId: a, version: 1 }
  f.memory.addDependencies('user-round', f.requestId, 1, [leaf])
  const receipt = f.items.applyMutation(a, randomUUID(), { action: 'create', content: emptyItem('task', '保留但可撤回') }, [f.source])
  const preview = await f.retention.preview({ protocolVersion: 1, assistantId: a, intent: 'purge-assistant', target: { type: 'assistant', replacementAssistantId: b } })
  if (!preview.ok) throw Error('preview')
  expect(preview.data.blockers).toEqual([])
  expect(await f.retention.confirm({ protocolVersion: 1, assistantId: a, commandId: randomUUID(), previewId: preview.data.id, nonce: preview.data.nonce, accept: true })).toMatchObject({ ok: true })
  const ref = { type: 'item' as const, id: receipt.objectId!, version: 1, assistantId: a }
  expect(() => f.items.assertSource(ref, b, 'endpoint')).not.toThrow()
  f.store.database.prepare("INSERT INTO memory_suppressions VALUES('manual',?,1,'withdrawal',?)").run(leaf.id, leaf.id)
  expect(() => f.items.assertSource(ref, b, 'endpoint')).toThrow()
})