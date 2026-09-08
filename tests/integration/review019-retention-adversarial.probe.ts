import { performance as reviewClock } from 'node:perf_hooks'
const reviewStarted = reviewClock.now()
function reviewStage(stage: string, extra: Record<string, unknown> = {}) {
  process.stdout.write(
    'REVIEW_HEAVY ' +
      JSON.stringify({
        file: import.meta.url,
        stage,
        elapsedMs: reviewClock.now() - reviewStarted,
        ...extra
      }) +
      '\n'
  )
}
import { randomUUID } from 'node:crypto'
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, expect, it } from 'vitest'
import { AssistantRepository } from '../../src/main/assistant/assistant-repository.js'
import { SqliteStore } from '../../src/main/data/sqlite.js'
import { MemoryService } from '../../src/main/memory/memory-service.js'
import {
  RetentionService,
  type RetentionDependencies
} from '../../src/main/retention/retention-service.js'
import { TimelineRepository } from '../../src/main/provider/timeline-repository.js'
import { ToolRepository } from '../../src/main/provider/tool-repository.js'
import { ProviderService } from '../../src/main/provider/provider-service.js'
import { registerRetentionIpc } from '../../src/main/ipc/register-retention-ipc.js'
import { retentionChannels } from '../../src/shared/retention-channels.js'
import type { RetentionIntent, RetentionPreview } from '../../src/shared/retention-contract.js'
import type { MemoryRecord, MemorySource } from '../../src/shared/memory-contract.js'
import type {
  TransportRequest,
  TransportResult
} from '../../src/main/provider/chat-completions-transport.js'

const roots: string[] = [],
  closers: (() => void)[] = []
afterEach(() => {
  closers
    .splice(0)
    .reverse()
    .forEach((close) => close())
  roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }))
})
function fixture(
  options: {
    dependencies?: RetentionDependencies
    fault?: (phase: string) => void
    count?: number
  } = {}
) {
  const root = mkdtempSync(join(tmpdir(), 'mashiro-retention-oracle-'))
  roots.push(root)
  const path = join(root, 'state.sqlite'),
    store = new SqliteStore(path)
  closers.push(() => store.close())
  const repo = new AssistantRepository(store),
    ids: string[] = []
  for (let i = 0; i < (options.count ?? 3); i++)
    ids.push(repo.create('合成' + i, i).assistants.find((a) => a.displayName === '合成' + i)!.id)
  const directory = join(root, 'memory'),
    memory = new MemoryService(store, directory, () => ({
      fingerprint: 'fp',
      display: 'synthetic'
    })),
    timeline = new TimelineRepository(store)
  const retention = new RetentionService(
    store,
    directory,
    memory,
    undefined,
    options.dependencies,
    options.fault
  )
  closers.push(() => retention.close())
  const grant = (id: string, scope = 'global') => {
    store.database
      .prepare('INSERT OR REPLACE INTO memory_permissions VALUES(?,?,1,1,1,0)')
      .run(id, scope)
    store.database
      .prepare("INSERT OR REPLACE INTO memory_recipients VALUES(?,?,'fp',1)")
      .run(id, scope)
    store.database
      .prepare("INSERT OR REPLACE INTO history_recipient_grants VALUES(?,'fp',1)")
      .run(id)
  }
  const round = (a = ids[0]!, marker = 'ROUND_' + randomUUID()) => {
    const id = randomUUID()
    const messages = [
      {
        id: randomUUID(),
        requestId: id,
        role: 'user' as const,
        content: marker,
        status: 'completed' as const,
        createdAt: new Date().toISOString(),
        saved: true
      },
      {
        id: randomUUID(),
        requestId: id,
        role: 'assistant' as const,
        content: 'ANSWER_' + marker,
        status: 'completed' as const,
        createdAt: new Date().toISOString(),
        saved: true
      }
    ]
    timeline.insert(a, messages)
    return { id, marker, messages }
  }
  const remember = (
    a = ids[0]!,
    scope: 'assistant' | 'global' = 'global',
    sources: MemorySource[] = []
  ) => {
    const result = memory.mutate({
      protocolVersion: 1,
      assistantId: a,
      commandId: randomUUID(),
      mutation: {
        action: 'remember',
        targetId: null,
        expectedVersion: null,
        kind: scope === 'assistant' ? 'continuity' : 'user',
        scope,
        title: 'ACCEPTED',
        markdown: 'ACCEPTED_BODY_' + randomUUID(),
        nature: 'faithful-summary',
        event: null
      }
    })
    if (!result.ok) throw Error('remember')
    const id = result.data.objectId
    const row = store.database
      .prepare('SELECT record_json FROM memory_objects WHERE id=?')
      .get(id) as { record_json: string }
    const record = JSON.parse(row.record_json) as MemoryRecord
    if (sources.length) {
      record.sources = sources
      store.database
        .prepare('UPDATE memory_objects SET record_json=? WHERE id=?')
        .run(JSON.stringify(record), id)
      store.database
        .prepare("DELETE FROM memory_dependencies WHERE node_type='memory' AND node_id=?")
        .run(id)
      memory.addDependencies('memory', id, 1, sources)
    }
    return record
  }
  const preview = async (
    intent: RetentionIntent['intent'],
    target: RetentionIntent['target'],
    a = ids[0]!
  ) => {
    const result = await retention.preview({ protocolVersion: 1, assistantId: a, intent, target })
    if (!result.ok) throw Error(JSON.stringify(result))
    return result.data
  }
  const confirm = (preview: RetentionPreview, a = ids[0]!) =>
    retention.confirm({
      protocolVersion: 1,
      assistantId: a,
      commandId: randomUUID(),
      previewId: preview.id,
      nonce: preview.nonce,
      accept: true
    })
  return {
    root,
    path,
    directory,
    store,
    repo,
    ids,
    memory,
    retention,
    timeline,
    grant,
    round,
    remember,
    preview,
    confirm
  }
}
async function settled(retention: RetentionService, id: string) {
  for (let i = 0; i < 300; i++) {
    const result = await retention.jobs({ protocolVersion: 1 })
    if (!result.ok) throw Error('jobs')
    const job = result.data.jobs.find((j) => j.id === id)
    if (i % 50 === 0) reviewStage('settled-poll', { iteration: i, job })
    if (job?.state === 'COMPLETED' || job?.state === 'FAILED_RETRYABLE') return job
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  reviewStage('settled-exhausted')
  throw Error('timeout')
}

it('clears whole selected protocol copies including reasoning/arguments/results while preserving an unrelated round', async () => {
  const f = fixture(),
    a = f.ids[0]!,
    source = f.round(),
    other = f.round(),
    segmentId = randomUUID(),
    operationId = randomUUID(),
    marker = source.marker
  f.store.database
    .prepare(
      'INSERT INTO protocol_segments(id,assistant_id,request_id,endpoint_fingerprint,model,adapter_version,status,messages_json,created_at) VALUES(?,?,?,?,?,?,?,?,?)'
    )
    .run(
      segmentId,
      a,
      source.id,
      'fp',
      'model',
      'test',
      'closed',
      JSON.stringify([{ role: 'assistant', content: marker, reasoning_content: marker }]),
      new Date().toISOString()
    )
  const operation = {
    operationId,
    segmentId,
    modelRequestId: randomUUID(),
    requestId: source.id,
    assistantId: a,
    toolName: 'get_current_time',
    state: 'SUCCEEDED',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    summary: marker,
    citations: []
  }
  f.store.database
    .prepare(
      'INSERT INTO tool_operations(id,segment_id,model_request_id,tool_call_id,arguments_json,record_json) VALUES(?,?,?,?,?,?)'
    )
    .run(
      operationId,
      segmentId,
      operation.modelRequestId,
      'call',
      JSON.stringify({ marker }),
      JSON.stringify(operation)
    )
  f.store.database
    .prepare('INSERT INTO protocol_results VALUES(?,?)')
    .run(operationId, JSON.stringify({ marker }))
  const p = await f.preview('withdraw-information', {
      type: 'message',
      messageId: source.messages[0]!.id
    }),
    result = await f.confirm(p)
  if (!result.ok || !result.data.jobId) throw Error('confirm')
  expect(p.expandedToRounds).toBe(true)
  expect(f.timeline.query(a, marker)).toMatchObject({ ok: true, data: { messages: [] } })
  expect(new ToolRepository(f.store).read(a, source.id, true)).toEqual([])
  expect(() =>
    new ToolRepository(f.store).expandContext(
      a,
      [
        { role: 'user', content: marker },
        { role: 'assistant', content: marker }
      ],
      [source.id],
      'fp',
      'model'
    )
  ).toThrow()
  expect(await settled(f.retention, result.data.jobId)).toMatchObject({ state: 'COMPLETED' })
  for (const table of [
    'timeline_messages',
    'protocol_segments',
    'tool_operations',
    'protocol_results'
  ])
    expect(JSON.stringify(f.store.database.prepare('SELECT * FROM ' + table).all())).not.toContain(
      marker
    )
  expect(f.timeline.query(a, other.marker)).toMatchObject({
    ok: true,
    data: { messages: other.messages }
  })
})

it('preserves B private accepted memory and mixed B source permission; original withdrawal still overrides retained A edge', async () => {
  const f = fixture(),
    [a, b] = f.ids as [string, string],
    sourceA = f.round(a),
    sourceB = f.round(b)
  f.grant(a)
  f.grant(b, 'assistant')
  const privateB = f.remember(b, 'assistant', [
    { type: 'round', id: sourceA.id, assistantId: a, version: 1 },
    { type: 'round', id: sourceB.id, assistantId: b, version: 1 }
  ])
  const root: MemorySource = { type: 'memory', id: privateB.id, assistantId: b, version: 1 }
  expect(() => f.memory.assertSource(root, b, 'fp')).not.toThrow()
  const p = await f.preview('purge-assistant', { type: 'assistant', replacementAssistantId: b }),
    result = await f.confirm(p)
  expect(p.memoryIds).not.toContain(privateB.id)
  expect(p.retainedMemoryIds).toContain(privateB.id)
  if (!result.ok || !result.data.jobId) throw Error(JSON.stringify(result))
  expect(() => f.memory.assertSource(root, b, 'fp')).not.toThrow()
  f.store.database
    .prepare(
      "UPDATE history_recipient_grants SET send_history=0 WHERE assistant_id=? AND endpoint_fingerprint='fp'"
    )
    .run(b)
  expect(() => f.memory.assertSource(root, b, 'fp')).toThrow()
  f.grant(b, 'assistant')
  expect(() => f.memory.assertSource(root, b, 'fp')).not.toThrow()
  f.store.database
    .prepare("INSERT INTO memory_suppressions VALUES('round',?,1,'withdrawal',?)")
    .run(sourceA.id, privateB.id)
  expect(() => f.memory.assertSource(root, b, 'fp')).toThrow()
  await settled(f.retention, result.data.jobId)
})

it('recycles originals only with actual accepted versions, restores complete pairs, and refuses later withdrawal', async () => {
  let accepted: { id: string; version: number; hash: string }[] = []
  const f = fixture({
      dependencies: {
        inspectOriginal: () => ({ blockers: [], accepted }),
        inspectAssistant: () => ({ blockers: [] })
      }
    }),
    a = f.ids[0]!,
    source = f.round()
  f.grant(a)
  const memory = f.remember(a, 'global', [
    { type: 'round', id: source.id, assistantId: a, version: 1 }
  ])
  accepted = [
    {
      id: memory.id,
      version: 1,
      hash: String(
        f.store.database
          .prepare('SELECT body_hash FROM memory_versions WHERE object_id=?')
          .get(memory.id)!.body_hash
      )
    }
  ]
  const p = await f.preview('recycle-original', { type: 'timeline' })
  expect(p.blockers).toEqual([])
  expect(p.irreversible).toBe(false)
  expect(await f.confirm(p)).toMatchObject({ ok: true, data: { state: 'MOVED', jobId: null } })
  expect(f.timeline.read(a).messages).toEqual([])
  expect(() =>
    f.memory.assertSource({ type: 'memory', id: memory.id, assistantId: a, version: 1 }, a, 'fp')
  ).not.toThrow()
  const restore = await f.preview('restore-original', { type: 'timeline' })
  expect(restore.blockers).toEqual([])
  expect(await f.confirm(restore)).toMatchObject({ ok: true, data: { state: 'MOVED' } })
  expect(f.timeline.read(a).messages).toHaveLength(2)
  await f.confirm(await f.preview('recycle-original', { type: 'timeline' }))
  f.store.database
    .prepare("INSERT INTO memory_suppressions VALUES('round',?,1,'withdrawal',?)")
    .run(source.id, memory.id)
  const blocked = await f.preview('restore-original', { type: 'timeline' })
  expect(blocked.blockers.join('')).toContain('后续撤回')
  expect(await f.confirm(blocked)).toMatchObject({
    ok: false,
    error: { code: 'DEPENDENCY_BLOCKED' }
  })
  expect(f.timeline.read(a).messages).toEqual([])
})

it('recovers pending orphan cleanup after deleting the last assistant; jobs remain manageable without any assistant ID', async () => {
  const f = fixture({
      count: 1,
      fault: (phase) => {
        if (phase === 'before-unlink') throw Error('synthetic interruption')
      }
    }),
    a = f.ids[0]!,
    command = randomUUID(),
    orphan = randomUUID() + '-1-' + command + '.md.tmp',
    marker = 'ORPHAN_' + randomUUID()
  f.store.database
    .prepare('INSERT INTO memory_commands VALUES(?,?,?,?,?,?,?,?)')
    .run(
      command,
      a,
      null,
      'hash',
      JSON.stringify({ mutation: { action: 'remember', markdown: marker }, actor: 'user' }),
      'NOT_APPLIED',
      null,
      new Date().toISOString()
    )
  writeFileSync(join(f.directory, orphan), marker)
  const p = await f.preview('purge-assistant', { type: 'assistant', replacementAssistantId: null }),
    result = await f.confirm(p)
  if (!result.ok || !result.data.jobId) throw Error(JSON.stringify(result))
  expect(await settled(f.retention, result.data.jobId)).toMatchObject({ state: 'FAILED_RETRYABLE' })
  expect(f.repo.snapshot()).toMatchObject({
    assistants: [],
    primaryAssistantId: null,
    currentAssistantId: null
  })
  f.retention.close()
  const reopened = new SqliteStore(f.path)
  closers.push(() => reopened.close())
  const memory = new MemoryService(reopened, f.directory, () => ({
      fingerprint: null,
      display: null
    })),
    retention = new RetentionService(reopened, f.directory, memory)
  closers.push(() => retention.close())
  expect(await retention.jobs({ protocolVersion: 1 })).toMatchObject({
    ok: true,
    data: { jobs: [{ id: result.data.jobId }] }
  })
  await retention.retry({ protocolVersion: 1, jobId: result.data.jobId })
  expect(await settled(retention, result.data.jobId)).toMatchObject({ state: 'COMPLETED' })
  expect(readdirSync(f.directory)).toEqual([])
  expect(
    JSON.stringify(reopened.database.prepare('SELECT * FROM memory_commands').all())
  ).not.toContain(marker)
})

it('rejects non-window governance IPC and strict extra fields; valid management is available to the local frame', async () => {
  const f = fixture(),
    handlers = new Map<string, (event: unknown, input: unknown) => unknown>()
  const cleanup = registerRetentionIpc(
    {
      handle: (channel, handler) => handlers.set(channel, handler),
      removeHandler: (channel) => {
        handlers.delete(channel)
      }
    },
    f.retention,
    () => undefined,
    (event) => event === 'local'
  )
  expect(
    await handlers.get(retentionChannels.jobs)!('remote', { protocolVersion: 1 })
  ).toMatchObject({ ok: false, error: { code: 'PERMISSION_DENIED' } })
  expect(
    await handlers.get(retentionChannels.jobs)!('local', { protocolVersion: 1, path: 'D:/' })
  ).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } })
  expect(
    await handlers.get(retentionChannels.jobs)!('local', { protocolVersion: 1 })
  ).toMatchObject({ ok: true })
  cleanup()
  expect(handlers.size).toBe(0)
})

it('blocks ignored-abort late text and stream results after purge, including temporary session copies', async () => {
  const f = fixture({ count: 1 }),
    a = f.ids[0]!,
    captured: TransportRequest[] = [],
    resolveResults: ((result: TransportResult) => void)[] = [],
    events: unknown[] = []
  const protector = {
    isEncryptionAvailable: () => true,
    encryptString: (s: string) => Buffer.from(s),
    decryptString: (b: Buffer) => b.toString()
  }
  const provider = ProviderService.open(
    f.path,
    join(f.root, 'credentials'),
    protector,
    (request) => {
      captured.push(request)
      return new Promise((resolve) => resolveResults.push(resolve))
    }
  )
  closers.push(() => provider.close())
  const saved = provider.saveConnection({
    protocolVersion: 1,
    displayName: 'synthetic',
    baseUrl: 'https://example.com/v1',
    enabled: true
  })
  if (!saved.ok) throw Error('connection')
  const connectionId = saved.data.connections[0]!.id
  provider.setCredential({
    protocolVersion: 1,
    connectionId,
    apiKey: 'synthetic-only',
    persistence: 'temporary'
  })
  provider.bindAssistant({
    protocolVersion: 1,
    assistantId: a,
    connectionId,
    model: 'synthetic',
    expectedVersion: null
  })
  const result = provider.startChat(
    {
      protocolVersion: 1,
      assistantId: a,
      requestId: randomUUID(),
      text: 'TEMP_PRIVATE',
      stream: true,
      mode: 'temporary',
      tools: 'off',
      context: { kind: 'none' }
    },
    (event) => events.push(event)
  )
  expect(captured).toHaveLength(1)
  const p = await provider.retention.preview({
    protocolVersion: 1,
    assistantId: a,
    intent: 'purge-assistant',
    target: { type: 'assistant', replacementAssistantId: null }
  })
  if (!p.ok) throw Error('preview')
  const confirmed = await provider.retention.confirm({
    protocolVersion: 1,
    assistantId: a,
    commandId: randomUUID(),
    previewId: p.data.id,
    nonce: p.data.nonce,
    accept: true
  })
  expect(confirmed.ok).toBe(true)
  captured[0]!.onDelta?.('LATE_PRIVATE')
  resolveResults[0]!({ status: 'completed', text: 'LATE_PRIVATE', usage: null })
  expect(await result).toMatchObject({ ok: false, error: { code: 'CANCELLED' } })
  expect(JSON.stringify(events)).not.toContain('LATE_PRIVATE')
  expect(
    provider.readTimeline({ protocolVersion: 1, assistantId: a, mode: 'temporary' })
  ).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
  expect(readFileSync(f.path).byteLength).toBeGreaterThan(0)
})

it('rejects new cross-assistant request identity reuse atomically and blocks legacy ambiguous cleanup without losing data', async () => {
  const f = fixture(),
    [a, b] = f.ids as [string, string],
    source = f.round(a)
  expect(() =>
    f.timeline.insert(
      b,
      source.messages.map((message) => ({ ...message, id: randomUUID() }))
    )
  ).toThrow()
  expect(f.timeline.read(b).messages).toEqual([])
  // Existing pre-v7 duplicates are legal legacy data, not grounds to reject database startup.
  for (const message of source.messages)
    f.store.database
      .prepare(
        'INSERT INTO timeline_messages(id,assistant_id,request_id,role,content,status,created_at) VALUES(?,?,?,?,?,?,?)'
      )
      .run(
        randomUUID(),
        b,
        source.id,
        message.role,
        'LEGACY_B_' + message.content,
        message.status,
        message.createdAt
      )
  const reopened = new SqliteStore(f.path)
  reopened.close()
  const preview = await f.preview('withdraw-information', {
    type: 'message',
    messageId: source.messages[0]!.id
  })
  expect(preview.blockers.join('')).toContain('身份')
  expect(await f.confirm(preview)).toMatchObject({
    ok: false,
    error: { code: 'DEPENDENCY_BLOCKED' }
  })
  expect(f.timeline.read(a).messages).toHaveLength(2)
  expect(f.timeline.read(b).messages).toHaveLength(2)
  expect(f.store.database.prepare('SELECT 1 FROM content_tombstones').get()).toBeUndefined()
})

it('withdrawal of an accepted memory cleans its original round as well as versions and dependent rounds', async () => {
  const f = fixture(),
    a = f.ids[0]!,
    source = f.round()
  const memory = f.remember(a, 'global', [
    { type: 'user-round', id: source.id, assistantId: a, version: 1 }
  ])
  const derivative = f.round()
  f.memory.addDependencies('round', derivative.id, 1, [
    { type: 'memory', id: memory.id, assistantId: a, version: 1 }
  ])
  const preview = await f.preview('withdraw-information', {
    type: 'memories',
    objects: [{ id: memory.id, version: 1 }]
  })
  expect(preview.requestIds).toEqual(expect.arrayContaining([source.id, derivative.id]))
  const result = await f.confirm(preview)
  if (!result.ok || !result.data.jobId) throw Error('confirm')
  expect(f.timeline.read(a).messages).toEqual([])
  expect(await settled(f.retention, result.data.jobId)).toMatchObject({ state: 'COMPLETED' })
  expect(
    JSON.stringify(f.store.database.prepare('SELECT * FROM timeline_messages').all())
  ).not.toContain(source.marker)
})

it('preserves an ordinary edit made after the first hash check and resumes a crash after quarantine rename', async () => {
  let edit = false,
    interrupt = false
  const f = fixture({
    fault: (phase) => {
      if (phase === 'before-unlink' && edit) {
        edit = false
        const name = readdirSync(f.directory).find((name) => name.endsWith('.md'))!
        writeFileSync(join(f.directory, name), 'CONCURRENT_NEW_BODY')
      }
      if (phase === 'after-quarantine' && interrupt) {
        interrupt = false
        throw Error('synthetic crash window')
      }
    }
  })
  const memory = f.remember(),
    path = join(f.directory, readdirSync(f.directory)[0]!),
    original = readFileSync(path)
  const p = await f.preview('delete-representation', {
    type: 'memories',
    objects: [{ id: memory.id, version: 1 }]
  })
  edit = true
  const result = await f.confirm(p)
  if (!result.ok || !result.data.jobId) throw Error('confirm')
  expect(await settled(f.retention, result.data.jobId)).toMatchObject({
    state: 'FAILED_RETRYABLE',
    error: 'FILE_CHANGED'
  })
  expect(readFileSync(path, 'utf8')).toBe('CONCURRENT_NEW_BODY')
  writeFileSync(path, original)
  interrupt = true
  await f.retention.retry({ protocolVersion: 1, jobId: result.data.jobId })
  expect(await settled(f.retention, result.data.jobId)).toMatchObject({ state: 'FAILED_RETRYABLE' })
  expect(readdirSync(f.directory).some((name) => name.endsWith('.quarantine'))).toBe(true)
  f.retention.close()
  const reopened = new SqliteStore(f.path)
  closers.push(() => reopened.close())
  const memoryService = new MemoryService(reopened, f.directory, () => ({
    fingerprint: 'fp',
    display: 'synthetic'
  }))
  const retention = new RetentionService(reopened, f.directory, memoryService)
  closers.push(() => retention.close())
  expect(await settled(retention, result.data.jobId)).toMatchObject({ state: 'COMPLETED' })
  expect(readdirSync(f.directory)).toEqual([])
})

it('refuses a managed directory replaced by a junction and preserves its target bytes', async () => {
  const f = fixture(),
    record = f.remember(f.ids[0]!, 'assistant')
  const preview = await f.preview('delete-representation', {
    type: 'memories',
    objects: [{ id: record.id, version: 1 }]
  })
  const relocated = join(f.root, 'relocated-memory')
  renameSync(f.directory, relocated)
  symlinkSync(relocated, f.directory, 'junction')
  const before = readdirSync(relocated).map((name) => readFileSync(join(relocated, name), 'utf8'))
  const receipt = await f.confirm(preview)
  expect(receipt.ok).toBe(true)
  if (!receipt.ok) throw Error('confirm')
  expect((await settled(f.retention, receipt.data.jobId!)).error).toBe('UNSAFE_PATH')
  expect(readdirSync(relocated).map((name) => readFileSync(join(relocated, name), 'utf8'))).toEqual(
    before
  )
  unlinkSync(f.directory)
  renameSync(relocated, f.directory)
})

it('yields to unrelated local work while planning and draining a multi-batch cleanup', async () => {
  const f = fixture()
  reviewStage('fixture-ready')
  const records = Array.from({ length: 52 }, () => f.remember(f.ids[0]!, 'assistant'))
  reviewStage('seed-52-complete')
  let plannedYield = false
  setImmediate(() => {
    plannedYield = true
  })
  const preview = await f.preview('delete-representation', {
    type: 'memories',
    objects: records.map((record) => ({ id: record.id, version: 1 }))
  })
  reviewStage('preview-complete')
  expect(plannedYield).toBe(true)
  const receipt = await f.confirm(preview)
  if (!receipt.ok) throw Error('confirm')
  const jobs = await f.retention.jobs({ protocolVersion: 1 })
  expect(jobs.ok && jobs.data.jobs[0]?.state).not.toBe('COMPLETED')
  expect(f.repo.snapshot().assistants).toHaveLength(3)
  expect((await settled(f.retention, receipt.data.jobId!)).state).toBe('COMPLETED')
})
