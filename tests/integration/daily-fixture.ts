import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { afterEach, vi } from 'vitest'
import { AssistantService } from '../../src/main/assistant/assistant-service.js'
import { SqliteStore } from '../../src/main/data/sqlite.js'
import { MemoryService } from '../../src/main/memory/memory-service.js'
import { ItemService } from '../../src/main/item/item-service.js'
import { DailyService, type DailyProvider } from '../../src/main/background/daily-service.js'
import { OperationsService } from '../../src/main/background/operations-service.js'
import type { DailyFeature, DailySettings } from '../../src/shared/daily-contract.js'
const cleanups: (() => void)[] = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup()
})
export function dailyFixture(
  options: { send?: DailyProvider['send']; fault?: (phase: string) => void } = {}
) {
  const directory = mkdtempSync(join(realpathSync.native(tmpdir()), 'mashiro-daily-'))
  cleanups.push(() => {
    const actual = realpathSync.native(directory)
    if (
      dirname(actual) !== realpathSync.native(tmpdir()) ||
      !basename(actual).startsWith('mashiro-daily-')
    )
      throw Error('UNOWNED')
    rmSync(actual, { recursive: true, force: true })
  })
  const path = join(directory, 'data.sqlite'),
    assistant = AssistantService.open(path)
  const made = assistant.create({
    protocolVersion: 1,
    displayName: '合成日常',
    expectedStateRevision: 0
  })
  if (!made.ok) throw Error('assistant')
  const assistantId = made.data.assistants[0]!.id
  assistant.close()
  const store = new SqliteStore(path)
  cleanups.push(() => store.close())
  let now = new Date('2030-01-01T12:00:00.000Z')
  const clock = () => new Date(now)
  const memory = new MemoryService(store, join(directory, 'memory'), () => ({
    fingerprint: 'a'.repeat(64),
    display: '普通聊天'
  }))
  const items = new ItemService(
    store,
    () => ({ fingerprint: 'a'.repeat(64), display: '普通聊天' }),
    (source, id, fingerprint, visited) => memory.assertSource(source, id, fingerprint, [], visited)
  )
  memory.setDomainSourceCheck((source, id, fingerprint, visited) =>
    items.assertSource(source, id, fingerprint, visited)
  )
  for (const scope of ['global', 'assistant'])
    store.database
      .prepare('INSERT INTO memory_permissions VALUES(?,?,1,1,1,1)')
      .run(assistantId, scope)
  store.database.prepare('INSERT INTO item_permissions VALUES(?,1,1,1,1)').run(assistantId)
  const operations = new OperationsService(store, clock)
  cleanups.push(() => operations.close())
  let fingerprint = 'b'.repeat(64)
  const send = vi.fn<DailyProvider['send']>(
    options.send ??
      (async (_recipient, messages) => ({
        status: 'completed',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        text: JSON.stringify({
          sections: [
            {
              title: '合成结果',
              markdown: '根据已提供的资料作合成回顾。',
              nature: 'inference',
              sourceHandles: ['source0']
            }
          ],
          observations: messages[0]!.content!.includes('当前功能 observation')
            ? [
                {
                  title: '合成观察',
                  markdown: '这些记录可能反映偏好，仍需用户核验。',
                  nature: 'inference',
                  sourceHandles: ['source0', 'source1']
                }
              ]
            : [],
          proposals: []
        })
      }))
  )
  const provider: DailyProvider = {
    resolve: (config) => {
      if (!config.connectionId || !config.model) throw Error('configuration')
      return {
        connectionId: config.connectionId,
        model: config.model,
        fingerprint,
        identity: config.connectionId + ':' + config.model + ':' + fingerprint
      }
    },
    send
  }
  const service = new DailyService(store, memory, items, provider, operations, clock, options.fault)
  cleanups.push(() => service.close())
  const base = { protocolVersion: 1 as const, assistantId }
  const settings: DailySettings = {
    enabled: true,
    connectionId: randomUUID(),
    model: 'synthetic-daily',
    dataScope: {
      ownRounds: false,
      chapters: false,
      privateMemories: true,
      globalMemories: true,
      events: true,
      items: true,
      proposals: false,
      maxSources: 64,
      lookbackDays: 7
    },
    budget: { window: 'utc-day', calls: 10, inputCharacters: 500000, maxOutputTokens: 2048 },
    schedule: {
      timeZone: 'UTC',
      localTime: '12:01',
      weekday: 2,
      weekStartsOn: 1,
      fold: 'earlier',
      gap: 'skip'
    },
    recovery: { mode: 'EXPLICIT', catchUpMinutes: 120, merge: false, expire: true },
    allowSaveObservations: true,
    allowProposals: false,
    deadlineWindowHours: 24,
    changeFields: ['title', 'status', 'dueAt', 'description'],
    mergeChanges: false
  }
  const configure = (feature: DailyFeature = 'daily-brief', changes: Partial<DailySettings> = {}) =>
    service.configure({
      ...base,
      feature,
      expectedVersion: service.configuration(assistantId, feature).version,
      settings: { ...settings, ...changes },
      grantSelectedRecipient: true
    })
  const remember = (text = '合成用户资料', event = false) => {
    const result = memory.mutate({
      ...base,
      commandId: randomUUID(),
      mutation: {
        action: 'remember',
        targetId: null,
        expectedVersion: null,
        kind: event ? 'event' : 'user',
        scope: 'global',
        title: text,
        markdown: text,
        nature: 'user-statement',
        event: event
          ? { status: 'reported-happened', occurredAt: '2030-01-01T10:00:00Z', timeZone: 'UTC' }
          : null
      }
    })
    if (!result.ok) throw Error(result.error.code)
    return result.data
  }
  const query = (view: 'jobs' | 'reports' | 'configurations' = 'jobs', feature?: DailyFeature) => {
    const result = service.query({ ...base, view, feature })
    if (!result.ok) throw Error(result.error.message)
    return result.data
  }
  const run = (feature: DailyFeature = 'daily-brief') =>
    service.run({ ...base, feature, commandId: randomUUID() })
  return {
    directory,
    path,
    store,
    memory,
    items,
    service,
    operations,
    send,
    base,
    assistantId,
    settings,
    configure,
    remember,
    query,
    run,
    advance: (milliseconds: number) => {
      now = new Date(now.getTime() + milliseconds)
      service.tick()
      service.notify()
    },
    changeRecipient: () => {
      fingerprint = 'c'.repeat(64)
    },
    reopen: () => {
      service.close()
      const reopened = new DailyService(
        store,
        memory,
        items,
        provider,
        operations,
        clock,
        options.fault
      )
      cleanups.push(() => reopened.close())
      return reopened
    }
  }
}
