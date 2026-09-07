import { randomUUID } from 'node:crypto'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { expect, it } from 'vitest'
import { AssistantRepository } from '../../src/main/assistant/assistant-repository.js'
import { SqliteStore } from '../../src/main/data/sqlite.js'
import { MemoryService } from '../../src/main/memory/memory-service.js'
import { RetentionService } from '../../src/main/retention/retention-service.js'

it.skipIf(process.env.MASHIRO_REVIEW_RET_COST !== '1')(
  'records actual policy snapshot and accepted write cost with 1000 small accepted bodies',
  async () => {
    const root = mkdtempSync(join(tmpdir(), 'mashiro-review009-cost-'))
    const store = new SqliteStore(join(root, 'state.sqlite'))
    const assistantId = new AssistantRepository(store).create('独立合成计量', 0).assistants[0]!.id
    const memory = new MemoryService(store, join(root, 'memory'), () => ({
      fingerprint: 'synthetic',
      display: 'synthetic'
    }))
    const remember = () =>
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
          title: '独立合成',
          markdown: 'x'.repeat(4096),
          nature: 'faithful-summary',
          event: null
        }
      })
    let retention: RetentionService | undefined
    try {
      for (let i = 0; i < 1000; i++) expect(await remember()).toMatchObject({ ok: true })
      const start = performance.now()
      retention = new RetentionService(store, join(root, 'memory'), memory)
      const constructorMs = performance.now() - start
      const snapshotStart = performance.now()
      const snapshot = await retention.policy({ protocolVersion: 1, assistantId })
      const snapshotMs = performance.now() - snapshotStart
      expect(snapshot).toMatchObject({
        ok: true,
        data: { usage: { acceptedBytes: 4096000, unknownObjects: 0 } }
      })
      const writeStart = performance.now()
      const result = await remember()
      const acceptedWriteMs = performance.now() - writeStart
      expect(result).toMatchObject({ ok: true })
      writeFileSync(
        '.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/retention-009-review-measurement-cost-result.json',
        JSON.stringify(
          {
            root,
            objects: 1000,
            bodyBytesEach: 4096,
            acceptedBytes: 4096000,
            constructorMs,
            snapshotMs,
            acceptedWriteMs,
            note: 'Single warm-cache synthetic sample; seeding used production MemoryService before policy guard installation. Measured write used the installed production guard. No timing pass/fail threshold.'
          },
          null,
          2
        ) + '\n',
        { flag: 'wx' }
      )
    } finally {
      retention?.close()
      store.close()
    }
  },
  120000
)
