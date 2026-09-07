import { governanceKey, type GovernanceProjection } from './production-governance-catalog.js'

/** Missing data and stricter redactions are safe; older visible content and wider grants are not. */
export function assertGovernanceDominance(
  actual: GovernanceProjection[],
  expected: GovernanceProjection[]
): void {
  const rows = new Map(actual.map((row) => [governanceKey(row), row]))
  for (const prior of expected) {
    const current = rows.get(governanceKey(prior))
    if (!current) {
      if (
        [
          'content_tombstones',
          'assistant_tombstones',
          'memory_suppressions',
          'item_tombstones'
        ].includes(prior.table) &&
        !prior.deleted
      )
        throw Error('GOVERNANCE_RESTORATION_REQUIRED')
      continue
    }
    if (JSON.stringify(current) === JSON.stringify(prior)) continue
    const values = current.values,
      old = prior.values
    if (
      prior.table === 'memory_objects' &&
      values[3] === 'suppressed' &&
      values[4] === 'trash' &&
      Number(values[0]) >= Number(old[0])
    )
      continue
    if (
      prior.table === 'reminders' &&
      ['RESULT_UNKNOWN', 'CANCELLED', 'HANDLED'].includes(String(values[2])) &&
      Number(values[1]) >= Number(old[1])
    )
      continue
    if (
      prior.table === 'provider_connections' &&
      values[1] === 0 &&
      Number(values[0]) >= Number(old[0]) &&
      (!(prior.deleted || old[2] === 0) || values[2] === 0)
    )
      continue
    if (
      prior.table === 'retention_policy' &&
      Number(values[0]) >= Number(old[0]) &&
      Number(values[1]) <= Number(old[1]) &&
      Number(values[3]) <= Number(old[3]) &&
      values[5] === 1
    )
      continue
    if (
      prior.table.endsWith('_permissions') ||
      prior.table === 'history_recipient_grants' ||
      prior.table.endsWith('_recipients')
    ) {
      const offset = prior.table.endsWith('_permissions') ? 1 : 0
      if (
        values
          .slice(offset)
          .every(
            (value, index) => Number(value) <= (prior.deleted ? 0 : Number(old[index + offset]))
          )
      )
        continue
    }
    throw Error('GOVERNANCE_RESTORATION_REQUIRED')
  }
}
