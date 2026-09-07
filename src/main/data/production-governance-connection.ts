import type { DatabaseSync } from 'node:sqlite'
import {
  governanceCatalog,
  governanceExpression,
  parseGovernanceProjection,
  type GovernanceProjection,
  type GovernanceTable
} from './production-governance-catalog.js'
import { guardGovernanceDatabase } from './production-governance-database.js'
import type {
  GovernanceAnchor,
  ProductionGovernanceJournal
} from './production-governance-journal.js'
import { verifyProductionGovernanceSchema } from './production-governance-schema.js'

/** A verified healthy initial dataset contributes metadata only, never record_json or file bodies. */
export function readGovernanceBaseline(database: DatabaseSync): GovernanceProjection[] {
  const result: GovernanceProjection[] = []
  for (const table of Object.keys(governanceCatalog) as GovernanceTable[]) {
    const definition = governanceCatalog[table]
    const fields = [...definition.keys, ...definition.values]
    const rows = database
      .prepare(
        'SELECT ' +
          fields.map((value, index) => governanceExpression(value) + ' AS c' + index).join(',') +
          ' FROM ' +
          table
      )
      .all()
    for (const row of rows) {
      const values = fields.map((_value, index) => row['c' + index])
      result.push(
        parseGovernanceProjection({
          table,
          keys: values.slice(0, definition.keys.length),
          values: values.slice(definition.keys.length),
          deleted: false
        })
      )
    }
  }
  return result
}

function assertInstance(
  database: DatabaseSync,
  journal: ProductionGovernanceJournal,
  anchor: GovernanceAnchor,
  assertFileIdentity: () => void
) {
  assertFileIdentity()
  journal.assertAnchor(anchor)
  if (
    database.prepare('SELECT instance_id FROM production_governance_state WHERE singleton=1').get()!
      .instance_id !== anchor.instanceId
  )
    throw Error('GOVERNANCE_DATABASE_INSTANCE_MISMATCH')
}
function resolveTokens(
  database: DatabaseSync,
  journal: ProductionGovernanceJournal,
  anchor: GovernanceAnchor,
  tokens: string[]
) {
  if (database.isTransaction) throw Error('GOVERNANCE_TRANSACTION_UNSETTLED')
  for (let offset = 0; offset < tokens.length; offset += 500) {
    const batch = tokens.slice(offset, offset + 500)
    const existing = new Set(
      database
        .prepare(
          'SELECT token FROM production_governance_commits WHERE token IN (' +
            batch.map(() => '?').join(',') +
            ')'
        )
        .all(...batch)
        .map((row) => String(row.token))
    )
    journal.resolve(
      anchor,
      batch.filter((token) => existing.has(token)),
      batch.filter((token) => !existing.has(token))
    )
  }
}

/** Call only at an owned, healthy original-instance quiescent point, before any migration replaces its file. */
export function recoverGovernancePending(
  database: DatabaseSync,
  journal: ProductionGovernanceJournal,
  anchor: GovernanceAnchor,
  assertFileIdentity: () => void
): void {
  verifyProductionGovernanceSchema(database)
  assertInstance(database, journal, anchor, assertFileIdentity)
  if (
    database.prepare('PRAGMA integrity_check').get()!.integrity_check !== 'ok' ||
    database.prepare('PRAGMA foreign_key_check').all().length
  )
    throw Error('GOVERNANCE_RECOVERY_SOURCE_INVALID')
  resolveTokens(database, journal, anchor, journal.pendingTokens(anchor))
}

export function connectGovernanceDatabase(
  database: DatabaseSync,
  journal: ProductionGovernanceJournal,
  anchor: GovernanceAnchor,
  assertFileIdentity: () => void,
  onUncertain?: () => void
): DatabaseSync {
  verifyProductionGovernanceSchema(database)
  assertInstance(database, journal, anchor, assertFileIdentity)
  const pending = new Set<string>()
  const protect = <T>(operation: () => T): T => {
    try {
      return operation()
    } catch (error) {
      onUncertain?.()
      throw error
    }
  }
  return guardGovernanceDatabase(
    database,
    (Object.keys(governanceCatalog) as GovernanceTable[]).map((table) => ({
      table,
      keys: governanceCatalog[table].keys.map((key) => key.column),
      values: governanceCatalog[table].values
    })),
    {
      before(table, keys, values, deleted) {
        return protect(() => {
          assertInstance(database, journal, anchor, assertFileIdentity)
          const token = journal.before(
            anchor,
            parseGovernanceProjection({ table, keys, values, deleted })
          )
          pending.add(token)
          return token
        })
      },
      settle(raw) {
        protect(() => {
          assertInstance(raw, journal, anchor, assertFileIdentity)
          resolveTokens(raw, journal, anchor, [...pending])
          pending.clear()
        })
      }
    }
  ).database
}
