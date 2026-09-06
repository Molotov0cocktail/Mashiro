import type { MemoryService } from '../memory/memory-service.js'
import type { SqliteStore } from '../data/sqlite.js'
import {
  itemProposalSchema,
  itemRecordSchema,
  type ItemSource
} from '../../shared/item-contract.js'

export interface ItemRetentionPlan {
  retainedEdges?: {
    id: string
    version: number
    source: ItemSource
    recipients: [string, string][]
  }[]
  items: { id: string; version: number }[]
  proposals: { id: string; version: number; delete: boolean }[]
}
export function itemSourceClosure(store: SqliteStore, sources: ItemSource[]): ItemSource[] {
  const result = new Map<string, ItemSource>(),
    pending = [...sources]
  while (pending.length) {
    const source = pending.pop()!,
      key = JSON.stringify(source)
    if (result.has(key)) continue
    if (result.size >= 4096) throw Error('Item source traversal limit')
    result.set(key, source)
    const table =
      source.type === 'item' || source.type === 'proposal' ? 'item_sources' : 'memory_dependencies'
    for (const edge of store.database
      .prepare(
        `SELECT source_type,source_id,source_assistant,source_version FROM ${table} WHERE node_type=? AND node_id=? AND node_version=?`
      )
      .all(source.type, source.id, source.version))
      pending.push({
        type: String(edge.source_type) as ItemSource['type'],
        id: String(edge.source_id),
        assistantId: String(edge.source_assistant),
        version: Number(edge.source_version)
      })
  }
  return [...result.values()]
}
export function inspectItemRetention(
  store: SqliteStore,
  assistantId: string | null,
  rounds: string[],
  memories: string[]
): ItemRetentionPlan {
  const affected = (sources: ItemSource[]) =>
    itemSourceClosure(store, sources).some(
      (s) =>
        ((s.type === 'round' || s.type === 'user-round') && rounds.includes(s.id)) ||
        (s.type === 'memory' && memories.includes(s.id))
    )
  return {
    items: store.database
      .prepare('SELECT record_json FROM items')
      .all()
      .map((r) => itemRecordSchema.parse(JSON.parse(String(r.record_json))))
      .filter((r) => affected(r.sources))
      .map((r) => ({ id: r.id, version: r.version })),
    proposals: store.database
      .prepare('SELECT record_json FROM item_proposals')
      .all()
      .map((r) => itemProposalSchema.parse(JSON.parse(String(r.record_json))))
      .filter((r) => r.originAssistantId === assistantId || affected(r.sources))
      .map((r) => ({
        id: r.id,
        version: r.version,
        delete: r.originAssistantId === assistantId && r.state !== 'ACCEPTED'
      }))
  }
}
/** Called only inside the governance confirmation transaction. No independent commit. */
export function prepareItemRetainedEdges(
  store: SqliteStore,
  plan: ItemRetentionPlan,
  memory: MemoryService
): void {
  plan.retainedEdges = []
  for (const target of plan.items) {
    const row = store.database.prepare('SELECT record_json FROM items WHERE id=?').get(target.id)!
    const record = itemRecordSchema.parse(JSON.parse(String(row.record_json)))
    for (const source of record.sources) {
      const recipients: [string, string][] = []
      for (const grant of store.database
        .prepare(
          'SELECT r.assistant_id,r.fingerprint FROM item_recipients r JOIN item_permissions p ON p.assistant_id=r.assistant_id WHERE r.allowed=1 AND p.read_allowed=1'
        )
        .all()) {
        try {
          memory.assertSource(source, String(grant.assistant_id), String(grant.fingerprint))
          recipients.push([String(grant.assistant_id), String(grant.fingerprint)])
        } catch {
          /* An already denied source never gains an exception. */
        }
      }
      if (recipients.length)
        plan.retainedEdges.push({ id: target.id, version: target.version, source, recipients })
    }
  }
}
export function applyItemRetention(store: SqliteStore, plan: ItemRetentionPlan): void {
  for (const edge of plan.retainedEdges ?? [])
    store.database
      .prepare('INSERT OR REPLACE INTO item_retained_edges VALUES(?,?,?,?)')
      .run(edge.id, edge.version, JSON.stringify(edge.source), JSON.stringify(edge.recipients))
  const affected = [
    ...plan.items.map((r) => ({ ...r, type: 'item' as const })),
    ...plan.proposals.map((r) => ({ ...r, type: 'proposal' as const }))
  ]
  for (const target of affected) {
    const table = target.type === 'item' ? 'items' : 'item_proposals'
    const row = store.database
      .prepare(`SELECT record_json,version FROM ${table} WHERE id=?`)
      .get(target.id)
    if (!row || Number(row.version) !== target.version) throw Error('Stale item retention plan')
    if (target.type === 'proposal' && 'delete' in target && target.delete) {
      store.database
        .prepare("INSERT OR IGNORE INTO item_tombstones VALUES('proposal',?)")
        .run(target.id)
      store.database.prepare('DELETE FROM item_proposals WHERE id=?').run(target.id)
      store.database
        .prepare("DELETE FROM item_sources WHERE node_type='proposal' AND node_id=?")
        .run(target.id)
      store.database.prepare('DELETE FROM item_rejections WHERE proposal_id=?').run(target.id)
    } else {
      const record =
        target.type === 'item'
          ? itemRecordSchema.parse(JSON.parse(String(row.record_json)))
          : itemProposalSchema.parse(JSON.parse(String(row.record_json)))
      record.sourceUnavailable = true
      // Unaccepted derived prose is private source material, not a confirmed business object.
      if ('candidate' in record && record.state !== 'ACCEPTED') {
        record.candidate = {
          ...record.candidate,
          title: '来源已清理的提案',
          description: '',
          counterpart: '',
          dueAt: null,
          timeZone: null,
          parentId: null,
          relatedIds: []
        }
        record.state = 'STALE'
      }
      store.database
        .prepare(`UPDATE ${table} SET record_json=? WHERE id=?`)
        .run(JSON.stringify(record), target.id)
      if ('state' in record)
        store.database
          .prepare('UPDATE item_proposals SET state=? WHERE id=?')
          .run(record.state, target.id)
    }
    // Receipt bodies are neutral IDs only; remove deleted proposal links as well.
    if (target.type === 'proposal' && 'delete' in target && target.delete)
      store.database
        .prepare(
          "UPDATE item_commands SET receipt_json=json_set(receipt_json,'$.objectId',NULL,'$.objectType',NULL,'$.summary','提案已永久删除') WHERE json_extract(receipt_json,'$.objectId')=?"
        )
        .run(target.id)
    // All prior copies exposed from the object's source-bearing rounds are retired.
    for (const op of store.database
      .prepare(
        "SELECT id,segment_id,record_json FROM tool_operations WHERE json_extract(record_json,'$.itemReceipt.objectId')=?"
      )
      .all(target.id)) {
      store.database.prepare('DELETE FROM protocol_results WHERE operation_id=?').run(String(op.id))
      store.database
        .prepare(
          "UPDATE tool_operations SET arguments_json='{}',record_json=json_remove(json_set(record_json,'$.summary','事项来源已清理'),'$.itemReceipt') WHERE id=?"
        )
        .run(String(op.id))
      store.database
        .prepare("UPDATE protocol_segments SET messages_json='[]' WHERE id=?")
        .run(String(op.segment_id))
    }
  }
  // Confirmation manifests contain user editable content; governance invalidates and clears them.
  store.database.prepare("UPDATE item_confirmations SET state='closed',payload_json='{}'").run()
}
