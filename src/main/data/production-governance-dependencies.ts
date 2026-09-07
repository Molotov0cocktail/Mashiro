import type { DatabaseSync } from 'node:sqlite'
import type { GovernanceProjection } from './production-governance-catalog.js'

/** Only current accepted dependency versions participate; lawful retained edges do not revive a withdrawal. */
export function expandRestoredMemoryBarriers(
  database: DatabaseSync,
  projections: GovernanceProjection[],
  memories: Set<string>,
  rounds: Set<string>,
  floor: Map<string, number>
): void {
  const key = (...parts: unknown[]) => JSON.stringify(parts)
  const withdrawn = new Set(
    projections
      .filter((p) => p.table === 'memory_suppressions' && !p.deleted && p.keys[3] === 'withdrawal')
      .map((p) => key(...p.keys.slice(0, 3)))
  )
  const retained = new Set(
    database
      .prepare(
        'SELECT object_id,object_version,source_type,source_id,source_version FROM retained_source_edges'
      )
      .all()
      .map((row) =>
        key(row.object_id, row.object_version, row.source_type, row.source_id, row.source_version)
      )
  )
  for (const p of projections)
    if (p.table === 'retained_source_edges') {
      if (p.deleted) retained.delete(key(...p.keys))
      else retained.add(key(...p.keys))
    }
  const dependencies = database
    .prepare(
      "SELECT d.* FROM memory_dependencies d JOIN memory_objects o ON o.id=d.node_id AND o.version=d.node_version WHERE d.node_type='memory'"
    )
    .all()
  let changed = true
  while (changed) {
    changed = false
    for (const row of dependencies) {
      const node = String(row.node_id),
        source = String(row.source_id),
        type = String(row.source_type),
        sourceVersion = Number(row.source_version)
      if (memories.has(node)) continue
      if (type === 'memory' && node === source && sourceVersion < Number(row.node_version)) continue
      const withdrawal = withdrawn.has(key(type, source, sourceVersion))
      const obsolete = type === 'memory' && sourceVersion < (floor.get(source) ?? 0)
      const blocked =
        type === 'memory'
          ? memories.has(source)
          : ['round', 'user-round'].includes(type) && rounds.has(source)
      if (
        !withdrawal &&
        !obsolete &&
        (!blocked || retained.has(key(node, row.node_version, type, source, sourceVersion)))
      )
        continue
      memories.add(node)
      changed = true
    }
  }
}
