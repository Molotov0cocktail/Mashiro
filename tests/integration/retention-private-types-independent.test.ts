import { randomUUID } from 'node:crypto'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { expect, it } from 'vitest'
import { AssistantService } from '../../src/main/assistant/assistant-service.js'
import { SqliteStore } from '../../src/main/data/sqlite.js'
import { MemoryService } from '../../src/main/memory/memory-service.js'
import { RetentionService } from '../../src/main/retention/retention-service.js'

function removeOwnedRoot(root: string, temporary: string): void {
  const actual = realpathSync.native(root)
  if (dirname(actual) !== temporary || !basename(actual).startsWith('mashiro-private-review-'))
    throw Error('UNOWNED_REVIEW_ROOT')
  rmSync(actual, { recursive: true, force: true })
}

it.each(['user', 'event'] as const)(
  'rejects a stale assistant purge after a new private %s enters its scope',
  async (kind) => {
    const temporary = realpathSync.native(tmpdir())
    const root = mkdtempSync(join(temporary, 'mashiro-private-review-'))
    const databasePath = join(root, 'mashiro.sqlite')
    const assistants = AssistantService.open(databasePath)
    let store: SqliteStore | undefined
    let retention: RetentionService | undefined
    try {
      const first = assistants.create({
        protocolVersion: 1,
        displayName: '独立删除目标',
        expectedStateRevision: 0
      })
      if (!first.ok) throw Error('fixture assistant')
      const assistantId = first.data.assistants[0]!.id
      const second = assistants.create({
        protocolVersion: 1,
        displayName: '独立保留助手',
        expectedStateRevision: first.data.stateRevision
      })
      if (!second.ok) throw Error('fixture replacement')
      const replacementAssistantId = second.data.assistants.find((a) => a.id !== assistantId)!.id
      store = new SqliteStore(databasePath)
      const memory = new MemoryService(store, join(root, 'memory'), () => null)
      retention = new RetentionService(store, join(root, 'memory'), memory)
      const input = {
        protocolVersion: 1,
        assistantId,
        intent: 'purge-assistant',
        target: { type: 'assistant', replacementAssistantId }
      }
      const preview = await retention.preview(input)
      if (!preview.ok) throw Error('fixture preview')
      expect(preview.data.blockers).toEqual([])
      const created = memory.mutate({
        protocolVersion: 1,
        assistantId,
        commandId: randomUUID(),
        mutation: {
          action: 'remember',
          targetId: null,
          expectedVersion: null,
          kind,
          scope: 'assistant',
          title: '预览后新增私有记录',
          markdown: '本条记录尚未进入旧确认的影响范围。',
          nature: 'user-statement',
          event:
            kind === 'event'
              ? { status: 'reported-happened', occurredAt: null, timeZone: null }
              : null
        }
      })
      if (!created.ok) throw Error('fixture private record')
      expect(
        await retention.confirm({
          protocolVersion: 1,
          assistantId,
          commandId: randomUUID(),
          previewId: preview.data.id,
          nonce: preview.data.nonce,
          accept: true
        })
      ).toMatchObject({ ok: false, error: { code: 'STALE_PREVIEW' } })
      expect(
        store.database.prepare('SELECT count(*) AS n FROM assistant_tombstones').get()!.n
      ).toBe(0)
      expect(store.database.prepare('SELECT count(*) AS n FROM retention_jobs').get()!.n).toBe(0)
      expect(
        store.database
          .prepare('SELECT version FROM memory_objects WHERE id=?')
          .get(created.data.objectId)
      ).toMatchObject({ version: 1 })
      const refreshed = await retention.preview(input)
      expect(refreshed).toMatchObject({
        ok: true,
        data: { blockers: [], memoryIds: [created.data.objectId] }
      })
    } finally {
      retention?.close()
      store?.close()
      assistants.close()
      removeOwnedRoot(root, temporary)
    }
  }
)
