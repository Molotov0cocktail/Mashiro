import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { afterEach, vi } from 'vitest'
import { AssistantService } from '../../src/main/assistant/assistant-service.js'
import { SqliteStore } from '../../src/main/data/sqlite.js'
import { MemoryService } from '../../src/main/memory/memory-service.js'
import { TimelineRepository } from '../../src/main/provider/timeline-repository.js'
import { StewardService, type StewardProvider } from '../../src/main/background/steward-service.js'
import { stewardSnapshotResultSchema } from '../../src/shared/steward-contract.js'
const cleanups: (() => void)[] = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup()
})
export const plan = (values: Record<string, unknown> = {}) => ({
  action: 'remember',
  title: '合成长期偏好',
  markdown: '用户喜欢合成蓝色。',
  nature: 'faithful-summary',
  branchTitle: '长期偏好',
  targetHandle: null,
  sourceHandles: ['entry'],
  ...values
})
export function stewardFixture(
  options: {
    send?: StewardProvider['send']
    fault?: (phase: string) => void
    memoryFault?: (phase: string) => void
  } = {}
) {
  const directory = mkdtempSync(join(tmpdir(), 'mashiro-steward-'))
  cleanups.push(() => rmSync(directory, { recursive: true, force: true }))
  const path = join(directory, 'db.sqlite'),
    assistants = AssistantService.open(path)
  const made = assistants.create({
    protocolVersion: 1,
    displayName: '合成仓储',
    expectedStateRevision: 0
  })
  if (!made.ok) throw Error('fixture')
  const assistantId = made.data.assistants[0]!.id
  assistants.close()
  const store = new SqliteStore(path)
  cleanups.push(() => store.close())
  const changed = vi.fn()
  const memory = new MemoryService(
    store,
    join(directory, 'memory'),
    () => ({ fingerprint: 'b'.repeat(64), display: 'synthetic-chat' }),
    changed,
    options.memoryFault
  )
  store.database
    .prepare("INSERT INTO memory_permissions VALUES(?,'global',1,1,1,1)")
    .run(assistantId)
  const send = vi.fn<StewardProvider['send']>(
    options.send ??
      (async (_recipient, messages) => ({
        status: 'completed',
        text: JSON.stringify(
          messages[0]!.content!.includes('共享增量识别')
            ? {
                sharedCandidates: [
                  {
                    title: '合成长期偏好',
                    markdown: '用户喜欢合成蓝色。',
                    nature: 'faithful-summary',
                    sourceHandles: ['source0']
                  }
                ]
              }
            : { slots: [plan()] }
        ),
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 }
      }))
  )
  let fingerprint = 'a'.repeat(64)
  const provider: StewardProvider = {
    resolve: (c) => {
      if (!c.connectionId || !c.model) throw Error('configuration')
      return {
        connectionId: c.connectionId,
        model: c.model,
        fingerprint,
        identity: fingerprint + ':' + c.model
      }
    },
    send
  }
  const clock = () => new Date('2030-01-01T12:00:00Z')
  const service = new StewardService(store, memory, provider, clock, options.fault)
  cleanups.push(() => service.close())
  const base = { protocolVersion: 1 as const, assistantId },
    connectionId = randomUUID(),
    budget = { window: 'utc-day' as const, calls: 10, inputCharacters: 200000 }
  const discoverySettings = {
    enabled: true,
    connectionId,
    model: 'synthetic-discovery',
    allowOwnCompletedRounds: true,
    budget
  }
  const stewardSettings = {
    enabled: true,
    connectionId,
    model: 'synthetic-steward',
    assistantIds: [assistantId],
    allowAcceptedMemories: true,
    allowSharedCandidates: true,
    allowWrite: true,
    allowInferences: true,
    budget
  }
  const discovery = () =>
    service.configure({
      ...base,
      role: 'assistant',
      expectedVersion: service.discovery(assistantId).version,
      settings: discoverySettings,
      grantSelectedRecipient: true
    })
  const configure = (settings: Partial<typeof stewardSettings> = {}) =>
    service.configure({
      ...base,
      role: 'steward',
      expectedVersion: service.configuration().version,
      settings: { ...stewardSettings, ...settings },
      grantSelectedRecipient: true
    })
  const round = (session?: string) => {
    const requestId = randomUUID()
    new TimelineRepository(store).insert(
      assistantId,
      [
        {
          id: randomUUID(),
          requestId,
          role: 'user',
          content: '我一直喜欢合成蓝色，请继续聊。',
          status: 'completed',
          createdAt: '2030-01-01T00:00:00Z',
          saved: true
        },
        {
          id: randomUUID(),
          requestId,
          role: 'assistant',
          content: '我们可以继续聊合成主题。',
          status: 'completed',
          createdAt: '2030-01-01T00:00:01Z',
          saved: true
        }
      ],
      session
    )
    return requestId
  }
  const snapshot = () => {
    const value = stewardSnapshotResultSchema.parse(service.query(base))
    if (!value.ok) throw Error(value.error.code)
    return value.data
  }
  const remember = (markdown = '用户喜欢合成红色。') => {
    const result = memory.mutate({
      ...base,
      commandId: randomUUID(),
      mutation: {
        action: 'remember',
        targetId: null,
        expectedVersion: null,
        kind: 'user',
        scope: 'global',
        title: '已有偏好',
        markdown,
        nature: 'user-statement',
        event: null
      }
    })
    if (!result.ok) throw Error(result.error.code)
    return result.data
  }
  const reopen = () => {
    service.close()
    const next = new StewardService(store, memory, provider, clock)
    cleanups.push(() => next.close())
    return next
  }
  return {
    directory,
    path,
    store,
    memory,
    service,
    provider,
    send,
    base,
    assistantId,
    discovery,
    configure,
    round,
    snapshot,
    remember,
    reopen,
    changed,
    discoverySettings,
    stewardSettings,
    changeEndpoint: () => {
      fingerprint = 'c'.repeat(64)
    }
  }
}
