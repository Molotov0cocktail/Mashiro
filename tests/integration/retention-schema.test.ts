import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, expect, it } from 'vitest'
import { SqliteStore } from '../../src/main/data/sqlite.js'
import { AssistantRepository } from '../../src/main/assistant/assistant-repository.js'
import { removeRetentionFixture } from './retention-legacy-fixture.js'
const roots: string[] = []
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })))
it('migrates a real v6-shaped database atomically and preserves legacy identities on a v7 DDL collision', () => {
  const root = mkdtempSync(join(tmpdir(), 'mashiro-retention-migration-'))
  roots.push(root)
  const path = join(root, 'state.sqlite'),
    store = new SqliteStore(path)
  const before = new AssistantRepository(store).create('合成旧数据', 0)
  removeRetentionFixture(store.database)
  store.database.exec('PRAGMA user_version=6; CREATE TABLE retention_jobs(collision TEXT)')
  store.close()
  expect(() => new SqliteStore(path)).toThrow()
  const raw = new DatabaseSync(path)
  expect(raw.prepare('PRAGMA user_version').get()).toEqual({ user_version: 6 })
  expect(
    raw.prepare("SELECT name FROM sqlite_master WHERE name='retention_state'").get()
  ).toBeUndefined()
  expect(raw.prepare('SELECT display_name FROM assistants').get()).toEqual({
    display_name: '合成旧数据'
  })
  raw.exec('DROP TABLE retention_jobs')
  raw.close()
  const upgraded = new SqliteStore(path)
  expect(upgraded.database.prepare('PRAGMA user_version').get()).toEqual({ user_version: 8 })
  expect(new AssistantRepository(upgraded).snapshot()).toEqual(before)
  expect(upgraded.database.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  upgraded.close()
})
it('fails closed if a persisted retention read guard is missing', () => {
  const root = mkdtempSync(join(tmpdir(), 'mashiro-retention-guard-'))
  roots.push(root)
  const path = join(root, 'state.sqlite'),
    store = new SqliteStore(path)
  store.database.exec('DROP VIEW readable_timeline_messages')
  store.close()
  expect(() => new SqliteStore(path)).toThrow()
})
