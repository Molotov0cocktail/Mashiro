import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { afterEach, expect, it, vi } from 'vitest'
import { AssistantService } from '../../src/main/assistant/assistant-service.js'
import { SqliteStore } from '../../src/main/data/sqlite.js'
import { MemoryService } from '../../src/main/memory/memory-service.js'
import { TimelineRepository } from '../../src/main/provider/timeline-repository.js'
import { roundSource, assertRoundSources } from '../../src/main/background/background-sources.js'
import { RetentionService } from '../../src/main/retention/retention-service.js'
import {
  BackgroundService,
  type BackgroundProvider
} from '../../src/main/background/background-service.js'
import {
  backgroundSnapshotResultSchema,
  backgroundConfigureInputSchema
} from '../../src/shared/background-contract.js'
import type { TransportResult } from '../../src/main/provider/chat-completions-transport.js'
import { memoryInspectResultSchema } from '../../src/shared/memory-contract.js'
const cleanups: (() => void)[] = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup()
})
function fixture(
  options: {
    fault?: (phase: string) => void
    send?: BackgroundProvider['send']
    topics?: string[]
  } = {}
) {
  const directory = mkdtempSync(join(tmpdir(), 'mashiro-background-'))
  cleanups.push(() => rmSync(directory, { recursive: true, force: true }))
  const databasePath = join(directory, 'state.sqlite')
  const assistants = AssistantService.open(databasePath)
  const made = assistants.create({
    protocolVersion: 1,
    displayName: '合成章节',
    expectedStateRevision: 0
  })
  if (!made.ok) throw Error('fixture')
  const assistantId = made.data.assistants[0]!.id
  assistants.close()
  const store = new SqliteStore(databasePath)
  cleanups.push(() => store.close())
  let fingerprint = 'a'.repeat(64)
  const connectionId = randomUUID()
  const memory = new MemoryService(
    store,
    join(directory, 'memory'),
    () => ({ fingerprint: null, display: null }),
    undefined,
    options.fault
  )
  store.database
    .prepare("INSERT INTO memory_permissions VALUES(?,'assistant',1,1,1,0)")
    .run(assistantId)
  const send = vi.fn(
    options.send ??
      (async () =>
        ({
          status: 'completed',
          text: JSON.stringify({
            title: '合成章节',
            summary: '用户计划检查合成报告，助手给出建议。',
            unfinishedTopics: options.topics ?? []
          }),
          usage: { promptTokens: 12, completionTokens: 8, totalTokens: 20 }
        }) as TransportResult)
  )
  const provider: BackgroundProvider = {
    resolve: (config) => ({
      connectionId: config.connectionId!,
      model: config.model!,
      fingerprint,
      identity: fingerprint
    }),
    send
  }
  const service = new BackgroundService(
    store,
    memory,
    provider,
    () => new Date('2030-01-01T12:00:00Z')
  )
  cleanups.push(() => service.close())
  const base = { protocolVersion: 1 as const, assistantId }
  const settings = {
    enabled: true,
    connectionId,
    model: 'synthetic-role',
    allowOwnCompletedRounds: true,
    budget: { window: 'utc-day' as const, calls: 5, inputCharacters: 100000 }
  }
  const configure = (calls = 5) =>
    service.configure({
      ...base,
      expectedVersion: service.configuration(assistantId).version,
      grantSelectedRecipient: true,
      settings: { ...settings, budget: { ...settings.budget, calls } }
    })
  const timeline = new TimelineRepository(store)
  const round = (sessionId?: string) => {
    const requestId = randomUUID()
    timeline.insert(
      assistantId,
      [
        {
          id: randomUUID(),
          requestId,
          role: 'user',
          content: '计划检查合成报告',
          status: 'completed',
          createdAt: '2030-01-01T00:00:00Z',
          saved: true
        },
        {
          id: randomUUID(),
          requestId,
          role: 'assistant',
          content: '建议核对测试与来源',
          status: 'completed',
          createdAt: '2030-01-01T00:00:01Z',
          saved: true
        }
      ],
      sessionId
    )
    return requestId
  }
  const snapshot = () => {
    const result = backgroundSnapshotResultSchema.parse(service.query(base))
    if (!result.ok) throw Error(result.error.code)
    return result.data
  }
  const done = async () => {
    await vi.waitFor(
      () => expect(snapshot().jobs.some((j) => j.state === 'COMPLETED')).toBe(true),
      { timeout: 2500 }
    )
    return snapshot().chapters[0]!
  }
  return {
    store,
    service,
    memory,
    provider,
    directory,
    assistantId,
    connectionId,
    base,
    settings,
    configure,
    round,
    snapshot,
    done,
    send,
    changeEndpoint: () => {
      fingerprint = 'b'.repeat(64)
    }
  }
}
it('defaults to no configuration and never queues saved temporary text', async () => {
  const f = fixture()
  f.round(randomUUID())
  f.round()
  expect(f.snapshot().configuration.enabled).toBe(false)
  expect(f.service.run(f.base).ok).toBe(false)
  await new Promise((resolve) => setTimeout(resolve, 20))
  expect(f.send).not.toHaveBeenCalled()
  expect(f.snapshot().jobs).toHaveLength(0)
  expect(f.configure().ok).toBe(true)
  expect(f.service.run(f.base).ok).toBe(true)
  await f.done()
  expect(f.snapshot().jobs).toHaveLength(1)
})
it('accepts actual Markdown with atomic slot receipt, no fake round and stable source identity', async () => {
  const f = fixture()
  const id = f.round()
  expect(f.configure().ok).toBe(true)
  f.service.run(f.base)
  const chapter = await f.done()
  expect(f.service.chapter({ ...f.base, chapterId: chapter.id, expectedVersion: 1 })).toMatchObject(
    { ok: true, data: { markdown: expect.stringContaining('用户计划') } }
  )
  const job = f.snapshot().jobs[0]!
  expect(job.receipt?.memoryId).toBe(chapter.memoryId)
  expect(
    f.store.database
      .prepare('SELECT request_id,intent_json FROM memory_commands WHERE id=?')
      .get(job.receipt!.commandId)
  ).toMatchObject({ request_id: null, intent_json: expect.stringContaining('"background"') })
  expect(
    f.store.database
      .prepare("SELECT 1 FROM memory_dependencies WHERE node_type='round' AND node_id=?")
      .get(job.id)
  ).toBeUndefined()
  expect(f.service.inspectOriginal(f.assistantId, [id])).toEqual({
    blockers: [],
    accepted: [{ id: chapter.memoryId, version: 1, hash: chapter.bodyHash }]
  })
  f.service.run(f.base)
  await new Promise((resolve) => setTimeout(resolve, 30))
  expect(f.snapshot().jobs).toHaveLength(1)
  expect(f.send).toHaveBeenCalledTimes(1)
})
it('exposes accepted background memory through the strict inspect contract with its true actor', async () => {
  const f = fixture()
  f.round()
  f.configure()
  f.service.run(f.base)
  const chapter = await f.done()
  const inspected = memoryInspectResultSchema.parse(
    f.memory.inspect({ ...f.base, id: chapter.memoryId })
  )
  expect(inspected).toMatchObject({
    ok: true,
    data: {
      record: { id: chapter.memoryId, markdown: expect.stringContaining('用户计划') },
      changes: [{ actor: 'background', action: 'remember', objectVersion: 1 }]
    }
  })
})

it('keeps unfinished topics separate from facts and blocks recycling until explicit resolution', async () => {
  const f = fixture({ topics: ['是否完成合成报告？'] })
  const id = f.round()
  f.configure()
  f.service.run(f.base)
  const chapter = await f.done()
  expect(chapter.topics[0]).toMatchObject({ nature: 'model-suggestion', state: 'OPEN' })
  expect(f.service.inspectOriginal(f.assistantId, [id]).blockers).toContain('章节仍有未完成话题')
  expect(
    f.service.topic({
      ...f.base,
      chapterId: chapter.id,
      expectedChapterVersion: 1,
      topicId: chapter.topics[0]!.id,
      expectedVersion: 1,
      state: 'RESOLVED'
    }).ok
  ).toBe(true)
  expect(f.service.inspectOriginal(f.assistantId, [id]).blockers).toEqual([])
})
it('reserves calls and input before sending and configuration changes do not reset consumption', async () => {
  const f = fixture()
  f.round()
  f.round()
  f.configure(1)
  f.service.run(f.base)
  await f.done()
  await vi.waitFor(
    () => expect(f.snapshot().jobs.some((j) => j.state === 'BUDGET_PAUSED')).toBe(true),
    { timeout: 2500 }
  )
  expect(f.send).toHaveBeenCalledTimes(1)
  expect(f.snapshot().usage.calls).toBe(1)
  expect(f.snapshot().usage.inputCharacters).toBeGreaterThan(100)
  expect(f.configure(1).ok).toBe(true)
  expect(f.snapshot().usage.calls).toBe(1)
})
it('unknown transport consumes reservation and requires explicit unknown retry', async () => {
  const f = fixture({
    send: async () => {
      throw Error('synthetic disconnected')
    }
  })
  f.round()
  f.configure(1)
  f.service.run(f.base)
  await vi.waitFor(() => expect(f.snapshot().jobs[0]?.state).toBe('REMOTE_UNKNOWN'))
  const job = f.snapshot().jobs[0]!
  expect(f.snapshot().usage).toMatchObject({ calls: 1, unknownAttempts: 1 })
  expect(
    f.service.control({
      ...f.base,
      jobId: job.id,
      expectedVersion: job.version,
      commandId: randomUUID(),
      action: 'retry'
    }).ok
  ).toBe(false)
  expect(
    f.service.control({
      ...f.base,
      jobId: job.id,
      expectedVersion: job.version,
      commandId: randomUUID(),
      action: 'retry-unknown'
    }).ok
  ).toBe(true)
  await vi.waitFor(() => expect(f.snapshot().jobs[0]?.state).toBe('BUDGET_PAUSED'), {
    timeout: 2500
  })
  expect(f.send).toHaveBeenCalledTimes(1)
})
it('revoking source permission during dispatch prevents acceptance', async () => {
  let resolve!: (result: TransportResult) => void
  const f = fixture({
    send: () =>
      new Promise((r) => {
        resolve = r
      })
  })
  f.round()
  f.configure()
  f.service.run(f.base)
  await vi.waitFor(() => expect(f.send).toHaveBeenCalledTimes(1))
  f.store.database
    .prepare('UPDATE history_recipient_grants SET send_history=0 WHERE assistant_id=?')
    .run(f.assistantId)
  resolve({
    status: 'completed',
    text: JSON.stringify({ title: '禁止迟到', summary: '不得接受', unfinishedTopics: [] }),
    usage: null
  })
  await vi.waitFor(() => expect(f.snapshot().jobs[0]?.state).toBe('PERMISSION_BLOCKED'))
  expect(f.snapshot().chapters).toHaveLength(0)
})
it('cancelling in-flight work never accepts late output or refunds possible consumption', async () => {
  let resolve!: (result: TransportResult) => void
  const f = fixture({
    send: () =>
      new Promise((r) => {
        resolve = r
      })
  })
  f.round()
  f.configure()
  f.service.run(f.base)
  await vi.waitFor(() => expect(f.send).toHaveBeenCalledTimes(1))
  const job = f.snapshot().jobs[0]!
  expect(
    f.service.control({
      ...f.base,
      jobId: job.id,
      expectedVersion: job.version,
      commandId: randomUUID(),
      action: 'cancel'
    }).ok
  ).toBe(true)
  resolve({
    status: 'completed',
    text: JSON.stringify({ title: '取消', summary: '禁止接受', unfinishedTopics: [] }),
    usage: null
  })
  await new Promise((r) => setTimeout(r, 30))
  expect(f.snapshot().jobs[0]?.state).toBe('CANCELLED')
  expect(f.snapshot().chapters).toHaveLength(0)
  expect(f.snapshot().usage.calls).toBe(1)
})
it('changed endpoint cannot inherit saved receiver authorization', () => {
  const f = fixture()
  f.configure()
  expect(f.snapshot().configuration.recipientAuthorized).toBe(true)
  f.changeEndpoint()
  f.round()
  expect(f.snapshot().configuration.recipientAuthorized).toBe(false)
  expect(f.service.run(f.base).ok).toBe(false)
  expect(f.send).not.toHaveBeenCalled()
})
it('does not treat corrupted or user-edited accepted versions as recyclable chapters', async () => {
  const f = fixture()
  const id = f.round()
  f.configure()
  f.service.run(f.base)
  const chapter = await f.done()
  const version = f.store.database
    .prepare('SELECT file_name FROM memory_versions WHERE object_id=?')
    .get(chapter.memoryId)!
  const path = join(f.directory, 'memory', String(version.file_name))
  const old = readFileSync(path, 'utf8')
  writeFileSync(path, old + '修改')
  expect(f.service.inspectOriginal(f.assistantId, [id]).blockers.length).toBeGreaterThan(0)
  expect(f.snapshot().chapters[0]!.state).toBe('UNAVAILABLE')
})
it('file-before-SQL failure accepts nothing and retry reuses the same local candidate without another model call', async () => {
  let fail = true
  const f = fixture({
    fault: (phase) => {
      if (phase === 'file-ready' && fail) {
        fail = false
        throw Error('synthetic fault')
      }
    }
  })
  f.round()
  f.configure()
  f.service.run(f.base)
  await vi.waitFor(() => expect(f.snapshot().jobs[0]?.state).toBe('FAILED_CONFIRMED'))
  expect(f.store.database.prepare('SELECT count(*) AS n FROM memory_versions').get()!.n).toBe(0)
  const job = f.snapshot().jobs[0]!
  expect(
    f.service.control({
      ...f.base,
      jobId: job.id,
      expectedVersion: job.version,
      commandId: randomUUID(),
      action: 'retry'
    }).ok
  ).toBe(true)
  await f.done()
  expect(f.send).toHaveBeenCalledTimes(1)
})
it('a blocked prefix cannot starve a later eligible round and pages remain complete', async () => {
  const f = fixture()
  for (let i = 0; i < 220; i++) {
    const id = f.round()
    f.store.database
      .prepare("INSERT INTO memory_suppressions VALUES('round',?,1,'withdrawal',?)")
      .run(id, id)
  }
  const eligible = f.round()
  const gaps: number[] = []
  let last = performance.now()
  const heartbeat = setInterval(() => {
    const now = performance.now()
    gaps.push(now - last)
    last = now
  }, 10)
  cleanups.push(() => clearInterval(heartbeat))
  f.configure()
  f.service.run(f.base)
  await vi.waitFor(() => expect(f.send).toHaveBeenCalledTimes(1), { timeout: 4000 })
  clearInterval(heartbeat)
  expect(gaps.length).toBeGreaterThan(0)
  expect(Math.max(...gaps)).toBeLessThan(500)
  const first = f.snapshot()
  expect(first.jobs).toHaveLength(100)
  expect(first.nextCursor).toBe(100)
  const second = backgroundSnapshotResultSchema.parse(f.service.query({ ...f.base, cursor: 100 }))
  const third = backgroundSnapshotResultSchema.parse(f.service.query({ ...f.base, cursor: 200 }))
  if (!second.ok || !third.ok) throw Error('pages')
  expect(second.data.jobs).toHaveLength(100)
  expect(third.data.jobs).toHaveLength(21)
  expect(
    new Set([...first.jobs, ...second.data.jobs, ...third.data.jobs].map((j) => j.id)).size
  ).toBe(221)
  expect(first.chapters[0]?.requestIds).toContain(eligible)
})
it('startup turns an interrupted dispatch into unknown without replaying it', async () => {
  const f = fixture({ send: () => new Promise(() => {}) })
  f.round()
  f.configure()
  f.service.run(f.base)
  await vi.waitFor(() => expect(f.send).toHaveBeenCalledTimes(1))
  f.service.close()
  const reopened = new BackgroundService(
    f.store,
    f.memory,
    f.provider,
    () => new Date('2030-01-01T12:00:00Z')
  )
  cleanups.push(() => reopened.close())
  const result = backgroundSnapshotResultSchema.parse(reopened.query(f.base))
  if (!result.ok) throw Error('reopen')
  expect(result.data.jobs[0]!.state).toBe('REMOTE_UNKNOWN')
  expect(result.data.usage).toMatchObject({ calls: 1, unknownAttempts: 1 })
  await new Promise((r) => setTimeout(r, 30))
  expect(f.send).toHaveBeenCalledTimes(1)
})
it('rejects another assistant chapter and version changes before ordinary context use', async () => {
  const f = fixture()
  f.round()
  f.configure()
  f.service.run(f.base)
  const chapter = await f.done()
  expect(() =>
    f.service.context(randomUUID(), [{ id: chapter.id, expectedVersion: 1 }], 'a'.repeat(64))
  ).toThrow()
  expect(() =>
    f.service.context(f.assistantId, [{ id: chapter.id, expectedVersion: 2 }], 'a'.repeat(64))
  ).toThrow()
  expect(
    f.service.context(f.assistantId, [{ id: chapter.id, expectedVersion: 1 }], 'a'.repeat(64))
      .messages[0]!.content
  ).toContain('用户计划')
})
it('purge erases private chapter metadata and candidates while preserving body-free consumed usage', async () => {
  const f = fixture({ topics: ['私有话题'] })
  f.round()
  f.configure()
  f.service.run(f.base)
  await f.done()
  f.store.transaction(() => f.service.purgeAssistant(f.assistantId))
  expect(f.store.database.prepare('SELECT count(*) AS n FROM background_chapters').get()!.n).toBe(0)
  expect(f.store.database.prepare('SELECT count(*) AS n FROM background_configs').get()!.n).toBe(0)
  expect(f.service.usage(f.assistantId).calls).toBe(1)
  expect(
    JSON.stringify(f.store.database.prepare('SELECT * FROM background_jobs').all())
  ).not.toContain('私有话题')
})
it('actual retention preview and confirm recycle accepted sources, preserve authorized summary and restore originals', async () => {
  const f = fixture()
  const id = f.round()
  f.configure()
  f.service.run(f.base)
  const chapter = await f.done()
  const retention = new RetentionService(
    f.store,
    join(f.directory, 'memory'),
    f.memory,
    undefined,
    f.service
  )
  cleanups.push(() => retention.close())
  const preview = await retention.preview({
    ...f.base,
    intent: 'recycle-original',
    target: { type: 'timeline' }
  })
  expect(preview).toMatchObject({ ok: true, data: { blockers: [] } })
  if (!preview.ok) throw Error('preview')
  const confirm = await retention.confirm({
    ...f.base,
    previewId: preview.data.id,
    nonce: preview.data.nonce,
    commandId: randomUUID(),
    accept: true
  })
  expect(confirm.ok).toBe(true)
  expect(
    f.store.database.prepare('SELECT 1 FROM retention_original_trash WHERE request_id=?').get(id)
  ).toBeDefined()
  expect(
    f.service.context(f.assistantId, [{ id: chapter.id, expectedVersion: 1 }], 'a'.repeat(64))
      .messages[0]!.content
  ).toContain('用户计划')
  const restore = await retention.preview({
    ...f.base,
    intent: 'restore-original',
    target: { type: 'timeline' }
  })
  if (!restore.ok) throw Error('restore preview')
  expect(
    (
      await retention.confirm({
        ...f.base,
        previewId: restore.data.id,
        nonce: restore.data.nonce,
        commandId: randomUUID(),
        accept: true
      })
    ).ok
  ).toBe(true)
  expect(
    f.store.database.prepare('SELECT 1 FROM retention_original_trash WHERE request_id=?').get(id)
  ).toBeUndefined()
})
it('summarizes a long conversation current round without replaying ancestors and still enforces ancestor withdrawal', async () => {
  const f = fixture()
  const ids: string[] = []
  for (let i = 0; i < 20; i++) {
    const id = f.round()
    if (ids.length) {
      f.store.database
        .prepare('INSERT INTO timeline_sources VALUES(?,?,?)')
        .run(f.assistantId, id, ids.at(-1)!)
      f.memory.addDependencies('round', id, 1, [
        { type: 'round', id: ids.at(-1)!, assistantId: f.assistantId, version: 1 }
      ])
    }
    ids.push(id)
  }
  expect(f.configure().ok).toBe(true)
  expect(roundSource(f.store, f.assistantId, ids.at(-1)!).requestIds).toEqual([ids.at(-1)])
  // Summarize the current round first, without changing historical originals.
  for (const id of ids.slice(0, -1))
    f.store.database
      .prepare('UPDATE timeline_messages SET source_session_id=? WHERE request_id=?')
      .run(randomUUID(), id)
  f.service.run(f.base)
  const chapter = await f.done()
  expect(chapter.requestIds).toEqual([ids.at(-1)])
  f.store.database
    .prepare("INSERT INTO memory_suppressions VALUES('round',?,1,'withdrawal',?)")
    .run(ids[0]!, ids[0]!)
  expect(() => assertRoundSources(f.memory, f.assistantId, 'a'.repeat(64), [ids.at(-1)!])).toThrow()
  expect(() =>
    f.service.context(f.assistantId, [{ id: chapter.id, expectedVersion: 1 }], 'a'.repeat(64))
  ).toThrow()
})
it('strict configuration rejects model-controlled fields', () => {
  const f = fixture()
  expect(
    backgroundConfigureInputSchema.safeParse({
      ...f.base,
      expectedVersion: 0,
      settings: { ...f.settings, apiKey: 'forbidden' }
    }).success
  ).toBe(false)
})
