import { randomUUID } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProductionLocationStore } from '../../src/main/data/production-location.js'

const fault = vi.hoisted(() => ({ rename: false }))
vi.mock('node:fs', async (original) => {
  const actual = await original<typeof import('node:fs')>()
  return {
    ...actual,
    renameSync: (...args: Parameters<typeof actual.renameSync>) => {
      if (fault.rename) throw new Error('synthetic atomic replacement failure')
      return actual.renameSync(...args)
    }
  }
})
const roots: string[] = []
afterEach(() => {
  fault.rename = false
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'mashiro-location-014-'))
  roots.push(root)
  const config = join(root, '配置 settings')
  mkdirSync(config)
  const store = new ProductionLocationStore(config)
  function data(name: string, id = randomUUID()) {
    const path = join(root, name)
    mkdirSync(path, { recursive: true })
    const database = new DatabaseSync(join(path, 'mashiro.sqlite'))
    database.exec(
      "CREATE TABLE synthetic_records (value TEXT); INSERT INTO synthetic_records VALUES ('keep')"
    )
    database.close()
    writeFileSync(
      join(path, '.mashiro-dataset.json'),
      JSON.stringify({
        formatVersion: 1,
        dataSetId: id,
        state: 'READY',
        createdAt: new Date().toISOString()
      })
    )
    return { path, id }
  }
  return { root, config, store, data, locator: join(config, 'location.json') }
}

describe('production location authority', () => {
  it('binds a Chinese installation/data directory and reopens exactly the same identity', () => {
    const f = fixture()
    const data = f.data('安装 Mashiro/data')
    expect(f.store.inspect()).toEqual({ state: 'UNCONFIGURED', fingerprint: null })
    const bound = f.store.bind(data.path, null, data.id)
    const reopened = new ProductionLocationStore(f.config).inspect()
    expect(reopened).toMatchObject({ state: 'READY', locator: bound })
    expect(readdirSync(f.config)).toEqual(['location.json'])
  })

  it('keeps the locator byte-for-byte when the data path disappears, with no empty replacement', () => {
    const f = fixture()
    const data = f.data('original')
    f.store.bind(data.path, null, data.id)
    const before = readFileSync(f.locator)
    renameSync(data.path, join(f.root, 'moved'))
    expect(f.store.inspect()).toMatchObject({ state: 'RECOVERY', reason: 'DATA_UNAVAILABLE' })
    expect(readFileSync(f.locator)).toEqual(before)
    expect(existsSync(data.path)).toBe(false)
  })

  it('relocates a moved dataset, but rejects a different identity without replacing the binding', () => {
    const f = fixture()
    const data = f.data('original')
    f.store.bind(data.path, null, data.id)
    const before = readFileSync(f.locator)
    const state = f.store.inspect()
    if (!state.fingerprint) throw new Error('expected fingerprint')
    const other = f.data('other')
    expect(() => f.store.relocate(other.path, state.fingerprint!)).toThrow('IDENTITY')
    expect(readFileSync(f.locator)).toEqual(before)
    const moved = join(f.root, 'moved')
    renameSync(data.path, moved)
    expect(f.store.relocate(moved, state.fingerprint).dataSetId).toBe(data.id)
    expect(f.store.inspect()).toMatchObject({ state: 'READY', locator: { dataPath: moved } })
  })

  it('does not treat missing configuration or malformed locator as first use', () => {
    const f = fixture()
    const missing = join(f.root, 'missing')
    expect(new ProductionLocationStore(missing).inspect()).toMatchObject({ state: 'RECOVERY' })
    expect(existsSync(missing)).toBe(false)
    writeFileSync(f.locator, 'truncated{')
    expect(f.store.inspect()).toMatchObject({ state: 'RECOVERY', reason: 'LOCATOR_INVALID' })
    const data = f.data('valid')
    expect(() => f.store.bind(data.path, null, data.id)).toThrow('LOCATION_CHANGED')
    expect(readFileSync(f.locator, 'utf8')).toBe('truncated{')
  })

  it('fails closed on missing database and a PREPARING manifest', () => {
    const f = fixture()
    const data = f.data('data')
    f.store.bind(data.path, null, data.id)
    unlinkSync(join(data.path, 'mashiro.sqlite'))
    expect(f.store.inspect()).toMatchObject({ state: 'RECOVERY', reason: 'DATA_UNAVAILABLE' })
    expect(existsSync(join(data.path, 'mashiro.sqlite'))).toBe(false)
    const pending = f.data('pending')
    const manifestPath = join(pending.path, '.mashiro-dataset.json')
    writeFileSync(manifestPath, readFileSync(manifestPath, 'utf8').replace('READY', 'PREPARING'))
    expect(() => f.store.bind(pending.path, f.store.inspect().fingerprint, pending.id)).toThrow(
      'IDENTITY'
    )
  })

  it('rejects a non-SQLite file without initializing over it', () => {
    const f = fixture()
    const data = f.data('invalid database')
    const database = join(data.path, 'mashiro.sqlite')
    const bytes = Buffer.alloc(512, 42)
    writeFileSync(database, bytes)
    expect(() => f.store.bind(data.path, null, data.id)).toThrow('DATABASE_INVALID')
    expect(readFileSync(database)).toEqual(bytes)
    expect(existsSync(f.locator)).toBe(false)
  })

  it('rejects stale selection after another explicit binding', () => {
    const f = fixture()
    const one = f.data('one')
    const two = f.data('two')
    f.store.bind(one.path, null, one.id)
    expect(() => f.store.bind(two.path, null, two.id)).toThrow('LOCATION_CHANGED')
    expect(f.store.inspect()).toMatchObject({ state: 'READY', locator: { dataSetId: one.id } })
  })

  it('preserves old locator and cleans owned temporary files on atomic replacement failure', () => {
    const f = fixture()
    const one = f.data('one')
    const two = f.data('two')
    f.store.bind(one.path, null, one.id)
    const before = readFileSync(f.locator)
    fault.rename = true
    expect(() => f.store.bind(two.path, f.store.inspect().fingerprint, two.id)).toThrow('synthetic')
    expect(readFileSync(f.locator)).toEqual(before)
    expect(readdirSync(f.config)).toEqual(['location.json'])
  })

  it('does not remove an existing ownership lock or change the locator', () => {
    const f = fixture()
    const data = f.data('data')
    mkdirSync(join(f.config, '.location-write-lock'))
    expect(() => f.store.bind(data.path, null, data.id)).toThrow()
    expect(existsSync(f.locator)).toBe(false)
    expect(existsSync(join(f.config, '.location-write-lock'))).toBe(true)
  })

  it('rejects an ancestor junction and leaves its real target intact', () => {
    const f = fixture()
    const data = f.data('real/data')
    const link = join(f.root, 'linked')
    symlinkSync(join(f.root, 'real'), link, 'junction')
    expect(() => f.store.bind(join(link, 'data'), null, data.id)).toThrow('LOCATION_UNSAFE')
    expect(existsSync(f.locator)).toBe(false)
    expect(existsSync(join(data.path, 'mashiro.sqlite'))).toBe(true)
  })
})
