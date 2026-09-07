import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { openProductionSession } from '../../src/main/data/production-session.js'
import { SqliteStore } from '../../src/main/data/sqlite.js'
import { AssistantService } from '../../src/main/assistant/assistant-service.js'
import { ItemService } from '../../src/main/item/item-service.js'
import { emptyItem } from '../../src/main/item/item-intent.js'

it('review014: confirmed formal-item deletion survives a real old full-backup restore without removing an unrelated item', async () => {
  const root = mkdtempSync(join(realpathSync.native(tmpdir()), 'mashiro-review014-formal-'))
  const config = join(root, '配置'),
    data = join(root, '数据'),
    backup = join(root, '备份'),
    target = join(root, '恢复')
  for (const path of [config, data, backup, target]) mkdirSync(path)
  const session = await openProductionSession({
    configurationDirectory: config,
    choose: async () => ({ action: 'create', directory: data }),
    prepareExisting: async () => {},
    onOwnershipLost() {}
  })
  if (!session) throw Error('NO_SESSION')
  const stores: SqliteStore[] = []
  try {
    const assistants = AssistantService.open(session.databasePath)
    let assistantId: string
    try {
      const result = assistants.create({
        protocolVersion: 1,
        displayName: '合成',
        expectedStateRevision: 0
      })
      if (!result.ok) throw Error('NO_ASSISTANT')
      assistantId = result.data.assistants[0]!.id
    } finally {
      assistants.close()
    }
    const open = (path: string) => {
      const store = new SqliteStore(path)
      stores.push(store)
      return {
        store,
        items: new ItemService(
          store,
          () => ({ fingerprint: null, display: null }),
          () => undefined
        )
      }
    }
    const first = open(session.databasePath)
    const kept = first.items.applyMutation(
      assistantId,
      randomUUID(),
      { action: 'create', content: emptyItem('task', 'FORMAL-KEEP') },
      []
    )
    if (!kept.objectId) throw Error('NO_KEEP')
    const removed = first.items.applyMutation(
      assistantId,
      randomUUID(),
      { action: 'create', content: emptyItem('task', 'FORMAL-DELETE') },
      [{ type: 'item', id: kept.objectId, assistantId, version: 1 }]
    )
    if (!removed.objectId) throw Error('NO_DELETE')
    const keptRow = first.store.database
      .prepare('SELECT * FROM items WHERE id=?')
      .get(kept.objectId)
    expect(
      first.store.database
        .prepare("SELECT count(*) AS n FROM item_sources WHERE node_type='item' AND node_id=?")
        .get(removed.objectId)!.n
    ).toBe(1)
    first.store.close()
    const receipt = await session.backup(backup, () => {})
    const backupBytes = readFileSync(join(backup, 'payload', 'mashiro.sqlite'))
    const later = open(session.databasePath)
    const base = { protocolVersion: 1 as const, assistantId }
    const preview = later.items.preview({
      ...base,
      commandId: randomUUID(),
      action: 'delete',
      targets: [{ id: removed.objectId, expectedVersion: 1 }]
    })
    if (!preview.ok) throw Error(JSON.stringify(preview))
    expect(
      later.items.confirm({ ...base, confirmationId: preview.data.confirmationId, accept: true })
    ).toMatchObject({ ok: true })
    expect(
      later.store.database
        .prepare("SELECT id FROM item_tombstones WHERE kind='item' AND id=?")
        .get(removed.objectId)
    ).toBeDefined()
    later.store.close()
    await session.restore(backup, target, receipt, () => {})
    const restored = open(join(target, 'mashiro.sqlite'))
    expect(
      restored.store.database.prepare('SELECT * FROM items WHERE id=?').get(removed.objectId)
    ).toBeUndefined()
    expect(
      restored.store.database
        .prepare("SELECT id FROM item_tombstones WHERE kind='item' AND id=?")
        .get(removed.objectId)
    ).toBeDefined()
    expect(
      restored.store.database
        .prepare("SELECT count(*) AS n FROM item_sources WHERE node_type='item' AND node_id=?")
        .get(removed.objectId)!.n
    ).toBe(0)
    expect(
      restored.store.database.prepare('SELECT * FROM items WHERE id=?').get(kept.objectId)
    ).toEqual(keptRow)
    expect(restored.items.query(base)).toMatchObject({
      ok: true,
      data: { formalCount: 1, items: [{ id: kept.objectId }] }
    })
    expect(restored.store.database.prepare('PRAGMA integrity_check').get()!.integrity_check).toBe(
      'ok'
    )
    expect(restored.store.database.prepare('PRAGMA foreign_key_check').all()).toEqual([])
    expect(readFileSync(join(backup, 'payload', 'mashiro.sqlite'))).toEqual(backupBytes)
  } finally {
    for (const store of stores) if (store.database.isOpen) store.close()
    await session.release()
    const actual = realpathSync.native(root)
    if (
      dirname(actual) !== realpathSync.native(tmpdir()) ||
      !basename(actual).startsWith('mashiro-review014-formal-')
    )
      rejectUnownedRoot()
    rmSync(actual, { recursive: true, force: true })
  }
})

function rejectUnownedRoot(): never {
  throw Error('UNOWNED_ROOT')
}
