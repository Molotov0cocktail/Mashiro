import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { afterEach, expect, it, vi } from 'vitest'
import { AssistantService } from '../../../src/main/assistant/assistant-service.js'
import { SqliteStore } from '../../../src/main/data/sqlite.js'
import { MemoryService } from '../../../src/main/memory/memory-service.js'
import { TimelineRepository } from '../../../src/main/provider/timeline-repository.js'
import { roundSource, assertRoundSources, currentRetentionIntent } from '../../../src/main/background/background-sources.js'
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
it('retention proof remains exact across unrelated cleanup and rolls back atomically on storage failure',async()=>{
 const f=fixture();f.round();f.configure();f.service.run(f.base);await f.done()
 const retention=new RetentionService(f.store,join(f.directory,'memory'),f.memory,undefined,f.service)
 cleanups.push(()=>retention.close())
 const preview=async()=>{
  const result=await retention.preview({...f.base,intent:'recycle-original',target:{type:'timeline'}})
  if(!result.ok)throw Error('preview');return result.data
 }
 const rejected=await preview()
 expect(()=>currentRetentionIntent(f.store,f.assistantId,rejected)).toThrow('PERMISSION_DENIED')
 const rejectedId=randomUUID()
 expect(await retention.confirm({...f.base,commandId:rejectedId,previewId:rejected.id,nonce:rejected.nonce,accept:false})).toMatchObject({ok:true})
 const originalProof=f.store.database.prepare('SELECT manifest_json FROM retention_previews WHERE id=?').get(rejected.id)!.manifest_json
 const invalidated=await preview(),accepted=await preview(),acceptedId=randomUUID()
 expect(await retention.confirm({...f.base,commandId:acceptedId,previewId:accepted.id,nonce:accepted.nonce,accept:true})).toMatchObject({ok:true})
 expect(f.store.database.prepare('SELECT manifest_json FROM retention_previews WHERE id=?').get(rejected.id)!.manifest_json).toBe(originalProof)
 expect(currentRetentionIntent(f.store,f.assistantId,rejected)).toMatchObject({state:'CANCELLED',receipt:{commandId:rejectedId}})
 expect(currentRetentionIntent(f.store,f.assistantId,invalidated)).toEqual({state:'INVALIDATED_NOT_APPLIED',receipt:null})
 f.store.database.prepare('UPDATE retention_previews SET manifest_json=? WHERE id=?').run(JSON.stringify({version:1,kind:'confirmation',commandId:acceptedId,accept:true}),rejected.id)
 expect(()=>currentRetentionIntent(f.store,f.assistantId,rejected)).toThrow('PERMISSION_DENIED')
 f.store.database.prepare("UPDATE retention_previews SET manifest_json='{}' WHERE id=?").run(rejected.id)
 expect(()=>currentRetentionIntent(f.store,f.assistantId,rejected)).toThrow('PERMISSION_DENIED')
 const rollback=await preview(),rollbackId=randomUUID()
 f.store.database.exec("CREATE TRIGGER review_proof_failure BEFORE UPDATE ON retention_previews BEGIN SELECT RAISE(ABORT,'synthetic proof fault'); END")
 expect(await retention.confirm({...f.base,commandId:rollbackId,previewId:rollback.id,nonce:rollback.nonce,accept:false})).toMatchObject({ok:false})
 expect(f.store.database.prepare('SELECT 1 FROM retention_commands WHERE id=?').get(rollbackId)).toBeUndefined()
 expect(f.store.database.prepare('SELECT state FROM retention_previews WHERE id=?').get(rollback.id)!.state).toBe('pending')
})