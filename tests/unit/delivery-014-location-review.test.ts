import { randomUUID } from 'node:crypto'
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  symlinkSync,
  readdirSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, expect, it, vi } from 'vitest'
import {
  ProductionLocationStore,
  inspectProductionDataSet
} from '../../src/main/data/production-location.js'

const probe = vi.hoisted(() => ({ capture: false, paths: [] as string[] }))
vi.mock('node:fs', async (original) => {
  const fs = await original<typeof import('node:fs')>()
  return {
    ...fs,
    lstatSync: (...args: Parameters<typeof fs.lstatSync>) => {
      if (probe.capture) {
        probe.paths.push(String(args[0]))
        throw Error('REVIEW_BLOCKS_ALL_IO')
      }
      return fs.lstatSync(...args)
    }
  }
})
const roots: string[] = []
afterEach(() => {
  probe.capture = false
  probe.paths = []
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})
function setup() {
  const root = mkdtempSync(join(tmpdir(), 'mashiro-014-review-'))
  roots.push(root)
  const config = join(root, 'config'),
    data = join(root, 'data')
  mkdirSync(config)
  mkdirSync(data)
  const db = new DatabaseSync(join(data, 'mashiro.sqlite'))
  db.exec('CREATE TABLE sentinel(value TEXT)')
  db.close()
  const id = randomUUID(),
    manifest = join(data, '.mashiro-dataset.json')
  writeFileSync(
    manifest,
    JSON.stringify({
      formatVersion: 1,
      dataSetId: id,
      state: 'READY',
      createdAt: '2030-01-01T00:00:00.000Z'
    })
  )
  return { root, config, data, id, manifest, store: new ProductionLocationStore(config) }
}
it('rejects slash-spelled UNC before any filesystem access', () => {
  probe.capture = true
  expect(() => inspectProductionDataSet('//review.invalid/share/data')).toThrow(
    'LOCATION_UNSUPPORTED'
  )
  expect(probe.paths).toEqual([])
})
it('rejects mixed-slash UNC before any filesystem access', () => {
  probe.capture = true
  for (const path of [
    String.raw`/\review.invalid/share\data`,
    String.raw`\/review.invalid\share/data`,
    String.raw`//review.invalid\share\data`
  ]) {
    expect(() => inspectProductionDataSet(path)).toThrow('LOCATION_UNSUPPORTED')
  }
  expect(probe.paths).toEqual([])
})
it('strictly rejects unknown manifest authority fields without producing a locator', () => {
  const f = setup()
  const original = JSON.parse(readFileSync(f.manifest, 'utf8'))
  writeFileSync(f.manifest, JSON.stringify({ ...original, overrideOwnership: true }))
  expect(() => f.store.bind(f.data, null, f.id)).toThrow()
  expect(readdirSync(f.config)).toEqual([])
})
it('a locator identity mismatch enters recovery and preserves both database and locator bytes', () => {
  const f = setup()
  f.store.bind(f.data, null, f.id)
  const locator = join(f.config, 'location.json'),
    before = readFileSync(locator),
    db = readFileSync(join(f.data, 'mashiro.sqlite'))
  const original = JSON.parse(readFileSync(f.manifest, 'utf8'))
  writeFileSync(f.manifest, JSON.stringify({ ...original, dataSetId: randomUUID() }))
  expect(f.store.inspect()).toMatchObject({ state: 'RECOVERY', reason: 'DATA_UNAVAILABLE' })
  expect(readFileSync(locator)).toEqual(before)
  expect(readFileSync(join(f.data, 'mashiro.sqlite'))).toEqual(db)
})
it('a locator directory or junction cannot be misclassified as an absent first-use locator', () => {
  const f = setup(),
    locator = join(f.config, 'location.json')
  symlinkSync(f.data, locator, 'junction')
  expect(f.store.inspect()).toMatchObject({ state: 'RECOVERY', reason: 'LOCATOR_UNREADABLE' })
  expect(() => f.store.bind(f.data, null, f.id)).toThrow('LOCATION_CHANGED_OR_UNREADABLE')
  expect(readdirSync(f.config)).toEqual(['location.json'])
})
