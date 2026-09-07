import { createHash, randomUUID } from 'node:crypto'
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { DatabaseSync } from 'node:sqlite'
import { expect, it } from 'vitest'
import { SqliteStore } from '../../src/main/data/sqlite.js'
import { MemoryService } from '../../src/main/memory/memory-service.js'
import { RetentionService } from '../../src/main/retention/retention-service.js'

const evidence = '.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/'
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
it.skipIf(process.env.MASHIRO_REVIEW_RET_V2_COPY !== '1')(
  'measures v2 at the real default capacity on a fresh copy without reseeding',
  async () => {
    const source = 'C:/Users/30910/AppData/Local/Temp/mashiro-review009-default-cost-Vre6DR'
    const sourceDbHash = hash(readFileSync(join(source, 'state.sqlite')))
    const paths = [
      'src/main/retention/retention-policy-service.ts',
      'src/main/retention/retention-policy-schema.ts',
      'src/main/retention/retention-service.ts',
      'src/main/memory/memory-service.ts',
      'src/main/data/schema.ts'
    ]
    const sourceHashes = Object.fromEntries(paths.map((path) => [path, hash(readFileSync(path))]))
    const root = mkdtempSync(join(tmpdir(), 'mashiro-review009-v2-default-'))
    const copyStart = performance.now()
    cpSync(source, root, { recursive: true, errorOnExist: true, force: false })
    const copyMs = performance.now() - copyStart
    const legacy = new DatabaseSync(join(root, 'state.sqlite'))
    let assistantId: string
    try {
      expect(legacy.prepare('SELECT count(*) AS n FROM memory_objects').get()!.n).toBe(25600)
      assistantId = String(legacy.prepare('SELECT id FROM assistants LIMIT 1').get()!.id)
      legacy.exec(
        'DELETE FROM memory_objects WHERE rowid=(SELECT max(rowid) FROM memory_objects); DROP TABLE retention_policy_receipts; DROP TABLE retention_policy_runs; DROP TABLE retention_policy_commands; DROP TABLE retention_policy_previews; DROP TABLE retention_policy_objects; DROP TABLE retention_policy; PRAGMA user_version=18'
      )
    } finally {
      legacy.close()
    }
    const store = new SqliteStore(join(root, 'state.sqlite'))
    const memory = new MemoryService(store, join(root, 'memory'), () => ({
      fingerprint: 'synthetic',
      display: 'synthetic'
    }))
    let retention: RetentionService | undefined
    let monitor: ReturnType<typeof setInterval> | undefined
    try {
      const start = performance.now()
      retention = new RetentionService(store, join(root, 'memory'), memory)
      const constructorMs = performance.now() - start
      const initialStart = performance.now()
      const initial = await retention.policy({ protocolVersion: 1, assistantId })
      const initialSnapshotMs = performance.now() - initialStart
      expect(initial).toMatchObject({
        ok: true,
        data: {
          usage: { measurement: 'UNKNOWN', unknownObjects: 25599 },
          audit: { state: 'PENDING' }
        }
      })
      const auditStart = performance.now()
      let previousTick = auditStart,
        maxTickGapMs = 0,
        tickCount = 0
      monitor = setInterval(() => {
        const now = performance.now()
        maxTickGapMs = Math.max(maxTickGapMs, now - previousTick)
        previousTick = now
        tickCount++
      }, 10)
      for (;;) {
        const value = await retention.policy({ protocolVersion: 1, assistantId })
        if (value.ok && value.data.audit.state === 'COMPLETE') break
        if (performance.now() - auditStart > 120000) throw Error('AUDIT_TIMEOUT')
        await new Promise((resolve) => setTimeout(resolve, 25))
      }
      const completeAuditMs = performance.now() - auditStart
      clearInterval(monitor)
      monitor = undefined
      const snapshotStart = performance.now()
      const final = await retention.policy({ protocolVersion: 1, assistantId })
      const snapshotMs = performance.now() - snapshotStart
      expect(final).toMatchObject({
        ok: true,
        data: { usage: { acceptedBytes: 104853504, unknownObjects: 0, measurement: 'COMPLETE' } }
      })
      const writeStart = performance.now()
      const accepted = memory.mutate({
        protocolVersion: 1,
        assistantId,
        commandId: randomUUID(),
        mutation: {
          action: 'remember',
          targetId: null,
          expectedVersion: null,
          kind: 'continuity',
          scope: 'assistant',
          title: '独立v2新增',
          markdown: 'x'.repeat(4096),
          nature: 'faithful-summary',
          event: null
        }
      })
      const acceptedWriteMs = performance.now() - writeStart
      expect(accepted).toMatchObject({ ok: true })
      expect(store.database.prepare('SELECT count(*) AS n FROM memory_objects').get()!.n).toBe(
        25600
      )
      expect(hash(readFileSync(join(source, 'state.sqlite')))).toBe(sourceDbHash)
      const endHashes = Object.fromEntries(paths.map((path) => [path, hash(readFileSync(path))]))
      expect(endHashes).toEqual(sourceHashes)
      writeFileSync(
        evidence + 'retention-009-review-v2-default-copy-result-01.json',
        JSON.stringify(
          {
            root,
            sourceDbHash,
            sourceUnchanged: true,
            sourceHashes,
            copyMs,
            constructorMs,
            initialSnapshotMs,
            completeAuditMs,
            maxTickGapMs,
            tickCount,
            snapshotMs,
            acceptedWriteMs,
            finalObjectCount: 25600,
            finalAcceptedLogicalBytes: 104857600
          },
          null,
          2
        ) + '\n',
        { flag: 'wx' }
      )
    } finally {
      if (monitor) clearInterval(monitor)
      retention?.close()
      store.close()
    }
  },
  180000
)
