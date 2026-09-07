import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { afterEach, expect, it, vi } from 'vitest'
import { AssistantService } from '../../../src/main/assistant/assistant-service.js'
import { SqliteStore } from '../../../src/main/data/sqlite.js'
import { MemoryService } from '../../../src/main/memory/memory-service.js'
import { TimelineRepository } from '../../../src/main/provider/timeline-repository.js'
import { roundSource, assertRoundSources } from '../../../src/main/background/background-sources.js'
import { RetentionService } from '../../../src/main/retention/retention-service.js'
import {
  BackgroundService,
  type BackgroundProvider
} from '../../../src/main/background/background-service.js'
import {
  backgroundSnapshotResultSchema,
  backgroundConfigureInputSchema
} from '../../../src/shared/background-contract.js'
import type { TransportResult } from '../../../src/main/provider/chat-completions-transport.js'
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
it('does not execute an accepting recycle confirmation after a concurrent explicit rejection won',async()=>{
 const f=fixture()
 const requestId=f.round();f.configure();f.service.run(f.base);await f.done()
 const retention=new RetentionService(f.store,join(f.directory,'memory'),f.memory,undefined,f.service)
 cleanups.push(()=>retention.close())
 const preview=await retention.preview({...f.base,intent:'recycle-original',target:{type:'timeline'}})
 if(!preview.ok)throw Error('preview')
 expect(preview.data.blockers).toEqual([])
 const input={...f.base,previewId:preview.data.id,nonce:preview.data.nonce}
 // Accept yields during its real accepted-source file validation, while reject can commit first.
 const accepting=retention.confirm({...input,commandId:randomUUID(),accept:true})
 const rejected=await retention.confirm({...input,commandId:randomUUID(),accept:false})
 expect(rejected).toMatchObject({ok:true,data:{state:'CANCELLED'}})
 const accepted=await accepting
 expect(accepted.ok).toBe(false)
 expect(f.store.database.prepare('SELECT 1 FROM retention_original_trash WHERE request_id=?').get(requestId)).toBeUndefined()
})