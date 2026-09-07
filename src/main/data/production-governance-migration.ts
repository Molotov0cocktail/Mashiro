import { basename, dirname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { ProductionGovernanceIndex } from './production-governance-index.js'
import { anchorFor, settleProductionGovernance } from './production-governance-lifecycle.js'
import { readGovernanceBaseline } from './production-governance-connection.js'
import { assertGovernanceDominance } from './production-governance-check.js'
import { rotateRestoredGovernanceInstance } from './production-governance-schema.js'
import { canonicalProductionDirectory } from './production-location.js'

/** Authorize a verified migration candidate before its atomic rename, leaving the old anchor valid. */
export function authorizeProductionGovernanceMigration(
  index: ProductionGovernanceIndex,
  dataSetId: string,
  dataDirectory: string,
  candidatePath: string,
  assertCurrent: () => void
): void {
  assertCurrent()
  const root = canonicalProductionDirectory(dataDirectory)
  if (
    dirname(candidatePath).toLowerCase() !== root.toLowerCase() ||
    !/^\.mashiro-upgrade-[a-f0-9-]{36}\.sqlite$/.test(basename(candidatePath))
  )
    throw Error('GOVERNANCE_MIGRATION_CANDIDATE_INVALID')
  const journal = index.known(dataSetId)
  if (!journal) return
  settleProductionGovernance(index, dataSetId, root)
  const snapshot = journal.snapshot()
  const candidate = new DatabaseSync(candidatePath)
  try {
    const source = new DatabaseSync(join(root, 'mashiro.sqlite'), { readOnly: true })
    try {
      journal.assertAnchor(anchorFor(join(root, 'mashiro.sqlite'), source))
      if (
        Number(candidate.prepare('PRAGMA user_version').get()!.user_version) <=
        Number(source.prepare('PRAGMA user_version').get()!.user_version)
      )
        throw Error('GOVERNANCE_MIGRATION_VERSION_NOT_NEWER')
    } finally {
      source.close()
    }
    if (
      candidate.prepare('PRAGMA integrity_check').get()!.integrity_check !== 'ok' ||
      candidate.prepare('PRAGMA foreign_key_check').all().length
    )
      throw Error('GOVERNANCE_MIGRATION_INVALID')
    assertGovernanceDominance(readGovernanceBaseline(candidate), snapshot.projections)
    rotateRestoredGovernanceInstance(candidate)
    assertCurrent()
    if (journal.snapshot().revision !== snapshot.revision)
      throw Error('GOVERNANCE_CHANGED_DURING_MIGRATION')
    // fsynced enrollment comes before file publication: a crash sees either an authorized old or new instance.
    journal.enrollInstance(anchorFor(candidatePath, candidate))
  } finally {
    candidate.close()
  }
}
