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
it('independent: public withdrawal of shared memory overrides a retained indirect round', async () => {
  const f = fixture(), a = f.ids[0]!, b = f.ids[1]!
  for (const id of [a, b]) {
    f.store.database.prepare("INSERT OR REPLACE INTO memory_permissions VALUES(?,'global',1,1,1,0)").run(id)
    f.store.database.prepare("INSERT OR REPLACE INTO memory_recipients VALUES(?,'global',?,1)").run(id, 'endpoint')
  }
  const saved = f.memory.mutate({ protocolVersion: 1, assistantId: b, commandId: randomUUID(), mutation: { action: 'remember', targetId: null, expectedVersion: null, kind: 'user', scope: 'global', title: '共享上游', markdown: '合成共享依据', nature: 'faithful-summary', event: null } })
  if (!saved.ok) throw Error('memory')
  const leaf = { type: 'memory' as const, id: saved.data.objectId, assistantId: b, version: saved.data.objectVersion }
  f.memory.addDependencies('user-round', f.requestId, 1, [leaf])
  const receipt = f.items.applyMutation(a, randomUUID(), { action: 'create', content: emptyItem('task', '间接依据') }, [f.source])
  const purge = await f.retention.preview({ protocolVersion: 1, assistantId: a, intent: 'purge-assistant', target: { type: 'assistant', replacementAssistantId: b } })
  if (!purge.ok) throw Error('purge preview')
  expect(purge.data.blockers).toEqual([])
  expect(await f.retention.confirm({ protocolVersion: 1, assistantId: a, commandId: randomUUID(), previewId: purge.data.id, nonce: purge.data.nonce, accept: true })).toMatchObject({ ok: true })
  for (let attempt = 0; attempt < 100; attempt++) {
    const jobs = await f.retention.jobs({ protocolVersion: 1 })
    if (!jobs.ok) throw Error('jobs')
    if (jobs.data.jobs.every((job) => job.state === 'COMPLETED')) break
    if (attempt === 99) throw Error('cleanup did not settle')
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  const ref = { type: 'item' as const, id: receipt.objectId!, version: 1, assistantId: a }
  expect(() => f.items.assertSource(ref, b, 'endpoint')).not.toThrow()
  const withdrawal = await f.retention.preview({ protocolVersion: 1, assistantId: b, intent: 'withdraw-information', target: { type: 'memories', objects: [{ id: leaf.id, version: leaf.version }] } })
  if (!withdrawal.ok) throw Error(JSON.stringify(withdrawal))
  expect(withdrawal.data.blockers).toEqual([])
  expect(await f.retention.confirm({ protocolVersion: 1, assistantId: b, commandId: randomUUID(), previewId: withdrawal.data.id, nonce: withdrawal.data.nonce, accept: true })).toMatchObject({ ok: true })
  expect(() => f.items.assertSource(ref, b, 'endpoint')).toThrow()
})