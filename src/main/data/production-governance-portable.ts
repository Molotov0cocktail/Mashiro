import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  renameSync,
  writeFileSync
} from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { z } from 'zod'
import { parseGovernanceProjection } from './production-governance-catalog.js'
import type { ProductionGovernanceJournal } from './production-governance-journal.js'
import { canonicalProductionDirectory } from './production-location.js'

export const portableGovernanceSchema = z.strictObject({
  format: z.literal(1),
  dataSetId: z.uuid(),
  journalId: z.uuid(),
  revision: z.string().regex(/^[a-f0-9]{64}$/),
  projections: z.array(z.unknown().transform(parseGovernanceProjection))
})
export type PortableGovernance = z.infer<typeof portableGovernanceSchema>
const name = '.mashiro-governance-backup.json'

/** Written only at a quiescent backup point. It is included in the full receipt/hash inventory. */
export function writePortableGovernance(
  directory: string,
  journal: ProductionGovernanceJournal
): void {
  const root = canonicalProductionDirectory(directory),
    path = join(root, name)
  const snapshot = journal.snapshot()
  const value = portableGovernanceSchema.parse({
    format: 1,
    dataSetId: journal.dataSetId,
    journalId: journal.journalId,
    ...snapshot
  })
  if (existsSync(path)) {
    const stat = lstatSync(path)
    if (!stat.isFile() || stat.isSymbolicLink()) throw Error('GOVERNANCE_PORTABLE_PATH_INVALID')
  }
  const temporary = path + '.' + randomUUID() + '.tmp',
    fd = openSync(temporary, 'wx', 0o600)
  try {
    writeFileSync(fd, JSON.stringify(value))
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  renameSync(temporary, path)
}

/** Caller must first verify the complete backup receipt before trusting this copied snapshot. */
export function readPortableGovernance(
  directory: string,
  dataSetId: string
): PortableGovernance | undefined {
  const root = canonicalProductionDirectory(directory),
    path = join(root, name)
  if (!existsSync(path)) return undefined
  const stat = lstatSync(path)
  if (!stat.isFile() || stat.isSymbolicLink()) throw Error('GOVERNANCE_PORTABLE_PATH_INVALID')
  const value = portableGovernanceSchema.parse(JSON.parse(readFileSync(path, 'utf8')))
  if (value.dataSetId !== dataSetId) throw Error('GOVERNANCE_PORTABLE_ID_MISMATCH')
  return value
}
