import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { SqliteStore } from '../../src/main/data/sqlite.js'
import { AssistantRepository } from '../../src/main/assistant/assistant-repository.js'
import { MemoryService } from '../../src/main/memory/memory-service.js'
import { RetentionService } from '../../src/main/retention/retention-service.js'

const cleanup: (() => void)[] = []
afterEach(() =>
  cleanup
    .splice(0)
    .reverse()
    .forEach((close) => close())
)

async function setup() {
  const root = mkdtempSync(join(tmpdir(), 'mashiro-retired-list-'))
  cleanup.push(() => {
    if (
      dirname(resolve(root)) !== resolve(tmpdir()) ||
      !basename(root).startsWith('mashiro-retired-list-')
    )
      throw Error('Unexpected synthetic cleanup root')
    rmSync(root, { recursive: true, force: true })
  })
  const store = new SqliteStore(join(root, 'state.sqlite'))
  cleanup.push(() => store.close())
  const a = new AssistantRepository(store).create('合成', 0).assistants[0]!.id
  const memory = new MemoryService(store, join(root, 'memory'), () => ({
    fingerprint: 'fp',
    display: 'test'
  }))
  const retention = new RetentionService(store, join(root, 'memory'), memory)
  cleanup.push(() => retention.close())
  const remember = () => {
    const command = {
      protocolVersion: 1,
      assistantId: a,
      commandId: randomUUID(),
      mutation: {
        action: 'remember' as const,
        targetId: null,
        expectedVersion: null,
        kind: 'continuity' as const,
        scope: 'assistant' as const,
        title: '合成',
        markdown: '可恢复合成正文',
        nature: 'faithful-summary' as const,
        event: null
      }
    }
    const saved = memory.mutate(command)
    if (!saved.ok) throw Error('fixture')
    return { id: saved.data.objectId, command }
  }
  const doomed = remember(),
    ordinaryTrash = remember(),
    suppressed = remember()
  const move = (id: string, version: number, zone: 'trash' | 'persistent') =>
    retention.move({
      protocolVersion: 1,
      assistantId: a,
      commandId: randomUUID(),
      id,
      expectedVersion: version,
      expectedEpoch: retention.epoch,
      zone
    })
  expect(await move(doomed.id, 1, 'trash')).toMatchObject({ ok: true })
  expect(await move(ordinaryTrash.id, 1, 'trash')).toMatchObject({ ok: true })
  const removal = memory.mutate({
    protocolVersion: 1,
    assistantId: a,
    commandId: randomUUID(),
    mutation: {
      action: 'delete',
      targetId: suppressed.id,
      expectedVersion: 1
    }
  })
  if (!removal.ok) throw Error('ordinary suppression fixture')
  expect(
    memory.confirm({
      protocolVersion: 1,
      assistantId: a,
      confirmationId: removal.data.confirmationId,
      accept: true
    })
  ).toMatchObject({ ok: true })
  const query = () => memory.query({ protocolVersion: 1, assistantId: a, includeTrash: true })
  const before = query()
  if (!before.ok) throw Error('query fixture')
  expect(before.data.records.map((record) => record.id).sort()).toEqual(
    [doomed.id, ordinaryTrash.id, suppressed.id].sort()
  )
  const preview = await retention.preview({
    protocolVersion: 1,
    assistantId: a,
    intent: 'empty-trash',
    target: {
      type: 'memories',
      objects: [{ id: doomed.id, version: 2 }]
    }
  })
  if (!preview.ok) throw Error('preview fixture')
  const confirmed = await retention.confirm({
    protocolVersion: 1,
    assistantId: a,
    commandId: randomUUID(),
    previewId: preview.data.id,
    nonce: preview.data.nonce,
    accept: true
  })
  if (!confirmed.ok) throw Error('confirm fixture')
  for (let n = 0; n < 200; n++) {
    const jobs = await retention.jobs({ protocolVersion: 1 })
    if (!jobs.ok) throw Error('jobs')
    const job = jobs.data.jobs.find((job) => job.id === confirmed.data.jobId)
    if (job?.state === 'COMPLETED') break
    if (n === 199) throw Error('cleanup did not complete')
    await new Promise((done) => setTimeout(done, 5))
  }
  return { store, a, memory, retention, doomed, ordinaryTrash, suppressed, move, query }
}

it('includeTrash lists recoverable trash but excludes permanent tombstones; inspect and receipts survive', async () => {
  const f = await setup()
  const result = f.query()
  if (!result.ok) throw Error('query')
  expect(result.data.records.map((record) => record.id).sort()).toEqual(
    [f.ordinaryTrash.id, f.suppressed.id].sort()
  )
  expect(result.data.records.find((record) => record.id === f.suppressed.id)).toMatchObject({
    state: 'suppressed'
  })
  expect(f.memory.inspect({ protocolVersion: 1, assistantId: f.a, id: f.doomed.id })).toMatchObject(
    { ok: true }
  )
  expect(f.memory.mutate(f.doomed.command)).toMatchObject({
    ok: true,
    data: { objectId: f.doomed.id }
  })
  expect(
    f.store.database
      .prepare("SELECT count(*) AS n FROM content_tombstones WHERE kind='memory' AND id=?")
      .get(f.doomed.id)!.n
  ).toBe(1)
  expect(await f.retention.jobs({ protocolVersion: 1 })).toMatchObject({
    ok: true,
    data: { jobs: [{ state: 'COMPLETED' }] }
  })
  expect(await f.move(f.ordinaryTrash.id, 2, 'persistent')).toMatchObject({ ok: true })
  expect(
    f.memory.mutate({
      protocolVersion: 1,
      assistantId: f.a,
      commandId: randomUUID(),
      mutation: {
        action: 'restore',
        targetId: f.suppressed.id,
        expectedVersion: 2
      }
    })
  ).toMatchObject({ ok: true })
  const restored = f.memory.query({ protocolVersion: 1, assistantId: f.a })
  if (!restored.ok) throw Error('restored query')
  expect(restored.data.records.map((record) => record.id).sort()).toEqual(
    [f.ordinaryTrash.id, f.suppressed.id].sort()
  )
})

it('zone counts exclude permanently cleared objects while counting ordinary and suppressed trash', async () => {
  const f = await setup()
  const overview = await f.retention.overview({ protocolVersion: 1, assistantId: f.a })
  if (!overview.ok) throw Error('overview')
  expect(overview.data.zones.find((zone) => zone.zone === 'trash')).toMatchObject({ objects: 2 })
  expect(overview.data.zones.reduce((count, zone) => count + zone.objects, 0)).toBe(2)
})
