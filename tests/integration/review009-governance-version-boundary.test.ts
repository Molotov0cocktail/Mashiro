import { expect, it } from 'vitest'
import { SqliteStore } from '../../src/main/data/sqlite.js'
import { readGovernanceBaseline } from '../../src/main/data/production-governance-connection.js'
import { removeRetentionPolicyFixture } from './governance-legacy-fixture.js'

it('schema18 may omit the not-yet-introduced policy but schema19 must not silently omit it', () => {
  const store = new SqliteStore(':memory:')
  try {
    removeRetentionPolicyFixture(store.database)
    store.database.exec('PRAGMA user_version=18')
    expect(() => readGovernanceBaseline(store.database)).not.toThrow()
    store.database.exec('PRAGMA user_version=19')
    expect(() => readGovernanceBaseline(store.database)).toThrow('no such table: retention_policy')
  } finally {
    store.close()
  }
})
