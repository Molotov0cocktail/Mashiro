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
it('purges only originating unaccepted proposals while formal items retain exact old recipient access', async () => {
  const f = fixture(),
    a = f.ids[0]!,
    b = f.ids[1]!
  const pending = f.items.proposeLocal(a, randomUUID(), emptyItem('task', '私有待确认'), [f.source])
  const accepted = f.items.proposeLocal(a, randomUUID(), emptyItem('task', '正式保留'), [f.source])
  const foreign = f.items.proposeLocal(b, randomUUID(), emptyItem('task', '其他助手待确认'), [])
  expect(
    f.items.proposalAction({
      protocolVersion: 1,
      assistantId: a,
      commandId: randomUUID(),
      id: accepted.objectId,
      expectedVersion: 1,
      action: 'accept'
    }).ok
  ).toBe(true)
  const q = f.items.query({ protocolVersion: 1, assistantId: b })
  if (!q.ok) throw Error('query')
  const formal = q.data.items[0]!
  const preview = await f.retention.preview({
    protocolVersion: 1,
    assistantId: a,
    intent: 'purge-assistant',
    target: { type: 'assistant', replacementAssistantId: b }
  })
  expect(preview).toMatchObject({
    ok: true,
    data: {
      itemImpact: {
        items: [{ id: formal.id }],
        proposals: expect.arrayContaining([{ id: pending.objectId, version: 1, delete: true }])
      }
    }
  })
  if (!preview.ok) throw Error('preview')
  expect(preview.data.blockers).toEqual([])
  const confirmation = await f.retention.confirm({
    protocolVersion: 1,
    assistantId: a,
    commandId: randomUUID(),
    previewId: preview.data.id,
    nonce: preview.data.nonce,
    accept: true
  })
  expect(confirmation.ok).toBe(true)
  expect(
    f.store.database.prepare('SELECT 1 FROM item_proposals WHERE id=?').get(pending.objectId!)
  ).toBeUndefined()
  expect(
    f.store.database.prepare('SELECT 1 FROM item_proposals WHERE id=?').get(foreign.objectId!)
  ).toBeDefined()
  expect(f.items.query({ protocolVersion: 1, assistantId: b })).toMatchObject({
    ok: true,
    data: { formalCount: 1, items: [{ content: { title: '正式保留' }, sourceUnavailable: true }] }
  })
  const ref = { type: 'item' as const, id: formal.id, version: formal.version, assistantId: a }
  expect(() => f.items.assertSource(ref, b, 'endpoint')).not.toThrow()
  expect(() => f.items.assertSource(ref, b, 'new-endpoint')).toThrow()
  f.store.database
    .prepare("INSERT INTO memory_suppressions VALUES('user-round',?,1,'withdrawal',?)")
    .run(f.requestId, f.requestId)
  expect(() => f.items.assertSource(ref, b, 'endpoint')).toThrow()
})
it('invalidates purge preview after a new proposal and blocks a stale accept', async () => {
  const f = fixture(),
    a = f.ids[0]!,
    b = f.ids[1]!
  const p = await f.retention.preview({
    protocolVersion: 1,
    assistantId: a,
    intent: 'purge-assistant',
    target: { type: 'assistant', replacementAssistantId: b }
  })
  if (!p.ok) throw Error('preview')
  f.items.proposeLocal(a, randomUUID(), emptyItem('task', '新提案'), [])
  expect(
    await f.retention.confirm({
      protocolVersion: 1,
      assistantId: a,
      commandId: randomUUID(),
      previewId: p.data.id,
      nonce: p.data.nonce,
      accept: true
    })
  ).toMatchObject({ ok: false, error: { code: 'STALE_PREVIEW' } })
})
