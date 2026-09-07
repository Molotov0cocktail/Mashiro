import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'

const hooks = vi.hoisted(() => ({ onStat: undefined as undefined | (() => void) }))
vi.mock('node:fs', async (actualImport) => {
  const actual = await actualImport<typeof import('node:fs')>()
  return {
    ...actual,
    lstatSync: (...args: Parameters<typeof actual.lstatSync>) => {
      hooks.onStat?.()
      return Reflect.apply(actual.lstatSync, actual, args)
    }
  }
})
import { readGovernanceSeed } from '../../src/main/data/production-governance-seed.js'

const roots: string[] = []
afterEach(() => {
  hooks.onStat = undefined
  for (const root of roots.splice(0)) {
    const actual = realpathSync.native(root)
    if (
      dirname(actual) !== realpathSync.native(tmpdir()) ||
      !basename(actual).startsWith('mashiro-seed-review014-')
    )
      throw Error('UNOWNED_ROOT')
    rmSync(actual, { recursive: true, force: true })
  }
})
function fixture() {
  const root = mkdtempSync(join(realpathSync.native(tmpdir()), 'mashiro-seed-review014-'))
  roots.push(root)
  return join(root, 'seed.json')
}
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')

it('review014: registered exact-length seed accepts more than8MiB while legacy unbounded metadata remains limited', () => {
  const path = fixture(),
    bytes = Buffer.alloc(8388609, 32)
  writeFileSync(path, bytes)
  expect(() => readGovernanceSeed(path, hash(bytes))).toThrow('GOVERNANCE_SEED_SIZE_INVALID')
  expect(readGovernanceSeed(path, hash(bytes), bytes.length).equals(bytes)).toBe(true)
  expect(() => readGovernanceSeed(path, hash(bytes), bytes.length + 1)).toThrow(
    'GOVERNANCE_SEED_SIZE_INVALID'
  )
})

it('review014: final path stat rejects a seed truncated after final descriptor stat', () => {
  const path = fixture(),
    bytes = Buffer.from('{"synthetic":"accepted"}')
  writeFileSync(path, bytes)
  let calls = 0
  hooks.onStat = () => {
    calls++
    if (calls === 2) writeFileSync(path, bytes.subarray(0, bytes.length - 1))
  }
  expect(() => readGovernanceSeed(path, hash(bytes), bytes.length)).toThrow(
    'GOVERNANCE_SEED_CHANGED'
  )
})

it('review014: a directory is rejected before allocating or reading seed content', () => {
  const path = fixture()
  mkdirSync(path)
  expect(() => readGovernanceSeed(path, hash(Buffer.alloc(0)), 0)).toThrow(
    'GOVERNANCE_SEED_SIZE_INVALID'
  )
})
