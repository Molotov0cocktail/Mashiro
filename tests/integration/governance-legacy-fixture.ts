import type { DatabaseSync } from 'node:sqlite'

/** Only a synthetic pre-v17 fixture may remove empty runtime governance metadata. */
export function removeGovernanceFixture(database: DatabaseSync): void {
  if (database.prepare("SELECT 1 FROM sqlite_master WHERE name='memory_round_evidence'").get()) {
    if (database.prepare('SELECT 1 FROM memory_round_evidence LIMIT 1').get())
      throw Error('CANNOT_DOWNGRADE_MEMORY_ROUND_FIXTURE')
    database.exec('DROP TABLE memory_round_evidence')
  }
  if (
    !database.prepare("SELECT 1 FROM sqlite_master WHERE name='production_governance_state'").get()
  )
    return
  if (database.prepare('SELECT 1 FROM production_governance_commits LIMIT 1').get())
    throw Error('CANNOT_DOWNGRADE_GOVERNED_FIXTURE')
  database.exec('DROP TABLE production_governance_commits; DROP TABLE production_governance_state')
}
