import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, basename } from 'node:path'
import { randomUUID } from 'node:crypto'
import { afterEach, expect, it } from 'vitest'
import {
  openProductionSession,
  type ProductionSession
} from '../../src/main/data/production-session.js'
import { AssistantService } from '../../src/main/assistant/assistant-service.js'
import { SqliteStore } from '../../src/main/data/sqlite.js'
import { MemoryService } from '../../src/main/memory/memory-service.js'
import type { MemoryMutation } from '../../src/shared/memory-contract.js'

const roots: string[] = [],
  sessions: ProductionSession[] = [],
  stores: SqliteStore[] = []
afterEach(async () => {
  for (const store of stores.splice(0)) if (store.database.isOpen) store.close()
  for (const session of sessions.splice(0)) await session.release()
  for (const root of roots.splice(0)) {
    const actual = realpathSync.native(root)
    if (
      dirname(actual) !== realpathSync.native(tmpdir()) ||
      !basename(actual).startsWith('mashiro-gov-restore-')
    )
      throw Error('UNOWNED_ROOT')
    rmSync(actual, { recursive: true, force: true })
  }
})
const remember = (markdown: string): MemoryMutation => ({
  action: 'remember',
  targetId: null,
  expectedVersion: null,
  kind: 'user',
  scope: 'global',
  title: '合成版本',
  markdown,
  nature: 'user-statement',
  event: null
})
it('a real old full backup cannot resurrect a later corrected accepted Markdown or permission grant', async () => {
  const root = mkdtempSync(join(realpathSync.native(tmpdir()), 'mashiro-gov-restore-'))
  roots.push(root)
  const config = join(root, '配置'),
    data = join(root, '原始'),
    backup = join(root, '备份'),
    destination = join(root, '还原')
  for (const path of [config, data, backup, destination]) mkdirSync(path)
  const session = await openProductionSession({
    configurationDirectory: config,
    choose: async () => ({ action: 'create', directory: data }),
    prepareExisting: async () => {},
    onOwnershipLost: () => {}
  })
  if (!session) throw Error('NO_SESSION')
  sessions.push(session)
  const assistant = AssistantService.open(session.databasePath)
  const made = assistant.create({
    protocolVersion: 1,
    displayName: '合成',
    expectedStateRevision: 0
  })
  if (!made.ok) throw Error('NO_ASSISTANT')
  const assistantId = made.data.assistants[0]!.id
  assistant.close()
  const openMemory = () => {
    const store = new SqliteStore(session.databasePath)
    stores.push(store)
    const memory = new MemoryService(store, join(data, 'memory'), () => ({
      fingerprint: 'a'.repeat(64),
      display: '合成'
    }))
    return { store, memory }
  }
  const first = openMemory()
  const fingerprint = 'a'.repeat(64)
  const granted = first.memory.setPermissions({
    protocolVersion: 1,
    assistantId,
    scope: 'global',
    expectedVersion: 0,
    read: true,
    write: true,
    writeInferences: false,
    receive: true
  })
  expect(granted.ok).toBe(true)
  const stable = first.memory.mutate({
    protocolVersion: 1,
    assistantId,
    commandId: randomUUID(),
    mutation: remember('SYNTHETIC-STABLE-BODY')
  })
  if (!stable.ok || !stable.data.objectId) throw Error('NO_STABLE_MEMORY')
  const stableSource = {
    type: 'memory' as const,
    id: stable.data.objectId,
    assistantId,
    version: 1
  }
  expect(() => first.memory.assertSource(stableSource, assistantId, fingerprint)).not.toThrow()
  const saved = first.memory.mutate({
    protocolVersion: 1,
    assistantId,
    commandId: randomUUID(),
    mutation: remember('SYNTHETIC-OBSOLETE-BODY')
  })
  if (!saved.ok) throw Error(JSON.stringify(saved))
  first.store.close()
  const receipt = await session.backup(backup, () => {})
  const second = openMemory()
  const corrected = second.memory.mutate({
    protocolVersion: 1,
    assistantId,
    commandId: randomUUID(),
    mutation: {
      ...remember('SYNTHETIC-CURRENT-BODY'),
      action: 'correct',
      targetId: saved.data.objectId,
      expectedVersion: 1
    }
  })
  expect(corrected.ok).toBe(true)
  const revoked = second.memory.setPermissions({
    protocolVersion: 1,
    assistantId,
    scope: 'global',
    expectedVersion: second.memory.permissionState(assistantId, 'global').version,
    read: false,
    write: false,
    writeInferences: false,
    receive: false
  })
  expect(revoked.ok).toBe(true)
  second.store.close()
  await session.restore(backup, destination, receipt, () => {})
  const restored = new SqliteStore(join(destination, 'mashiro.sqlite'))
  stores.push(restored)
  const row = restored.database
    .prepare('SELECT version,record_json FROM memory_objects WHERE id=?')
    .get(saved.data.objectId!)!
  expect(row.version).toBe(2)
  expect(JSON.parse(String(row.record_json))).toMatchObject({
    state: 'suppressed',
    objectVersion: 2,
    markdown: ''
  })
  for (const name of readdirSync(join(destination, 'memory')))
    expect(readFileSync(join(destination, 'memory', name), 'utf8')).not.toContain(
      'SYNTHETIC-OBSOLETE-BODY'
    )
  const restoredMemory = new MemoryService(restored, join(destination, 'memory'), () => ({
    fingerprint,
    display: '合成'
  }))
  expect(
    restoredMemory.acceptedBackgroundMemory(assistantId, stable.data.objectId, 1).markdown
  ).toBe('SYNTHETIC-STABLE-BODY')
  expect(() => restoredMemory.assertSource(stableSource, assistantId, fingerprint)).toThrow(
    'PERMISSION_DENIED'
  )
  expect(restoredMemory.permissionState(assistantId, 'global').read).toBe(false)
  restored.close()
  await session.select(destination, () => {})
})
