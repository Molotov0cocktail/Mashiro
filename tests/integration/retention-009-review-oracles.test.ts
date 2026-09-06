import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { SqliteStore } from '../../src/main/data/sqlite.js'
import { AssistantRepository } from '../../src/main/assistant/assistant-repository.js'
import { MemoryService } from '../../src/main/memory/memory-service.js'
import { RetentionService } from '../../src/main/retention/retention-service.js'

function removeReviewRoot(root: string): void {
  const resolved = join(tmpdir(), root.substring(root.lastIndexOf('mashiro-review-009-')))
  if (resolved !== root) throw Error('unexpected cleanup root')
  rmSync(root, { recursive: true, force: true })
}

it('review: concurrent move has one write and stable eventual receipt; nonce and authority changes fail closed', async () => {
  const root = mkdtempSync(join(tmpdir(), 'mashiro-review-009-'))
  const store = new SqliteStore(join(root, 'state.sqlite'))
  const repo = new AssistantRepository(store)
  const a = repo.create('合成', 0).assistants[0]!.id
  const memory = new MemoryService(store, join(root, 'memory'), () => ({
    fingerprint: 'fp',
    display: 'test'
  }))
  const retention = new RetentionService(store, join(root, 'memory'), memory)
  try {
    const saved = memory.mutate({
      protocolVersion: 1,
      assistantId: a,
      commandId: randomUUID(),
      mutation: {
        action: 'remember',
        targetId: null,
        expectedVersion: null,
        kind: 'continuity',
        scope: 'assistant',
        title: '合成',
        markdown: '合成正文',
        nature: 'faithful-summary',
        event: null
      }
    })
    if (!saved.ok) throw Error('fixture')
    const command = {
      protocolVersion: 1,
      assistantId: a,
      commandId: randomUUID(),
      id: saved.data.objectId,
      expectedVersion: 1,
      expectedEpoch: retention.epoch,
      zone: 'staging'
    }
    const results = await Promise.all([retention.move(command), retention.move(command)])
    expect(results.filter((result) => result.ok)).toHaveLength(1)
    const winner = results.find((result) => result.ok)!
    expect(await retention.move(command)).toEqual(winner)
    expect(
      store.database
        .prepare('SELECT version FROM memory_objects WHERE id=?')
        .get(saved.data.objectId)!.version
    ).toBe(2)
    const intent = {
      protocolVersion: 1,
      assistantId: a,
      intent: 'delete-representation',
      target: { type: 'memories', objects: [{ id: saved.data.objectId, version: 2 }] }
    }
    const preview = await retention.preview(intent)
    if (!preview.ok) throw Error('preview fixture')
    const confirmation = {
      protocolVersion: 1,
      assistantId: a,
      commandId: randomUUID(),
      previewId: preview.data.id,
      nonce: randomUUID(),
      accept: true
    }
    expect((await retention.confirm(confirmation)).ok).toBe(false)
    expect(store.database.prepare('SELECT count(*) AS n FROM content_tombstones').get()!.n).toBe(0)
    store.database
      .prepare("INSERT OR REPLACE INTO memory_permissions VALUES(?,'assistant',1,0,0,0)")
      .run(a)
    expect(await retention.confirm({ ...confirmation, nonce: preview.data.nonce })).toMatchObject({
      ok: false,
      error: { code: 'STALE_PREVIEW' }
    })
    expect(store.database.prepare('SELECT count(*) AS n FROM retention_jobs').get()!.n).toBe(0)
  } finally {
    retention.close()
    store.close()
    removeReviewRoot(root)
  }
})

it('review: all online SQL copies disappear and a new domain operation cannot accept the retired source', async () => {
  const root = mkdtempSync(join(tmpdir(), 'mashiro-review-009-'))
  const store = new SqliteStore(join(root, 'state.sqlite'))
  const a = new AssistantRepository(store).create('合成', 0).assistants[0]!.id
  const memory = new MemoryService(store, join(root, 'memory'), () => ({
    fingerprint: 'fp',
    display: 'test'
  }))
  const retention = new RetentionService(store, join(root, 'memory'), memory)
  try {
    const marker = 'REVIEW_ERASE_' + randomUUID()
    const mutation = {
      action: 'remember' as const,
      targetId: null,
      expectedVersion: null,
      kind: 'continuity' as const,
      scope: 'assistant' as const,
      title: marker,
      markdown: marker,
      nature: 'faithful-summary' as const,
      event: null
    }
    const command = { protocolVersion: 1, assistantId: a, commandId: randomUUID(), mutation }
    const saved = memory.mutate(command)
    if (!saved.ok) throw Error('fixture')
    const id = saved.data.objectId
    const reload = memory.previewReload({
      protocolVersion: 1,
      assistantId: a,
      id,
      expectedVersion: 1
    })
    expect(reload.ok).toBe(true)
    const request = {
      protocolVersion: 1,
      assistantId: a,
      intent: 'withdraw-information',
      target: { type: 'memories', objects: [{ id, version: 1 }] }
    }
    const obsolete = await retention.preview(request)
    const preview = await retention.preview(request)
    if (!obsolete.ok || !preview.ok) throw Error('preview fixture')
    const accepted = await retention.confirm({
      protocolVersion: 1,
      assistantId: a,
      commandId: randomUUID(),
      previewId: preview.data.id,
      nonce: preview.data.nonce,
      accept: true
    })
    if (!accepted.ok) throw Error('confirmation fixture')
    for (let n = 0; n < 100; n++) {
      const jobs = await retention.jobs({ protocolVersion: 1 })
      if (jobs.ok && jobs.data.jobs.every((job) => job.state === 'COMPLETED')) break
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
    expect(await retention.jobs({ protocolVersion: 1 })).toMatchObject({
      ok: true,
      data: { jobs: [{ state: 'COMPLETED' }] }
    })
    for (const table of [
      'memory_objects',
      'memory_versions',
      'memory_commands',
      'memory_previews',
      'memory_index',
      'retention_previews',
      'retention_commands',
      'retention_jobs',
      'retention_job_items'
    ]) {
      expect(
        JSON.stringify(store.database.prepare('SELECT * FROM ' + table).all()),
        table
      ).not.toContain(marker)
    }
    memory.rebuildIndex()
    expect(store.database.prepare('SELECT count(*) AS n FROM memory_index').get()!.n).toBe(0)
    expect(memory.mutate(command)).toMatchObject({ ok: true, data: { objectId: id } })
    store.database
      .prepare("INSERT OR REPLACE INTO memory_permissions VALUES(?,'assistant',1,1,1,0)")
      .run(a)
    store.database
      .prepare("INSERT OR REPLACE INTO memory_recipients VALUES(?,'assistant','fp',1)")
      .run(a)
    expect(() =>
      memory.toolMutation(
        {
          assistantId: a,
          requestId: randomUUID(),
          fingerprint: 'fp',
          assertCurrent: () => undefined,
          sources: [{ type: 'memory', id, version: 1, assistantId: a }]
        },
        { ...mutation, title: '新域不能复活', markdown: '新派生' }
      )
    ).toThrow()
    expect(store.database.prepare('SELECT count(*) AS n FROM memory_objects').get()!.n).toBe(1)
    const purge = await retention.preview({
      protocolVersion: 1,
      assistantId: a,
      intent: 'purge-assistant',
      target: { type: 'assistant', replacementAssistantId: null }
    })
    if (!purge.ok) throw Error('purge preview fixture')
    expect(purge.data.blockers).toEqual([])
    const purged = await retention.confirm({
      protocolVersion: 1,
      assistantId: a,
      commandId: randomUUID(),
      previewId: purge.data.id,
      nonce: purge.data.nonce,
      accept: true
    })
    if (!purged.ok) throw Error('purge confirmation fixture')
    for (let n = 0; n < 100; n++) {
      const jobs = await retention.jobs({ protocolVersion: 1 })
      if (
        jobs.ok &&
        jobs.data.jobs.every((job) => ['COMPLETED', 'FAILED_RETRYABLE'].includes(job.state))
      )
        break
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
    const finalJobs = await retention.jobs({ protocolVersion: 1 })
    if (!finalJobs.ok) throw Error('jobs fixture')
    expect(finalJobs.data.jobs.find((job) => job.id === purged.data.jobId)).toMatchObject({
      state: 'COMPLETED',
      error: null
    })
  } finally {
    retention.close()
    store.close()
    removeReviewRoot(root)
  }
})
