import { lstatSync } from 'node:fs'
import { writePortableGovernance } from './production-governance-portable.js'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import {
  readGovernanceBaseline,
  recoverGovernancePending
} from './production-governance-connection.js'
import { assertGovernanceDominance } from './production-governance-check.js'
import { ProductionGovernanceIndex } from './production-governance-index.js'
import type { GovernanceAnchor } from './production-governance-journal.js'
import { registerProductionGovernance } from './production-governance-registry.js'
import { verifyProductionGovernanceSchema } from './production-governance-schema.js'

export function anchorFor(path: string, database: DatabaseSync): GovernanceAnchor {
  const stat = lstatSync(path)
  if (!stat.isFile() || stat.isSymbolicLink()) throw Error('GOVERNANCE_DATABASE_FILE_INVALID')
  verifyProductionGovernanceSchema(database)
  return {
    instanceId: String(
      database
        .prepare('SELECT instance_id FROM production_governance_state WHERE singleton=1')
        .get()!.instance_id
    ),
    device: String(stat.dev),
    inode: String(stat.ino)
  }
}

/** Before preparation can replace a file, settle only against its exact original committed tokens. */
export function settleProductionGovernance(
  index: ProductionGovernanceIndex,
  dataSetId: string,
  dataDirectory: string
): void {
  const path = join(dataDirectory, 'mashiro.sqlite')
  const database = new DatabaseSync(path, { readOnly: true })
  try {
    const version = Number(database.prepare('PRAGMA user_version').get()!.user_version)
    if (version < 17) {
      if (index.known(dataSetId)) throw Error('GOVERNANCE_KNOWN_DATASET_SCHEMA_REGRESSED')
      return
    }
    const anchor = anchorFor(path, database)
    index.resumeInitialization(
      dataSetId,
      dataDirectory,
      anchor,
      readGovernanceBaseline(database),
      !!database.prepare('SELECT 1 FROM production_governance_commits LIMIT 1').get()
    )
    const journal = index.known(dataSetId)
    if (!journal) return
    recoverGovernancePending(database, journal, anchor, () => {
      const current = anchorFor(path, database)
      if (JSON.stringify(current) !== JSON.stringify(anchor))
        throw Error('GOVERNANCE_DATABASE_FILE_CHANGED')
    })
    journal.snapshot()
    writePortableGovernance(dataDirectory, journal)
  } finally {
    database.close()
  }
}

/** A selected old copy must use the explicit restoration pipeline, never become a new baseline. */
export function registerPreparedProductionGovernance(options: {
  index: ProductionGovernanceIndex
  dataSetId: string
  dataDirectory: string
  assertOwnership(): void
  onUncertain(): void
}): () => void {
  options.assertOwnership()
  const path = join(options.dataDirectory, 'mashiro.sqlite')
  const database = new DatabaseSync(path, { readOnly: true })
  try {
    const anchor = anchorFor(path, database)
    const baseline = readGovernanceBaseline(database)
    let journal = options.index.known(options.dataSetId)
    if (journal) {
      journal.assertAnchor(anchor)
      assertGovernanceDominance(baseline, journal.snapshot().projections)
      options.index.stamp(options.dataDirectory, journal)
    } else {
      journal = options.index.initialize(options.dataSetId, options.dataDirectory, anchor, baseline)
    }
    return registerProductionGovernance({
      path,
      journal,
      anchor,
      assertOwnership: options.assertOwnership,
      onUncertain: options.onUncertain
    })
  } finally {
    database.close()
  }
}
