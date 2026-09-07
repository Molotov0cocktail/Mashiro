import { mkdirSync, mkdtempSync, realpathSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, basename } from 'node:path'
import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { openProductionSession } from '../../src/main/data/production-session.js'
import { SqliteStore } from '../../src/main/data/sqlite.js'
import { AssistantService } from '../../src/main/assistant/assistant-service.js'
import { MemoryService } from '../../src/main/memory/memory-service.js'
import { RetentionService } from '../../src/main/retention/retention-service.js'
import { ItemService } from '../../src/main/item/item-service.js'

it('restores through a real later assistant purge while retaining global memory and a formal item', async () => {
  const root = mkdtempSync(join(realpathSync.native(tmpdir()), 'mashiro-gov-purge-'))
  const config = join(root, '配置'),
    data = join(root, '数据'),
    backup = join(root, '备份'),
    target = join(root, '恢复')
  for (const path of [config, data, backup, target]) mkdirSync(path)
  const session = await openProductionSession({
    configurationDirectory: config,
    choose: async () => ({ action: 'create', directory: data }),
    prepareExisting: async () => {},
    onOwnershipLost: () => {}
  })
  if (!session) throw Error('NO_SESSION')
  const stores: SqliteStore[] = []
  let retention: RetentionService | undefined
  try {
    const assistants = AssistantService.open(session.databasePath)
    const first = assistants.create({
      protocolVersion: 1,
      displayName: '将删除',
      expectedStateRevision: 0
    })
    if (!first.ok) throw Error('FIRST')
    const assistantId = first.data.assistants[0]!.id
    const second = assistants.create({
      protocolVersion: 1,
      displayName: '保留',
      expectedStateRevision: first.data.stateRevision
    })
    if (!second.ok) throw Error('SECOND')
    const replacementAssistantId = second.data.assistants.find((a) => a.id !== assistantId)!.id
    assistants.close()
    const store = new SqliteStore(session.databasePath)
    stores.push(store)
    const memory = new MemoryService(store, join(data, 'memory'), () => ({
      fingerprint: 'b'.repeat(64),
      display: '合成'
    }))
    const save = (scope: 'assistant' | 'global', markdown: string) => {
      const result = memory.mutate({
        protocolVersion: 1,
        assistantId,
        commandId: randomUUID(),
        mutation: {
          action: 'remember',
          targetId: null,
          expectedVersion: null,
          scope,
          kind: 'user',
          title: '合成',
          markdown,
          nature: 'user-statement',
          event: null
        }
      })
      if (!result.ok || !result.data.objectId) throw Error('MEMORY')
      return result.data.objectId
    }
    const privateId = save('assistant', 'PRIVATE-PURGED-BODY'),
      globalId = save('global', 'GLOBAL-PRESERVED-BODY')
    const items = new ItemService(
      store,
      () => ({ fingerprint: null, display: null }),
      () => undefined
    )
    const item = items.applyMutation(
      assistantId,
      randomUUID(),
      {
        action: 'create',
        content: {
          kind: 'task',
          title: 'FORMAL-PRESERVED',
          description: '',
          status: 'open',
          dueAt: null,
          timeZone: null,
          relatedIds: [],
          parentId: null,
          counterpart: ''
        }
      },
      []
    )
    store.close()
    const receipt = await session.backup(backup, () => {})
    const later = new SqliteStore(session.databasePath)
    stores.push(later)
    const laterMemory = new MemoryService(later, join(data, 'memory'), () => ({
      fingerprint: 'b'.repeat(64),
      display: '合成'
    }))
    retention = new RetentionService(later, join(data, 'memory'), laterMemory)
    const preview = await retention.preview({
      protocolVersion: 1,
      assistantId,
      intent: 'purge-assistant',
      target: { type: 'assistant', replacementAssistantId }
    })
    if (!preview.ok) throw Error(JSON.stringify(preview))
    expect(preview.data.blockers).toEqual([])
    const confirmed = await retention.confirm({
      protocolVersion: 1,
      assistantId,
      commandId: randomUUID(),
      previewId: preview.data.id,
      nonce: preview.data.nonce,
      accept: true
    })
    expect(confirmed.ok).toBe(true)
    await retention.drain()
    retention.close()
    later.close()
    await session.restore(backup, target, receipt, () => {})
    const restored = new SqliteStore(join(target, 'mashiro.sqlite'))
    stores.push(restored)
    const restoredMemory = new MemoryService(restored, join(target, 'memory'), () => ({
      fingerprint: 'b'.repeat(64),
      display: '合成'
    }))
    expect(
      restored.database.prepare('SELECT 1 FROM assistant_tombstones WHERE id=?').get(assistantId)
    ).toBeDefined()
    expect(
      restored.database.prepare('SELECT persona FROM assistants WHERE id=?').get(assistantId)
        ?.persona
    ).toBe('')
    expect(
      JSON.parse(
        String(
          restored.database
            .prepare('SELECT record_json FROM memory_objects WHERE id=?')
            .get(privateId)!.record_json
        )
      ).markdown
    ).toBe('')
    expect(
      restoredMemory.acceptedBackgroundMemory(replacementAssistantId, globalId, 1).markdown
    ).toBe('GLOBAL-PRESERVED-BODY')
    expect(
      String(
        restored.database.prepare('SELECT record_json FROM items WHERE id=?').get(item.objectId!)!
          .record_json
      )
    ).toContain('FORMAL-PRESERVED')
    expect(
      readFileSync(join(target, 'mashiro.sqlite')).includes(Buffer.from('PRIVATE-PURGED-BODY'))
    ).toBe(false)
    restored.close()
    await session.select(target, () => {})
  } finally {
    retention?.close()
    for (const store of stores) if (store.database.isOpen) store.close()
    await session.release()
    const actual = realpathSync.native(root)
    if (
      dirname(actual) !== realpathSync.native(tmpdir()) ||
      !basename(actual).startsWith('mashiro-gov-purge-')
    )
      rejectUnownedRoot()
    rmSync(actual, { recursive: true, force: true })
  }
})

function rejectUnownedRoot(): never {
  throw Error('UNOWNED_ROOT')
}
