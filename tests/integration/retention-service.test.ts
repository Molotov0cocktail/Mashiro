import { randomUUID, createHash } from 'node:crypto'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { AssistantService } from '../../src/main/assistant/assistant-service.js'
import { SqliteStore } from '../../src/main/data/sqlite.js'
import { MemoryService } from '../../src/main/memory/memory-service.js'
import { RetentionService } from '../../src/main/retention/retention-service.js'
import { TimelineRepository } from '../../src/main/provider/timeline-repository.js'
import type { MemoryRecord, MemorySource } from '../../src/shared/memory-contract.js'
import type { RetentionIntent, RetentionPreview } from '../../src/shared/retention-contract.js'

const closers: (() => void)[] = [],
  roots: string[] = []
afterEach(() => {
  closers
    .splice(0)
    .reverse()
    .forEach((close) => close())
  roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }))
})

it('purging an assistant removes its profile body and protocol snapshot as well as hiding its identity', async () => {
  const f = setup()
  const [a, b] = f.ids as [string, string, string]
  const marker = 'PURGE_PROFILE_' + randomUUID()
  expect(
    f.assistants.rename({
      protocolVersion: 1,
      assistantId: a,
      displayName: '合成配置',
      persona: marker,
      avatarKey: 'violet',
      expectedAssistantVersion: 1,
      expectedStateRevision: 3
    })
  ).toMatchObject({ ok: true })
  const round = f.round(a)
  f.store.database
    .prepare(
      "INSERT INTO protocol_segments(id,assistant_id,request_id,endpoint_fingerprint,model,adapter_version,status,messages_json,created_at) VALUES(?,?,?,?,?,?,'closed',?,?)"
    )
    .run(
      randomUUID(),
      a,
      round.requestId,
      fp,
      'GLM-5.3-FLASH',
      'glm-5.3-flash-tools-v1',
      JSON.stringify([
        { role: 'system', content: marker },
        { role: 'user', content: '合成' }
      ]),
      new Date().toISOString()
    )
  const preview = await f.preview('purge-assistant', {
    type: 'assistant',
    replacementAssistantId: b
  })
  const result = await f.confirm(preview)
  if (!result.ok || !result.data.jobId) throw Error('purge fixture')
  expect(await f.settle(result.data.jobId)).toMatchObject({ state: 'COMPLETED' })
  expect(
    f.store.database.prepare('SELECT persona,avatar_key FROM assistants WHERE id=?').get(a)
  ).toEqual({ persona: '', avatar_key: 'mashiro' })
  expect(
    f.store.database.prepare('SELECT * FROM protocol_segments WHERE assistant_id=?').all()
  ).toEqual([])
  const snapshot = f.assistants.list({ protocolVersion: 1 })
  expect(JSON.stringify(snapshot)).not.toContain(marker)
  if (!snapshot.ok) throw Error('snapshot')
  expect(
    f.assistants.rename({
      protocolVersion: 1,
      assistantId: a,
      displayName: '恢复旧配置',
      persona: marker,
      expectedAssistantVersion: 3,
      expectedStateRevision: snapshot.data.stateRevision
    })
  ).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
})

const fp = 'test-endpoint'
function setup(fault?: (phase: string) => void) {
  const root = mkdtempSync(join(tmpdir(), 'mashiro-retention-'))
  roots.push(root)
  const path = join(root, 'state.sqlite'),
    assistants = AssistantService.open(path)
  const ids: string[] = []
  for (let i = 0; i < 3; i++) {
    const created = assistants.create({
      protocolVersion: 1,
      displayName: '合成助手' + i,
      expectedStateRevision: i
    })
    if (!created.ok) throw Error('fixture')
    ids.push(created.data.assistants.find((a) => a.displayName === '合成助手' + i)!.id)
  }
  closers.push(() => assistants.close())
  const store = new SqliteStore(path),
    directory = join(root, 'memory')
  closers.push(() => store.close())
  const memory = new MemoryService(store, directory, () => ({
    fingerprint: fp,
    display: 'synthetic'
  }))
  const retention = new RetentionService(store, directory, memory, undefined, undefined, fault)
  closers.push(() => retention.close())
  const timeline = new TimelineRepository(store)
  const grant = (id: string, fingerprint = fp) => {
    store.database
      .prepare("INSERT OR REPLACE INTO memory_permissions VALUES(?,'global',1,1,1,0)")
      .run(id)
    store.database
      .prepare("INSERT OR REPLACE INTO memory_recipients VALUES(?,'global',?,1)")
      .run(id, fingerprint)
  }
  const remember = (
    owner = ids[0]!,
    scope: 'global' | 'assistant' = 'global',
    body = 'SYNTHETIC_BODY_' + randomUUID()
  ) => {
    const result = memory.mutate({
      protocolVersion: 1,
      assistantId: owner,
      commandId: randomUUID(),
      mutation: {
        action: 'remember',
        targetId: null,
        expectedVersion: null,
        kind: scope === 'global' ? 'user' : 'continuity',
        scope,
        title: 'SYNTHETIC_TITLE_' + body,
        markdown: body,
        nature: 'faithful-summary',
        event: null
      }
    })
    if (!result.ok) throw Error('fixture save')
    return { id: result.data.objectId, version: result.data.objectVersion, body }
  }
  const round = (owner = ids[0]!, body = 'ROUND_' + randomUUID()) => {
    const requestId = randomUUID()
    timeline.insert(owner, [
      {
        id: randomUUID(),
        requestId,
        role: 'user',
        content: body,
        status: 'completed',
        createdAt: new Date().toISOString(),
        saved: true
      },
      {
        id: randomUUID(),
        requestId,
        role: 'assistant',
        content: 'ANSWER_' + body,
        status: 'completed',
        createdAt: new Date().toISOString(),
        saved: true
      }
    ])
    return { requestId, body }
  }
  const preview = async (
    intent: RetentionIntent['intent'],
    target: RetentionIntent['target'],
    assistantId = ids[0]!
  ) => {
    const result = await retention.preview({ protocolVersion: 1, assistantId, intent, target })
    if (!result.ok) throw Error(JSON.stringify(result))
    return result.data
  }
  const confirm = (p: RetentionPreview, assistantId = ids[0]!, commandId = randomUUID()) =>
    retention.confirm({
      protocolVersion: 1,
      assistantId,
      commandId,
      previewId: p.id,
      nonce: p.nonce,
      accept: true
    })
  const settle = async (id: string) => {
    for (let i = 0; i < 200; i++) {
      const result = await retention.jobs({ protocolVersion: 1, assistantId: ids[0] })
      if (!result.ok) throw Error('jobs')
      const job = result.data.jobs.find((j) => j.id === id)
      if (job?.state === 'COMPLETED' || job?.state === 'FAILED_RETRYABLE') return job
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
    throw Error('job timeout')
  }
  return {
    root,
    path,
    assistants,
    store,
    memory,
    retention,
    timeline,
    ids,
    grant,
    remember,
    round,
    preview,
    confirm,
    settle
  }
}
describe('retention trusted lifecycle', () => {
  it('moves persistent/staging/trash, excludes trash from every recall and restores with CAS without changing scope/nature', async () => {
    const f = setup(),
      a = f.ids[0]!,
      saved = f.remember()
    f.grant(a)
    const move = async (zone: 'persistent' | 'staging' | 'trash', version: number) =>
      f.retention.move({
        protocolVersion: 1,
        assistantId: a,
        commandId: randomUUID(),
        id: saved.id,
        expectedVersion: version,
        expectedEpoch: f.retention.epoch,
        zone
      })
    expect(await move('staging', 1)).toMatchObject({ ok: true, data: { objectVersion: 2 } })
    expect(await move('trash', 2)).toMatchObject({ ok: true, data: { objectVersion: 3 } })
    expect(f.memory.query({ protocolVersion: 1, assistantId: a })).toMatchObject({
      ok: true,
      data: { records: [] }
    })
    expect(
      f.memory.search(
        {
          assistantId: a,
          requestId: randomUUID(),
          fingerprint: fp,
          assertCurrent: () => undefined,
          sources: []
        },
        '',
        10
      )
    ).toEqual([])
    f.memory.rebuildIndex()
    expect(f.store.database.prepare('SELECT 1 FROM memory_index').get()).toBeUndefined()
    expect(await move('persistent', 3)).toMatchObject({ ok: true, data: { objectVersion: 4 } })
    expect(f.memory.inspect({ protocolVersion: 1, assistantId: a, id: saved.id })).toMatchObject({
      ok: true,
      data: {
        record: {
          scope: 'global',
          nature: 'faithful-summary',
          markdown: saved.body,
          retention: 'persistent'
        }
      }
    })
  })
  it('never restores trash after an independent source withdrawal and never adopts automatic policy', async () => {
    const f = setup(),
      a = f.ids[0]!,
      saved = f.remember()
    expect(await f.retention.overview({ protocolVersion: 1, assistantId: a })).toMatchObject({
      ok: true,
      data: { automaticPolicy: 'UNCONFIGURED' }
    })
    await f.retention.move({
      protocolVersion: 1,
      assistantId: a,
      commandId: randomUUID(),
      id: saved.id,
      expectedVersion: 1,
      expectedEpoch: f.retention.epoch,
      zone: 'trash'
    })
    const record = JSON.parse(
      (
        f.store.database
          .prepare('SELECT record_json FROM memory_objects WHERE id=?')
          .get(saved.id) as { record_json: string }
      ).record_json
    ) as MemoryRecord
    const source = record.sources[0]!
    f.store.database
      .prepare("INSERT INTO memory_suppressions VALUES(?,?,?,'withdrawal',?)")
      .run(source.type, source.id, source.version, saved.id)
    expect(
      await f.retention.move({
        protocolVersion: 1,
        assistantId: a,
        commandId: randomUUID(),
        id: saved.id,
        expectedVersion: 2,
        expectedEpoch: f.retention.epoch,
        zone: 'persistent'
      })
    ).toMatchObject({ ok: false, error: { code: 'NOT_RECOVERABLE' } })
  })
  it('binds previews to complete scope, current state and exact nonce; blocks missing accepted original dependencies', async () => {
    const f = setup(),
      saved = f.remember(),
      p = await f.preview('delete-representation', {
        type: 'memories',
        objects: [{ id: saved.id, version: saved.version }]
      })
    f.remember()
    expect(await f.confirm(p)).toMatchObject({ ok: false, error: { code: 'STALE_PREVIEW' } })
    const original = await f.preview('recycle-original', { type: 'timeline' })
    expect(original.blockers.join('')).toContain('已接受')
    expect(await f.confirm(original)).toMatchObject({
      ok: false,
      error: { code: 'DEPENDENCY_BLOCKED' }
    })
    expect(
      await f.retention.preview({
        protocolVersion: 1,
        assistantId: f.ids[0],
        intent: 'purge-assistant',
        target: { type: 'assistant', replacementAssistantId: f.ids[1] },
        path: 'C:/'
      })
    ).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } })
  })
  it('removes all accepted versions, command intents, reload previews and index; old command cannot re-create content', async () => {
    const f = setup(),
      a = f.ids[0]!,
      marker = 'ERASE_' + randomUUID(),
      command = randomUUID()
    const mutation = {
      action: 'remember',
      targetId: null,
      expectedVersion: null,
      kind: 'user',
      scope: 'global',
      title: marker,
      markdown: marker,
      nature: 'user-statement',
      event: null
    }
    const saved = f.memory.mutate({
      protocolVersion: 1,
      assistantId: a,
      commandId: command,
      mutation
    })
    if (!saved.ok) throw Error('save')
    const id = saved.data.objectId
    f.memory.previewReload({ protocolVersion: 1, assistantId: a, id, expectedVersion: 1 })
    const p = await f.preview('delete-representation', {
        type: 'memories',
        objects: [{ id, version: 1 }]
      }),
      accepted = await f.confirm(p)
    expect(accepted.ok).toBe(true)
    if (!accepted.ok || !accepted.data.jobId) throw Error('confirm')
    expect(f.memory.inspect({ protocolVersion: 1, assistantId: a, id })).toMatchObject({
      ok: true,
      data: { record: { markdown: '', title: '已清理内容' } }
    })
    expect(await f.settle(accepted.data.jobId)).toMatchObject({ state: 'COMPLETED' })
    for (const table of [
      'memory_objects',
      'memory_versions',
      'memory_commands',
      'memory_previews',
      'memory_index'
    ])
      expect(
        JSON.stringify(f.store.database.prepare('SELECT * FROM ' + table).all())
      ).not.toContain(marker)
    expect(readdirSync(join(f.root, 'memory'))).toEqual([])
    expect(
      f.memory.mutate({ protocolVersion: 1, assistantId: a, commandId: command, mutation })
    ).toMatchObject({ ok: true, data: { operationId: command } })
    expect(readdirSync(join(f.root, 'memory'))).toEqual([])
  })
  it('preserves global accepted content through assistant purge with exact original endpoint intersection', async () => {
    const f = setup(),
      [a, b, c] = f.ids as [string, string, string],
      source = f.round(a),
      shared = f.remember(a),
      privateMemory = f.remember(a, 'assistant')
    f.grant(b)
    f.grant(c, 'different-endpoint')
    f.store.database.prepare('INSERT INTO history_recipient_grants VALUES(?,?,1)').run(a, fp)
    const dependency: MemorySource = {
      type: 'round',
      id: source.requestId,
      assistantId: a,
      version: 1
    }
    const row = f.store.database
      .prepare('SELECT record_json FROM memory_objects WHERE id=?')
      .get(shared.id) as { record_json: string }
    const record = JSON.parse(row.record_json) as MemoryRecord
    record.sources = [dependency]
    f.store.database
      .prepare('UPDATE memory_objects SET record_json=? WHERE id=?')
      .run(JSON.stringify(record), shared.id)
    f.store.database
      .prepare("DELETE FROM memory_dependencies WHERE node_type='memory' AND node_id=?")
      .run(shared.id)
    f.memory.addDependencies('memory', shared.id, 1, [dependency])
    expect(() =>
      f.memory.assertSource({ type: 'memory', id: shared.id, assistantId: a, version: 1 }, b, fp)
    ).not.toThrow()
    const p = await f.preview('purge-assistant', { type: 'assistant', replacementAssistantId: b }),
      accepted = await f.confirm(p)
    if (!accepted.ok || !accepted.data.jobId) throw Error(JSON.stringify(accepted))
    expect(p.retainedMemoryIds).toContain(shared.id)
    expect(p.memoryIds).toContain(privateMemory.id)
    expect(f.timeline.read(a).messages).toEqual([])
    expect(() =>
      f.memory.assertSource({ type: 'memory', id: shared.id, assistantId: a, version: 1 }, b, fp)
    ).not.toThrow()
    f.grant(b, 'new-endpoint')
    expect(() =>
      f.memory.assertSource(
        { type: 'memory', id: shared.id, assistantId: a, version: 1 },
        b,
        'new-endpoint'
      )
    ).toThrow()
    expect(() =>
      f.memory.assertSource(
        { type: 'memory', id: shared.id, assistantId: a, version: 1 },
        c,
        'different-endpoint'
      )
    ).toThrow()
    expect(await f.settle(accepted.data.jobId)).toMatchObject({ state: 'COMPLETED' })
    const snapshot = f.assistants.list({ protocolVersion: 1 })
    expect(snapshot).toMatchObject({
      ok: true,
      data: { primaryAssistantId: b, currentAssistantId: b }
    })
    expect(f.memory.query({ protocolVersion: 1, assistantId: b })).toMatchObject({
      ok: true,
      data: { records: [{ id: shared.id, markdown: shared.body, deletedSourceAssistantIds: [a] }] }
    })
  })
  it('keeps changed files suppressed and reports retryable failure; retries exact originals idempotently', async () => {
    let fail = true
    const f = setup((phase) => {
        if (phase === 'before-unlink' && fail) throw Error('synthetic fault')
      }),
      saved = f.remember(),
      p = await f.preview('delete-representation', {
        type: 'memories',
        objects: [{ id: saved.id, version: saved.version }]
      }),
      accepted = await f.confirm(p)
    if (!accepted.ok || !accepted.data.jobId) throw Error('confirm')
    expect(await f.settle(accepted.data.jobId)).toMatchObject({
      state: 'FAILED_RETRYABLE',
      error: 'STORAGE_UNAVAILABLE'
    })
    const file = readdirSync(join(f.root, 'memory'))[0]!,
      original = readFileSync(join(f.root, 'memory', file))
    writeFileSync(join(f.root, 'memory', file), 'EXTERNAL_NEW_CONTENT')
    fail = false
    await f.retention.retry({
      protocolVersion: 1,
      assistantId: f.ids[0],
      jobId: accepted.data.jobId
    })
    expect(await f.settle(accepted.data.jobId)).toMatchObject({
      state: 'FAILED_RETRYABLE',
      error: 'FILE_CHANGED'
    })
    expect(readFileSync(join(f.root, 'memory', file), 'utf8')).toBe('EXTERNAL_NEW_CONTENT')
    writeFileSync(join(f.root, 'memory', file), original)
    await f.retention.retry({
      protocolVersion: 1,
      assistantId: f.ids[0],
      jobId: accepted.data.jobId
    })
    expect(await f.settle(accepted.data.jobId)).toMatchObject({ state: 'COMPLETED' })
    expect(createHash('sha256').update(original).digest('hex')).toHaveLength(64)
  })
})
