import { randomUUID } from 'node:crypto'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { acquireProductionLease } from '../../src/main/data/production-lease.js'
import { ProductionGovernanceIndex } from '../../src/main/data/production-governance-index.js'
import { ProductionGovernanceJournal } from '../../src/main/data/production-governance-journal.js'
import { readPortableGovernance } from '../../src/main/data/production-governance-portable.js'

it('imports and recovers a valid portable seed larger than 8MiB with only journal creation isolated', async () => {
  const root = mkdtempSync(join(realpathSync.native(tmpdir()), 'mashiro-seed-capacity-'))
  const config = join(root, 'config'),
    data = join(root, 'data')
  mkdirSync(config)
  mkdirSync(data)
  const lease = await acquireProductionLease(config, () => {})
  try {
    const dataSetId = randomUUID(),
      journalId = randomUUID()
    const projections = Array.from({ length: 80000 }, (_, n) => ({
      table: 'item_tombstones',
      keys: ['proposal', '00000000-0000-4000-8000-' + n.toString().padStart(12, '0')],
      values: [],
      deleted: false
    }))
    const portablePath = join(data, '.mashiro-governance-backup.json')
    writeFileSync(
      portablePath,
      JSON.stringify({ format: 1, dataSetId, journalId, revision: 'a'.repeat(64), projections })
    )
    expect(statSync(portablePath).size).toBeGreaterThan(8388608)
    const portable = readPortableGovernance(data, dataSetId)!
    const anchor = { instanceId: randomUUID(), device: '1', inode: '2' }
    const create = vi.spyOn(ProductionGovernanceJournal, 'create').mockImplementation(() => {
      throw Error('SYNTHETIC_AFTER_SEED')
    })
    expect(() =>
      new ProductionGovernanceIndex(config, lease).importVerified(
        dataSetId,
        data,
        anchor,
        portable.projections,
        journalId
      )
    ).toThrow('SYNTHETIC_AFTER_SEED')
    const registry = JSON.parse(readFileSync(join(config, 'governance-registry.json'), 'utf8'))
    const seed = registry.entries[0].seed
    expect(seed.bytes).toBeGreaterThan(8388608)
    const seedPath = join(config, 'governance', 'seed-' + seed.id + '.json')
    const original = readFileSync(seedPath)
    expect(() => new ProductionGovernanceIndex(config, lease).known(dataSetId)).toThrow(
      'SYNTHETIC_AFTER_SEED'
    )
    expect(create).toHaveBeenCalledTimes(2)
    for (const damaged of [
      original.subarray(0, original.length - 1),
      Buffer.concat([original, Buffer.from(' ')]),
      Buffer.from('X' + original.toString('utf8').slice(1))
    ]) {
      writeFileSync(seedPath, damaged)
      expect(() => new ProductionGovernanceIndex(config, lease).known(dataSetId)).toThrow()
      expect(create).toHaveBeenCalledTimes(2)
    }
  } finally {
    vi.restoreAllMocks()
    await lease.release()
    cleanup(root)
  }
})
function cleanup(root: string): void {
  if (
    dirname(realpathSync.native(root)) !== realpathSync.native(tmpdir()) ||
    !basename(root).startsWith('mashiro-seed-capacity-')
  )
    throw Error('UNOWNED_ROOT')
  rmSync(root, { recursive: true, force: true })
}
