import { createHash, randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { SqliteStore } from '../../src/main/data/sqlite.js'
import { AssistantRepository } from '../../src/main/assistant/assistant-repository.js'
import { MemoryService } from '../../src/main/memory/memory-service.js'
import { RetentionService } from '../../src/main/retention/retention-service.js'
import type { RetentionIntent } from '../../src/shared/retention-contract.js'

const cleanup: (() => void)[] = []
afterEach(() =>
  cleanup
    .splice(0)
    .reverse()
    .forEach((close) => close())
)
const emptyHash = createHash('sha256').update('').digest('hex')
function setup(fault?: (phase: string) => void) {
  const root = mkdtempSync(join(tmpdir(), 'mashiro-cleaned-identity-'))
  cleanup.push(() => {
    if (
      dirname(resolve(root)) !== resolve(tmpdir()) ||
      !basename(root).startsWith('mashiro-cleaned-identity-')
    )
      throw Error('Unexpected synthetic cleanup root')
    rmSync(root, { recursive: true, force: true })
  })
  const store = new SqliteStore(join(root, 'state.sqlite'))
  cleanup.push(() => store.close())
  const a = new AssistantRepository(store).create('合成', 0).assistants[0]!.id
  const directory = join(root, 'memory')
  const memory = new MemoryService(store, directory, () => ({ fingerprint: 'fp', display: 'test' }))
  let retention = new RetentionService(store, directory, memory, undefined, undefined, fault)
  cleanup.push(() => retention.close())
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
      markdown: '待清理合成正文',
      nature: 'faithful-summary',
      event: null
    }
  })
  if (!saved.ok) throw Error('fixture')
  const id = saved.data.objectId
  const settle = async (jobId: string) => {
    for (let n = 0; n < 200; n++) {
      const jobs = await retention.jobs({ protocolVersion: 1 })
      if (!jobs.ok) throw Error('jobs')
      const job = jobs.data.jobs.find((job) => job.id === jobId)
      if (job && ['COMPLETED', 'FAILED_RETRYABLE'].includes(job.state)) return job
      await new Promise((done) => setTimeout(done, 5))
    }
    throw Error('Job did not settle')
  }
  const run = async (intent: RetentionIntent['intent']) => {
    const preview = await retention.preview({
      protocolVersion: 1,
      assistantId: a,
      intent,
      target:
        intent === 'purge-assistant'
          ? { type: 'assistant', replacementAssistantId: null }
          : { type: 'memories', objects: [{ id, version: 1 }] }
    })
    if (!preview.ok) throw Error(JSON.stringify(preview))
    expect(preview.data.blockers).toEqual([])
    const accepted = await retention.confirm({
      protocolVersion: 1,
      assistantId: a,
      commandId: randomUUID(),
      previewId: preview.data.id,
      nonce: preview.data.nonce,
      accept: true
    })
    if (!accepted.ok || !accepted.data.jobId) throw Error(JSON.stringify(accepted))
    return settle(accepted.data.jobId)
  }
  // Reproduce the unpublished old planner's persisted resource shape, without editing manifests on retry.
  const legacy = (resource = '', expected = emptyHash, associate = true) => {
    const jobId = randomUUID()
    store.database
      .prepare("INSERT INTO retention_jobs VALUES(?,?,?,'FAILED_RETRYABLE',?,'UNSAFE_PATH')")
      .run(jobId, a, randomUUID(), new Date().toISOString())
    store.database
      .prepare("INSERT INTO retention_job_items VALUES(?,'file',?,?,'pending')")
      .run(jobId, resource, expected)
    if (associate)
      store.database
        .prepare("INSERT INTO retention_job_items VALUES(?,'memory',?,'','pending')")
        .run(jobId, id)
    return jobId
  }
  const reopen = () => {
    retention.close()
    retention = new RetentionService(store, directory, memory, undefined, undefined, fault)
  }
  return {
    store,
    id,
    a,
    run,
    legacy,
    reopen,
    settle,
    retry: (jobId: string) => retention.retry({ protocolVersion: 1, jobId })
  }
}

it('completed withdrawal supports repeated empty-trash, cleanup and purge without empty file items', async () => {
  const { store, run } = setup()
  for (const intent of [
    'withdraw-information',
    'empty-trash',
    'empty-trash',
    'delete-representation',
    'purge-assistant'
  ] as const)
    expect(await run(intent)).toMatchObject({ state: 'COMPLETED', error: null })
  expect(
    store.database
      .prepare("SELECT count(*) AS n FROM retention_job_items WHERE kind='file' AND resource_id=''")
      .get()!.n
  ).toBe(0)
})

it.each(['unsafe-name', 'hash', 'metadata', 'tombstone', 'done-item', 'pending-file'] as const)(
  'does not mistake corrupted %s for a cleaned version',
  async (corruption) => {
    const { store, id, run } = setup()
    expect(await run('withdraw-information')).toMatchObject({ state: 'COMPLETED', error: null })
    if (corruption === 'unsafe-name')
      store.database
        .prepare("UPDATE memory_versions SET file_name='../outside.md' WHERE object_id=?")
        .run(id)
    if (corruption === 'hash')
      store.database
        .prepare("UPDATE memory_versions SET body_hash='invalid' WHERE object_id=?")
        .run(id)
    if (corruption === 'metadata')
      store.database
        .prepare("UPDATE memory_versions SET metadata_json='null' WHERE object_id=?")
        .run(id)
    if (corruption === 'tombstone')
      store.database.prepare("DELETE FROM content_tombstones WHERE kind='memory' AND id=?").run(id)
    if (corruption === 'done-item')
      store.database
        .prepare(
          "UPDATE retention_job_items SET state='pending' WHERE kind='memory' AND resource_id=?"
        )
        .run(id)
    if (corruption === 'pending-file')
      store.database
        .prepare("UPDATE retention_job_items SET state='pending' WHERE kind='file'")
        .run()
    expect(await run('delete-representation')).toMatchObject({
      state: 'FAILED_RETRYABLE',
      error: 'UNSAFE_PATH'
    })
  }
)

it('completed memory item proves cleanup before its containing job completes', async () => {
  let interrupted = false
  const { run } = setup((phase) => {
    if (phase === 'after-item-memory' && !interrupted) {
      interrupted = true
      throw Error('synthetic interruption after completed memory item')
    }
  })
  expect(await run('withdraw-information')).toMatchObject({
    state: 'FAILED_RETRYABLE',
    error: 'STORAGE_UNAVAILABLE'
  })
  expect(interrupted).toBe(true)
  expect(await run('empty-trash')).toMatchObject({ state: 'COMPLETED', error: null })
})

it.each(['reopen', 'retry'] as const)(
  'old empty resource completes on %s with its identity preserved',
  async (route) => {
    const f = setup()
    expect(await f.run('withdraw-information')).toMatchObject({ state: 'COMPLETED' })
    const jobId = f.legacy()
    if (route === 'reopen') f.reopen()
    else expect(await f.retry(jobId)).toMatchObject({ ok: true })
    expect(await f.settle(jobId)).toMatchObject({ id: jobId, state: 'COMPLETED', error: null })
    expect(
      f.store.database
        .prepare(
          "SELECT resource_id,expected_hash,state FROM retention_job_items WHERE job_id=? AND kind='file'"
        )
        .get(jobId)
    ).toEqual({ resource_id: '', expected_hash: emptyHash, state: 'done' })
  }
)

it.each(['unsafe-name', 'hash', 'metadata', 'unassociated', 'no-proof'] as const)(
  'old job recovery rejects %s',
  async (corruption) => {
    const f = setup()
    expect(await f.run('withdraw-information')).toMatchObject({ state: 'COMPLETED' })
    if (corruption === 'metadata')
      f.store.database.prepare("UPDATE memory_versions SET metadata_json='null'").run()
    if (corruption === 'no-proof')
      f.store.database
        .prepare("UPDATE retention_job_items SET state='pending' WHERE kind='memory'")
        .run()
    const jobId = f.legacy(
      corruption === 'unsafe-name' ? '../outside.md' : '',
      corruption === 'hash' ? 'invalid' : emptyHash,
      corruption !== 'unassociated'
    )
    expect(await f.retry(jobId)).toMatchObject({ ok: true })
    expect(await f.settle(jobId)).toMatchObject({ state: 'FAILED_RETRYABLE', error: 'UNSAFE_PATH' })
  }
)
