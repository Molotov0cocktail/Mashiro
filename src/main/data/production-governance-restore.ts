import { existsSync } from 'node:fs'
import {
  readPortableGovernance,
  writePortableGovernance
} from './production-governance-portable.js'
import { governanceKey } from './production-governance-catalog.js'
import { join } from 'node:path'
import { SqliteStore } from './sqlite.js'
import type { ProductionGovernanceIndex } from './production-governance-index.js'
import { readGovernanceBaseline } from './production-governance-connection.js'
import { applyProductionGovernance } from './production-governance-apply.js'
import { assertGovernanceDominance } from './production-governance-check.js'
import { rotateRestoredGovernanceInstance } from './production-governance-schema.js'
import { anchorFor } from './production-governance-lifecycle.js'

/** Called while the restoration marker and destination lease are both held. */
export function governRestoredProductionCopy(
  index: ProductionGovernanceIndex,
  dataSetId: string,
  directory: string,
  assertCurrent: () => void
): void {
  assertCurrent()
  if (!existsSync(join(directory, '.mashiro-snapshot.json')))
    throw Error('GOVERNANCE_RESTORE_MARKER_REQUIRED')
  const journal = index.known(dataSetId)
  const portable = readPortableGovernance(directory, dataSetId)
  const snapshot = journal?.snapshot() ?? portable
  const path = join(directory, 'mashiro.sqlite')
  const store = new SqliteStore(path)
  try {
    applyProductionGovernance(store.database, directory, snapshot?.projections ?? [])
    if (
      store.database.prepare('PRAGMA integrity_check').get()!.integrity_check !== 'ok' ||
      store.database.prepare('PRAGMA foreign_key_check').all().length
    )
      throw Error('GOVERNANCE_RESTORED_DATABASE_INVALID')
    const baseline = readGovernanceBaseline(store.database)
    if (snapshot) assertGovernanceDominance(baseline, snapshot.projections)
    assertCurrent()
    if (journal && journal.snapshot().revision !== snapshot!.revision)
      throw Error('GOVERNANCE_CHANGED_DURING_RESTORE')
    rotateRestoredGovernanceInstance(store.database)
    const anchor = anchorFor(path, store.database)
    let enrolled = journal
    if (enrolled) {
      enrolled.enrollInstance(anchor)
      index.stamp(directory, enrolled)
    } else if (portable) {
      const combined = new Map(portable.projections.map((p) => [governanceKey(p), p]))
      for (const row of baseline) combined.set(governanceKey(row), row)
      enrolled = index.importVerified(
        dataSetId,
        directory,
        anchor,
        [...combined.values()],
        portable.journalId
      )
    } else enrolled = index.initialize(dataSetId, directory, anchor, baseline)
    writePortableGovernance(directory, enrolled)
  } finally {
    store.close()
  }
}
