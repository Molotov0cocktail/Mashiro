import { randomUUID } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { AssistantRepository } from '../../src/main/assistant/assistant-repository.js'
import { SqliteStore } from '../../src/main/data/sqlite.js'
import { applyProductionGovernance } from '../../src/main/data/production-governance-apply.js'
import { MemoryService } from '../../src/main/memory/memory-service.js'
import { RetentionService } from '../../src/main/retention/retention-service.js'

const roots: string[] = []
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })))

function setup(initial = '2026-01-01T00:00:00.000Z') {
  const root = mkdtempSync(join(tmpdir(), 'mashiro-retention-policy-'))
  roots.push(root)
  const store = new SqliteStore(join(root, 'state.sqlite'))
  const assistantId = new AssistantRepository(store).create('合成助手', 0).assistants[0]!.id
  const memory = new MemoryService(store, join(root, 'memory'), () => ({
    fingerprint: 'synthetic',
    display: 'synthetic'
  }))
  let now = new Date(initial)
  const retention = new RetentionService(
    store,
    join(root, 'memory'),
    memory,
    undefined,
    undefined,
    undefined,
    () => now
  )
  const settings = async (limitBytes: number, expiry = true, days = 90) => {
    const current = await retention.policy({ protocolVersion: 1, assistantId })
    if (!current.ok) throw Error('policy fixture')
    const next = {
      persistentCapacity: { enabled: true, limitBytes },
      stagingExpiry: { enabled: expiry, days }
    }
    const preview = await retention.previewPolicy({
      protocolVersion: 1,
      assistantId,
      expectedRevision: current.data.revision,
      settings: next
    })
    if (!preview.ok) throw Error('preview fixture')
    const saved = await retention.configurePolicy({
      protocolVersion: 1,
      assistantId,
      commandId: randomUUID(),
      expectedRevision: current.data.revision,
      previewId: preview.data.id,
      settings: next
    })
    if (!saved.ok) throw Error('configure fixture')
    return saved.data
  }
  const remember = (markdown: string) =>
    memory.mutate({
      protocolVersion: 1,
      assistantId,
      commandId: randomUUID(),
      mutation: {
        action: 'remember',
        targetId: null,
        expectedVersion: null,
        kind: 'continuity',
        scope: 'assistant',
        title: '合成',
        markdown,
        nature: 'faithful-summary',
        event: null
      }
    })
  const move = async (id: string, version: number, zone: 'persistent' | 'staging' | 'trash') =>
    retention.move({
      protocolVersion: 1,
      assistantId,
      commandId: randomUUID(),
      id,
      expectedVersion: version,
      expectedEpoch: retention.epoch,
      zone
    })
  return {
    root,
    store,
    memory,
    retention,
    assistantId,
    settings,
    remember,
    move,
    setNow(value: string) {
      now = new Date(value)
    },
    close() {
      retention.close()
      store.close()
    }
  }
}

it('uses exact UTF-8 dataset bytes, permits reductions over limit, and blocks increases on unknown data', async () => {
  const f = setup()
  try {
    await f.settings(Buffer.byteLength('你好', 'utf8'))
    const first = f.remember('你好')
    expect(first).toMatchObject({ ok: true })
    expect(f.remember('a')).toMatchObject({
      ok: false,
      error: { code: 'CAPACITY_EXCEEDED' }
    })
    if (!first.ok) throw Error('first fixture')
    await f.settings(1)
    expect(
      f.memory.mutate({
        protocolVersion: 1,
        assistantId: f.assistantId,
        commandId: randomUUID(),
        mutation: {
          action: 'correct',
          targetId: first.data.objectId,
          expectedVersion: 1,
          kind: 'continuity',
          scope: 'assistant',
          title: '缩小',
          markdown: 'a',
          nature: 'faithful-summary',
          event: null
        }
      })
    ).toMatchObject({ ok: true })
    const file = f.store.database
      .prepare('SELECT file_name FROM memory_versions WHERE object_id=? AND version=2')
      .get(first.data.objectId)!.file_name as string
    writeFileSync(
      join(f.root, 'memory', file),
      Buffer.concat([readFileSync(join(f.root, 'memory', file)), Buffer.from('x')])
    )
    expect(f.remember('b')).toMatchObject({
      ok: false,
      error: { code: 'MEASUREMENT_UNKNOWN' }
    })
    const policy = await f.retention.policy({ protocolVersion: 1, assistantId: f.assistantId })
    expect(policy).toMatchObject({
      ok: true,
      data: { usage: { acceptedBytes: 1, measurement: 'UNKNOWN', unknownObjects: 1 } }
    })
  } finally {
    f.close()
  }
})

it('keeps staging age across edits, moves only when due, and restarts age after trash recovery', async () => {
  const f = setup()
  try {
    const created = f.remember('暂存正文')
    if (!created.ok) throw Error('create fixture')
    const staged = await f.move(created.data.objectId, 1, 'staging')
    if (!staged.ok) throw Error('stage fixture')
    const before = f.store.database
      .prepare(
        'SELECT staging_entered_at,staging_generation FROM retention_policy_objects WHERE object_id=?'
      )
      .get(created.data.objectId)!
    const corrected = f.memory.mutate({
      protocolVersion: 1,
      assistantId: f.assistantId,
      commandId: randomUUID(),
      mutation: {
        action: 'correct',
        targetId: created.data.objectId,
        expectedVersion: 2,
        kind: 'continuity',
        scope: 'assistant',
        title: '仍在暂存',
        markdown: '编辑后的暂存正文',
        nature: 'faithful-summary',
        event: null
      }
    })
    expect(corrected).toMatchObject({ ok: true })
    expect(
      f.store.database
        .prepare(
          'SELECT zone,staging_entered_at,staging_generation FROM retention_policy_objects WHERE object_id=?'
        )
        .get(created.data.objectId)
    ).toEqual({ zone: 'staging', ...before })
    const configured = await f.settings(104857600, true, 90)
    f.setNow('2026-03-31T23:59:59.999Z')
    await f.retention.runPolicy({
      protocolVersion: 1,
      assistantId: f.assistantId,
      expectedRevision: configured.revision
    })
    expect(
      JSON.parse(
        String(
          f.store.database
            .prepare('SELECT record_json FROM memory_objects WHERE id=?')
            .get(created.data.objectId)!.record_json
        )
      ).retention
    ).toBe('staging')
    f.setNow('2026-04-01T00:00:00.000Z')
    await f.retention.runPolicy({
      protocolVersion: 1,
      assistantId: f.assistantId,
      expectedRevision: configured.revision
    })
    const trashed = JSON.parse(
      String(
        f.store.database
          .prepare('SELECT record_json FROM memory_objects WHERE id=?')
          .get(created.data.objectId)!.record_json
      )
    )
    expect(trashed.retention).toBe('trash')
    const restored = await f.move(created.data.objectId, trashed.objectVersion, 'staging')
    expect(restored).toMatchObject({ ok: true })
    const after = f.store.database
      .prepare(
        'SELECT staging_entered_at,staging_generation FROM retention_policy_objects WHERE object_id=?'
      )
      .get(created.data.objectId)!
    expect(after.staging_entered_at).toBe('2026-04-01T00:00:00.000Z')
    expect(Number(after.staging_generation)).toBeGreaterThan(Number(before.staging_generation))
    expect(
      f.store.database.prepare('SELECT count(*) AS n FROM retention_policy_receipts').get()!.n
    ).toBe(1)
  } finally {
    f.close()
  }
})

it('defaults to 100 MiB and 90 days and never schedules trash for permanent deletion', async () => {
  const f = setup()
  try {
    const policy = await f.retention.policy({ protocolVersion: 1, assistantId: f.assistantId })
    expect(policy).toMatchObject({
      ok: true,
      data: {
        revision: 1,
        settings: {
          persistentCapacity: { enabled: true, limitBytes: 104857600 },
          stagingExpiry: { enabled: true, days: 90 }
        },
        restoredPaused: false
      }
    })
    expect(
      f.store.database
        .prepare("SELECT sql FROM sqlite_master WHERE name='retention_policy_objects_due'")
        .get()
    ).toBeTruthy()
    expect(
      f.store.database
        .prepare("SELECT count(*) AS n FROM retention_policy_receipts WHERE state='MOVED'")
        .get()!.n
    ).toBe(0)
    const checked = await f.retention.runPolicy({
      protocolVersion: 1,
      assistantId: f.assistantId,
      expectedRevision: 1
    })
    expect(checked).toMatchObject({
      ok: true,
      data: {
        recentRun: { state: 'COMPLETED', moved: 0, skipped: 0, failed: 0 }
      }
    })
  } finally {
    f.close()
  }
})

it('returns a bounded storage error after shutdown without touching the closed database', async () => {
  const f = setup()
  f.retention.close()
  f.store.close()

  await expect(
    f.retention.policy({ protocolVersion: 1, assistantId: f.assistantId })
  ).resolves.toMatchObject({ ok: false, error: { code: 'STORAGE_UNAVAILABLE' } })
  await expect(
    f.retention.runPolicy({
      protocolVersion: 1,
      assistantId: f.assistantId,
      expectedRevision: 1
    })
  ).resolves.toMatchObject({ ok: false, error: { code: 'STORAGE_UNAVAILABLE' } })
})

it('keeps another assistant private due titles out of the bounded policy preview', async () => {
  const f = setup()
  try {
    const secondAssistantId = new AssistantRepository(f.store)
      .create('另一助手', 1)
      .assistants.find((assistant) => assistant.id !== f.assistantId)!.id
    const rememberFor = (ownerAssistantId: string, title: string, scope: 'global' | 'assistant') =>
      f.memory.mutate({
        protocolVersion: 1,
        assistantId: ownerAssistantId,
        commandId: randomUUID(),
        mutation: {
          action: 'remember',
          targetId: null,
          expectedVersion: null,
          kind: scope === 'global' ? 'user' : 'continuity',
          scope,
          title,
          markdown: title,
          nature: scope === 'global' ? 'user-statement' : 'faithful-summary',
          event: null
        }
      })
    const own = f.remember('自己的私有暂存')
    const otherPrivate = rememberFor(secondAssistantId, '不可泄露的私有标题', 'assistant')
    const otherGlobal = rememberFor(secondAssistantId, '可见的全局标题', 'global')
    if (!own.ok || !otherPrivate.ok || !otherGlobal.ok) throw Error('privacy fixture')
    await f.move(own.data.objectId, 1, 'staging')
    await f.retention.move({
      protocolVersion: 1,
      assistantId: secondAssistantId,
      commandId: randomUUID(),
      id: otherPrivate.data.objectId,
      expectedVersion: 1,
      expectedEpoch: f.retention.epoch,
      zone: 'staging'
    })
    await f.retention.move({
      protocolVersion: 1,
      assistantId: secondAssistantId,
      commandId: randomUUID(),
      id: otherGlobal.data.objectId,
      expectedVersion: 1,
      expectedEpoch: f.retention.epoch,
      zone: 'staging'
    })
    f.setNow('2026-04-01T00:00:00.000Z')
    const policy = await f.retention.policy({ protocolVersion: 1, assistantId: f.assistantId })
    if (!policy.ok) throw Error('policy fixture')
    const preview = await f.retention.previewPolicy({
      protocolVersion: 1,
      assistantId: f.assistantId,
      expectedRevision: policy.data.revision,
      settings: policy.data.settings
    })
    expect(preview).toMatchObject({
      ok: true,
      data: { dueObjects: 3 }
    })
    if (!preview.ok) throw Error('preview fixture')
    expect(preview.data.firstBatch.map((item) => item.title)).toEqual(
      expect.arrayContaining(['合成', '可见的全局标题'])
    )
    expect(preview.data.firstBatch.map((item) => item.title)).not.toContain('不可泄露的私有标题')
  } finally {
    f.close()
  }
})

it('backs off failed leading objects and lets later due objects make progress', async () => {
  const f = setup()
  try {
    const ids: string[] = []
    for (let index = 0; index < 21; index++) {
      const saved = f.remember('到期对象 ' + index)
      if (!saved.ok) throw Error('batch fixture')
      ids.push(saved.data.objectId)
      const moved = await f.move(saved.data.objectId, 1, 'staging')
      if (!moved.ok) throw Error('stage fixture')
    }
    const ordered = f.store.database
      .prepare(
        "SELECT object_id FROM retention_policy_objects WHERE zone='staging' ORDER BY staging_entered_at,object_id"
      )
      .all() as { object_id: string }[]
    for (const item of ordered.slice(0, 20)) {
      const file = f.store.database
        .prepare('SELECT file_name FROM memory_versions WHERE object_id=? AND version=2')
        .get(item.object_id)!.file_name as string
      writeFileSync(join(f.root, 'memory', file), 'corrupted')
    }
    f.setNow('2026-04-01T00:00:00.000Z')
    const policy = await f.retention.policy({ protocolVersion: 1, assistantId: f.assistantId })
    if (!policy.ok) throw Error('policy fixture')
    const first = await f.retention.runPolicy({
      protocolVersion: 1,
      assistantId: f.assistantId,
      expectedRevision: policy.data.revision
    })
    expect(first).toMatchObject({
      ok: true,
      data: {
        staging: {
          dueObjects: 21,
          failedObjects: 20,
          nextRetryAt: '2026-04-02T00:00:00.000Z'
        },
        recentRun: { state: 'FAILED', moved: 0, failed: 20 }
      }
    })
    const laterId = ordered[20]!.object_id
    const failureTimes = f.store.database
      .prepare(
        "SELECT object_id,occurred_at FROM retention_policy_receipts WHERE state='FAILED' ORDER BY object_id"
      )
      .all()
    await new Promise((resolve) => setTimeout(resolve, 500))
    const afterAutomatic = await f.retention.policy({
      protocolVersion: 1,
      assistantId: f.assistantId
    })
    expect(afterAutomatic).toMatchObject({
      ok: true,
      data: {
        staging: { dueObjects: 20, failedObjects: 20 },
        recentRun: { state: 'COMPLETED', moved: 1, failed: 0 }
      }
    })
    expect(
      JSON.parse(
        String(
          f.store.database
            .prepare('SELECT record_json FROM memory_objects WHERE id=?')
            .get(laterId)!.record_json
        )
      ).retention
    ).toBe('trash')
    expect(
      f.store.database
        .prepare(
          "SELECT object_id,occurred_at FROM retention_policy_receipts WHERE state='FAILED' ORDER BY object_id"
        )
        .all()
    ).toEqual(failureTimes)

    const explicitRetry = await f.retention.runPolicy({
      protocolVersion: 1,
      assistantId: f.assistantId,
      expectedRevision: policy.data.revision
    })
    expect(explicitRetry).toMatchObject({
      ok: true,
      data: { recentRun: { state: 'FAILED', moved: 0, failed: 20 } }
    })
    expect(ids).toHaveLength(21)
  } finally {
    f.close()
  }
})

it('rejects an explicit run when its expected policy revision changes while another batch finishes', async () => {
  const f = setup()
  try {
    const saved = f.remember('等待期间策略变化')
    if (!saved.ok) throw Error('run revision fixture')
    const staged = await f.move(saved.data.objectId, 1, 'staging')
    if (!staged.ok) throw Error('run revision stage fixture')
    f.setNow('2026-04-01T00:00:00.000Z')
    const policy = await f.retention.policy({ protocolVersion: 1, assistantId: f.assistantId })
    if (!policy.ok) throw Error('run revision policy fixture')
    const nextSettings = {
      ...policy.data.settings,
      stagingExpiry: { enabled: false, days: policy.data.settings.stagingExpiry.days }
    }
    const preview = await f.retention.previewPolicy({
      protocolVersion: 1,
      assistantId: f.assistantId,
      expectedRevision: policy.data.revision,
      settings: nextSettings
    })
    if (!preview.ok) throw Error('run revision preview fixture')

    const activeRun = f.retention.runPolicy({
      protocolVersion: 1,
      assistantId: f.assistantId,
      expectedRevision: policy.data.revision
    })
    const waitingRun = f.retention.runPolicy({
      protocolVersion: 1,
      assistantId: f.assistantId,
      expectedRevision: policy.data.revision
    })
    const configured = await f.retention.configurePolicy({
      protocolVersion: 1,
      assistantId: f.assistantId,
      commandId: randomUUID(),
      expectedRevision: policy.data.revision,
      previewId: preview.data.id,
      settings: nextSettings
    })
    expect(configured).toMatchObject({ ok: true, data: { revision: policy.data.revision + 1 } })
    await activeRun
    await expect(waitingRun).resolves.toMatchObject({
      ok: false,
      error: { code: 'STALE_PREVIEW' }
    })
  } finally {
    f.close()
  }
})

it('contains an automatic batch outer failure and leaves explicit recovery runnable', async () => {
  const f = setup()
  try {
    const saved = f.remember('外层失败后仍可重试')
    if (!saved.ok) throw Error('outer failure fixture')
    const staged = await f.move(saved.data.objectId, 1, 'staging')
    if (!staged.ok) throw Error('outer failure stage fixture')
    f.setNow('2026-04-01T00:00:00.000Z')
    f.store.database.exec(`
      CREATE TRIGGER synthetic_policy_run_failure BEFORE INSERT ON retention_policy_runs
      BEGIN SELECT RAISE(ABORT,'synthetic policy run failure'); END;
    `)
    await new Promise((resolve) => setTimeout(resolve, 75))
    const failed = await f.retention.policy({ protocolVersion: 1, assistantId: f.assistantId })
    expect(failed).toMatchObject({
      ok: true,
      data: {
        recentRun: {
          state: 'FAILED',
          failed: 1,
          error: expect.stringContaining('存储异常')
        }
      }
    })
    f.store.database.exec('DROP TRIGGER synthetic_policy_run_failure')
    const policy = await f.retention.policy({ protocolVersion: 1, assistantId: f.assistantId })
    if (!policy.ok) throw Error('outer failure policy fixture')
    await expect(
      f.retention.runPolicy({
        protocolVersion: 1,
        assistantId: f.assistantId,
        expectedRevision: policy.data.revision
      })
    ).resolves.toMatchObject({
      ok: true,
      data: { recentRun: { state: 'COMPLETED', moved: 1 } }
    })
  } finally {
    f.close()
  }
})

it('recovers an interrupted run from its durable per-item receipts on restart', async () => {
  const f = setup()
  f.retention.close()
  const runId = randomUUID()
  f.store.database
    .prepare("INSERT INTO retention_policy_runs VALUES(?,1,1,'RUNNING',?,NULL,0,0,0,NULL)")
    .run(runId, '2026-01-01T00:00:00.000Z')
  f.store.database
    .prepare("INSERT INTO retention_policy_receipts VALUES(?,1,1,2,'MOVED',?,?,NULL)")
    .run(randomUUID(), runId, '2026-01-01T00:00:01.000Z')
  f.store.database
    .prepare("INSERT INTO retention_policy_receipts VALUES(?,1,1,2,'FAILED',?,?,?)")
    .run(randomUUID(), runId, '2026-01-01T00:00:02.000Z', '合成失败，原对象保持不变')
  f.store.close()

  const reopenedStore = new SqliteStore(join(f.root, 'state.sqlite'))
  const reopenedMemory = new MemoryService(reopenedStore, join(f.root, 'memory'), () => ({
    fingerprint: 'synthetic',
    display: 'synthetic'
  }))
  const reopened = new RetentionService(
    reopenedStore,
    join(f.root, 'memory'),
    reopenedMemory,
    undefined,
    undefined,
    undefined,
    () => new Date('2026-01-02T00:00:00.000Z')
  )
  try {
    const policy = await reopened.policy({ protocolVersion: 1, assistantId: f.assistantId })
    expect(policy).toMatchObject({
      ok: true,
      data: {
        recentRun: {
          id: runId,
          state: 'FAILED',
          completedAt: '2026-01-02T00:00:00.000Z',
          moved: 1,
          skipped: 0,
          failed: 1,
          error: expect.stringContaining('进程退出或中断')
        }
      }
    })
  } finally {
    reopened.close()
    reopenedStore.close()
  }
})

it('starts restored capacity accounting as unknown and completes a yielding content audit', async () => {
  const f = setup()
  const saved = f.remember('重启后重新核查')
  if (!saved.ok) throw Error('restart audit fixture')
  f.retention.close()
  f.store.close()

  const reopenedStore = new SqliteStore(join(f.root, 'state.sqlite'))
  const reopenedMemory = new MemoryService(reopenedStore, join(f.root, 'memory'), () => ({
    fingerprint: 'synthetic',
    display: 'synthetic'
  }))
  const reopened = new RetentionService(
    reopenedStore,
    join(f.root, 'memory'),
    reopenedMemory,
    undefined,
    undefined,
    undefined,
    () => new Date('2026-01-02T00:00:00.000Z')
  )
  try {
    const initial = await reopened.policy({ protocolVersion: 1, assistantId: f.assistantId })
    expect(initial).toMatchObject({
      ok: true,
      data: {
        usage: {
          acceptedBytes: Buffer.byteLength('重启后重新核查', 'utf8'),
          measurement: 'UNKNOWN'
        },
        audit: { state: 'PENDING', checkedObjects: 0, totalObjects: 1 }
      }
    })
    let completed = initial
    for (let attempt = 0; attempt < 20; attempt++) {
      await new Promise((resolve) => setImmediate(resolve))
      completed = await reopened.policy({ protocolVersion: 1, assistantId: f.assistantId })
      if (completed.ok && completed.data.audit.state === 'COMPLETE') break
    }
    expect(completed).toMatchObject({
      ok: true,
      data: {
        usage: {
          acceptedBytes: Buffer.byteLength('重启后重新核查', 'utf8'),
          measurement: 'COMPLETE'
        },
        audit: { state: 'COMPLETE', checkedObjects: 1, totalObjects: 1 }
      }
    })
  } finally {
    reopened.close()
    reopenedStore.close()
  }
})

it('pauses automation on restored copies and preserves a known later disabled policy', async () => {
  const f = setup()
  try {
    writeFileSync(join(f.root, '.mashiro-snapshot.json'), '{}')
    applyProductionGovernance(f.store.database, f.root, [
      {
        table: 'retention_policy',
        keys: [1],
        values: [2, 0, 2048, 0, 30, 0, 2],
        deleted: false
      }
    ])
    const row = f.store.database
      .prepare(
        'SELECT revision,capacity_enabled,capacity_bytes,staging_enabled,staging_days,restored_paused FROM retention_policy WHERE singleton=1'
      )
      .get()
    expect(row).toEqual({
      revision: 2,
      capacity_enabled: 0,
      capacity_bytes: 2048,
      staging_enabled: 0,
      staging_days: 30,
      restored_paused: 1
    })
    const policy = await f.retention.policy({ protocolVersion: 1, assistantId: f.assistantId })
    expect(policy).toMatchObject({
      ok: true,
      data: {
        restoredPaused: true,
        settings: {
          persistentCapacity: { enabled: false, limitBytes: 2048 },
          stagingExpiry: { enabled: false, days: 30 }
        }
      }
    })
  } finally {
    f.close()
  }
})
