import { expect, it } from 'vitest'
import { SqliteStore } from '../../src/main/data/sqlite.js'
import { readGovernanceBaseline } from '../../src/main/data/production-governance-connection.js'
import { removeRetentionPolicyFixture } from './governance-legacy-fixture.js'

it('reads an actual pre-policy governed schema17 baseline before the migration replaces it', () => {
  const store = new SqliteStore(':memory:')
  try {
    removeRetentionPolicyFixture(store.database)
    store.database.exec('DROP TABLE memory_round_evidence; PRAGMA user_version=17')
    expect(() => readGovernanceBaseline(store.database)).not.toThrow()
  } finally {
    store.close()
  }
})
