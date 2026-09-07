import { createHash } from 'node:crypto'
import type { SqliteStore } from '../data/sqlite.js'
import { memorySourceSchema, type MemorySource } from '../../shared/memory-contract.js'

/** Hash accepted objects and their governance, never unrelated newly created memories. */
export function branchGovernanceDigest(store: SqliteStore, branchId: string): string {
  const db = store.database
  // Statements are reusable; rows and governance are always read afresh in this digest.
  const statements = new Map<string, ReturnType<typeof db.prepare>>()
  const prepare = (sql: string) => {
    let statement = statements.get(sql)
    if (!statement) {
      statement = db.prepare(sql)
      statements.set(sql, statement)
    }
    return statement
  }
  const parts: unknown[] = []
  const queue: MemorySource[] = []
  for (const row of prepare(
    'SELECT * FROM branch_members WHERE branch_id=? ORDER BY memory_id'
  ).all(branchId)) {
    parts.push(row)
    queue.push({
      type: 'memory',
      id: String(row.memory_id),
      version: Number(row.memory_version),
      assistantId: branchId
    })
    queue.push(...memorySourceSchema.array().parse(JSON.parse(String(row.source_json))))
  }
  for (const row of prepare(
    "SELECT record_json FROM memory_conflicts WHERE EXISTS(SELECT 1 FROM json_each(json_extract(record_json,'$.branchIds')) WHERE value=?) ORDER BY id"
  ).all(branchId)) {
    parts.push(row)
    const conflict = JSON.parse(String(row.record_json)) as {
      left: MemorySource
      right: MemorySource
      resolution: MemorySource | null
    }
    queue.push(conflict.left, conflict.right)
    if (conflict.resolution) queue.push(conflict.resolution)
  }
  // Permission changes can alter local visibility even when object versions do not change.
  for (const table of [
    'memory_permissions',
    'memory_recipients',
    'history_permissions',
    'history_recipient_grants',
    'item_permissions',
    'item_recipients',
    'assistant_tombstones'
  ] as const)
    parts.push(table, prepare('SELECT * FROM ' + table + ' ORDER BY rowid').all())
  const visited = new Set<string>()
  for (let index = 0; index < queue.length; index++) {
    const source = queue[index]!
    const key = JSON.stringify([source.type, source.id, source.version])
    if (visited.has(key)) continue
    visited.add(key)
    parts.push(key)
    const kind = source.type === 'user-round' ? 'round' : source.type
    parts.push(
      prepare('SELECT * FROM content_tombstones WHERE kind=? AND id=? ORDER BY version').all(
        kind,
        source.id
      )
    )
    parts.push(
      prepare(
        'SELECT * FROM memory_suppressions WHERE source_type=? AND source_id=? ORDER BY source_version,kind,object_id'
      ).all(source.type, source.id)
    )
    if (kind === 'round') {
      parts.push(
        prepare('SELECT * FROM retention_original_trash WHERE request_id=?').all(source.id)
      )
      parts.push(
        prepare(
          'SELECT id,status,content,source_session_id FROM timeline_messages WHERE request_id=? ORDER BY sequence'
        ).all(source.id)
      )
    }
    const table =
      source.type === 'memory'
        ? 'memory_objects'
        : source.type === 'item'
          ? 'items'
          : source.type === 'proposal'
            ? 'item_proposals'
            : null
    if (table) {
      const row = prepare('SELECT version,record_json FROM ' + table + ' WHERE id=?').get(source.id)
      parts.push(row ?? null)
      if (row) {
        const record = JSON.parse(String(row.record_json)) as { sources: MemorySource[] }
        queue.push(...memorySourceSchema.array().parse(record.sources))
      }
    }
    if (source.type === 'memory') {
      parts.push(
        prepare(
          'SELECT version,body_hash,metadata_json FROM memory_versions WHERE object_id=? ORDER BY version'
        ).all(source.id)
      )
      parts.push(
        prepare(
          'SELECT * FROM retained_source_edges WHERE object_id=? ORDER BY object_version,source_type,source_id,source_version'
        ).all(source.id)
      )
    }
    if (source.type === 'item' || source.type === 'proposal') {
      parts.push(
        prepare('SELECT * FROM item_tombstones WHERE kind=? AND id=?').all(source.type, source.id)
      )
      parts.push(
        prepare(
          'SELECT * FROM item_retained_edges WHERE item_id=? ORDER BY item_version,source_json'
        ).all(source.id)
      )
    }
    for (const dependencies of ['memory_dependencies', 'item_sources'] as const) {
      const rows = prepare(
        'SELECT * FROM ' +
          dependencies +
          ' WHERE node_type=? AND node_id=? AND node_version=? ORDER BY source_type,source_id,source_version,source_assistant'
      ).all(source.type, source.id, source.version)
      parts.push(rows)
      for (const row of rows)
        queue.push(
          memorySourceSchema.parse({
            type: row.source_type,
            id: row.source_id,
            version: row.source_version,
            assistantId: row.source_assistant
          })
        )
    }
  }
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex')
}
