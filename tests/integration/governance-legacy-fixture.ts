import type { DatabaseSync } from 'node:sqlite'

/** Only synthetic downgrade fixtures may remove empty retention-policy metadata. */
export function removeRetentionPolicyFixture(database: DatabaseSync): void {
  if (!database.prepare("SELECT 1 FROM sqlite_master WHERE name='retention_policy'").get()) return
  for (const table of [
    'retention_policy_objects',
    'retention_policy_previews',
    'retention_policy_commands',
    'retention_policy_runs',
    'retention_policy_receipts'
  ])
    if (database.prepare('SELECT 1 FROM ' + table + ' LIMIT 1').get())
      throw Error('CANNOT_DOWNGRADE_RETENTION_POLICY_FIXTURE')
  database.exec(
    'DROP TABLE retention_policy_receipts; DROP TABLE retention_policy_runs; DROP TABLE retention_policy_commands; DROP TABLE retention_policy_previews; DROP TABLE retention_policy_objects; DROP TABLE retention_policy'
  )
}

/** Only a synthetic pre-v17 fixture may remove empty runtime governance metadata. */
export function removeGovernanceFixture(database: DatabaseSync): void {
  removeRetentionPolicyFixture(database)
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
