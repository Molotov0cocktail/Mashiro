import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { afterEach, expect, it, vi } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { AssistantService } from '../../src/main/assistant/assistant-service.js'
import { SqliteStore } from '../../src/main/data/sqlite.js'
import { ToolRepository } from '../../src/main/provider/tool-repository.js'
import { migrateRetainedProtocol } from '../../src/main/provider/retained-protocol-schema.js'
import { removeRetainedProtocolFixture } from './retained-protocol-legacy-fixture.js'

const roots: string[] = []
afterEach(() => {
  vi.restoreAllMocks()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'mashiro-retained-migration-'))
  roots.push(root)
  const path = join(root, 'state.sqlite')
  const assistants = AssistantService.open(path)
  const created = assistants.create({
    protocolVersion: 1,
    displayName: '合成旧版助手',
    expectedStateRevision: 0
  })
  if (!created.ok) throw Error('fixture')
  const assistantId = created.data.assistants[0]!.id
  assistants.close()
  const store = new SqliteStore(path),
    ledger = new ToolRepository(store)
  const segment = {
    id: randomUUID(),
    assistantId,
    requestId: randomUUID(),
    endpointFingerprint: 'synthetic-endpoint',
    model: 'GLM-5.3-FLASH',
    adapterVersion: 'glm-5.3-flash-tools-v1',
    messages: [{ role: 'user' as const, content: '合成旧版问题' }],
    createdAt: '2026-09-07T00:00:00.000Z'
  }
  ledger.create(segment)
  const op = ledger.prepare(segment, randomUUID(), {
    id: 'old-clock',
    type: 'function',
    function: { name: 'get_current_time', arguments: '{}' }
  })
  op.state = 'DISPATCHING'
  ledger.update(op)
  op.state = 'SUCCEEDED'
  ledger.update(op, JSON.stringify({ localTime: 'synthetic-old-result' }))
  ledger.messages(segment.id, [...segment.messages, { role: 'assistant', content: '旧回答' }], true)
  removeRetainedProtocolFixture(store.database)
  store.database.exec('PRAGMA user_version=15')
  const oldRows = snapshot(store.database)
  store.close()
  return { path, segment, oldRows }
}
function snapshot(database: DatabaseSync) {
  return [
    'protocol_segments',
    'tool_operations',
    'protocol_results',
    'assistants',
    'content_tombstones'
  ].map((table) => database.prepare('SELECT * FROM ' + table).all())
}

it('migrates a real populated v15 schema preserving operation/result foreign keys and exact existing records across reopen', () => {
  const f = fixture()
  const store = new SqliteStore(f.path)
  try {
    expect(snapshot(store.database)).toEqual(f.oldRows)
    expect(store.database.prepare('PRAGMA user_version').get()!.user_version).toBe(18)
    expect(store.database.prepare('PRAGMA foreign_keys').get()!.foreign_keys).toBe(1)
    expect(store.database.prepare('PRAGMA foreign_key_check').all()).toEqual([])
    expect(
      store.database
        .prepare(
          "SELECT count(*) n FROM sqlite_master WHERE type='trigger' AND tbl_name='protocol_segments'"
        )
        .get()!.n
    ).toBe(4)
    store.database
      .prepare("UPDATE protocol_segments SET mode='retained-thinking' WHERE id=?")
      .run(f.segment.id)
    expect(() =>
      store.database
        .prepare("UPDATE protocol_segments SET mode='unrecognized' WHERE id=?")
        .run(f.segment.id)
    ).toThrow()
    const epoch = Number(store.database.prepare('SELECT epoch FROM retention_state').get()!.epoch)
    store.database
      .prepare("UPDATE protocol_segments SET status='closed' WHERE id=?")
      .run(f.segment.id)
    expect(
      Number(store.database.prepare('SELECT epoch FROM retention_state').get()!.epoch)
    ).toBeGreaterThan(epoch)
  } finally {
    store.close()
  }
  const reopened = new SqliteStore(f.path)
  try {
    expect(reopened.database.prepare('PRAGMA integrity_check').get()!.integrity_check).toBe('ok')
  } finally {
    reopened.close()
  }
})

it('rolls back failure after the old table was dropped, restoring schema15 records, guards, CHECK and foreign-key enforcement', () => {
  const f = fixture(),
    database = new DatabaseSync(f.path)
  database.exec('PRAGMA foreign_keys=ON')
  const original = database.exec.bind(database)
  const spy = vi.spyOn(database, 'exec').mockImplementation((sql) => {
    original(sql)
    if (sql.startsWith('DROP TABLE protocol_segments;')) throw Error('SYNTHETIC_AFTER_DROP')
  })
  try {
    expect(() => migrateRetainedProtocol(database)).toThrow('SYNTHETIC_AFTER_DROP')
    spy.mockRestore()
    expect(snapshot(database)).toEqual(f.oldRows)
    expect(database.prepare('PRAGMA user_version').get()!.user_version).toBe(15)
    expect(database.prepare('PRAGMA foreign_keys').get()!.foreign_keys).toBe(1)
    expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([])
    expect(
      database
        .prepare(
          "SELECT count(*) n FROM sqlite_master WHERE type='trigger' AND tbl_name='protocol_segments'"
        )
        .get()!.n
    ).toBe(4)
    expect(() =>
      database
        .prepare("UPDATE protocol_segments SET mode='retained-thinking' WHERE id=?")
        .run(f.segment.id)
    ).toThrow()
    migrateRetainedProtocol(database)
    expect(database.prepare('PRAGMA user_version').get()!.user_version).toBe(16)
  } finally {
    database.close()
  }
})

it('rejects a missing legacy tombstone guard without changing the schema or existing records', () => {
  const f = fixture(),
    database = new DatabaseSync(f.path)
  try {
    database.exec('PRAGMA foreign_keys=ON; DROP TRIGGER retention_segment_update')
    expect(() => migrateRetainedProtocol(database)).toThrow('PROTOCOL_GUARD_INVALID')
    expect(database.prepare('PRAGMA user_version').get()!.user_version).toBe(15)
    expect(snapshot(database)).toEqual(f.oldRows)
    expect(
      database.prepare("SELECT name FROM sqlite_master WHERE name='protocol_segments_next'").all()
    ).toEqual([])
  } finally {
    database.close()
  }
})
