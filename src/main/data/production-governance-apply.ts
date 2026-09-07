import { createHash } from 'node:crypto'
import { expandRestoredMemoryBarriers } from './production-governance-dependencies.js'
import { markRestoredCredentialRevoked } from './production-governance-credentials.js'
import { applyRestoredReminderGovernance } from './production-governance-reminders.js'
import { redactGovernanceCopies } from './production-governance-redaction.js'
import { existsSync, lstatSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { memoryRecordSchema } from '../../shared/memory-contract.js'
import { itemRecordSchema } from '../../shared/item-contract.js'
import type { GovernanceProjection } from './production-governance-catalog.js'
import { canonicalProductionDirectory } from './production-location.js'

const emptyHash = createHash('sha256').update('').digest('hex')
const at = (value: unknown) => String(value)

/** Applies metadata barriers only to an owned isolated restoration copy; never to the current source. */
export function applyProductionGovernance(
  database: DatabaseSync,
  directory: string,
  projections: GovernanceProjection[]
): {
  unavailableMemories: number
  retiredRounds: number
  unavailableItems: number
} {
  if (!existsSync(join(directory, '.mashiro-snapshot.json')))
    throw Error('GOVERNANCE_RESTORE_MARKER_REQUIRED')
  canonicalProductionDirectory(directory)
  const memories = new Set<string>(),
    rounds = new Set<string>(),
    assistants = new Set<string>(),
    proposals = new Set<string>(),
    items = new Set<string>()
  const floor = new Map<string, number>()
  const files = new Set<string>(),
    retiredItems = new Set<string>()
  const active = projections.filter((p) => !p.deleted)
  for (const p of active) {
    if (p.table === 'assistant_tombstones') assistants.add(at(p.keys[0]))
    if (p.table === 'content_tombstones')
      (p.keys[0] === 'round' ? rounds : memories).add(at(p.keys[1]))
    if (p.table === 'retention_original_trash') rounds.add(at(p.keys[0]))
    if (p.table === 'item_tombstones') {
      ;(p.keys[0] === 'proposal' ? proposals : items).add(at(p.keys[1]))
      if (p.keys[0] === 'item') retiredItems.add(at(p.keys[1]))
    }
    if (p.table === 'memory_suppressions' && p.keys[3] === 'withdrawal') {
      if (p.keys[0] === 'memory') memories.add(at(p.keys[1]))
      if (p.keys[0] === 'round' || p.keys[0] === 'user-round') rounds.add(at(p.keys[1]))
    }
  }
  for (const p of projections) {
    if (p.table === 'memory_objects') {
      const id = at(p.keys[0]),
        version = Number(p.values[0])
      floor.set(id, version)
      const row = database.prepare('SELECT version FROM memory_objects WHERE id=?').get(id)
      if (
        p.deleted ||
        p.values[3] === 'suppressed' ||
        p.values[4] === 'trash' ||
        (row && Number(row.version) < version)
      )
        memories.add(id)
    }
    if (p.table === 'items' && p.deleted) retiredItems.add(at(p.keys[0]))
    if (p.table === 'items' || p.table === 'item_proposals') {
      const id = at(p.keys[0]),
        row = database.prepare('SELECT version FROM ' + p.table + ' WHERE id=?').get(id)
      if (p.deleted || (row && Number(row.version) < Number(p.values[0])))
        (p.table === 'items' ? items : proposals).add(id)
    }
  }
  for (const row of database.prepare('SELECT id,record_json FROM memory_objects').all()) {
    const record = memoryRecordSchema.parse(JSON.parse(at(row.record_json)))
    if (record.scope === 'assistant' && assistants.has(record.ownerAssistantId))
      memories.add(at(row.id))
  }
  for (const row of database.prepare('SELECT request_id,assistant_id FROM timeline_messages').all())
    if (assistants.has(at(row.assistant_id))) rounds.add(at(row.request_id))
  for (const row of database
    .prepare("SELECT id,origin_assistant_id FROM item_proposals WHERE state<>'ACCEPTED'")
    .all())
    if (assistants.has(at(row.origin_assistant_id))) proposals.add(at(row.id))

  expandRestoredMemoryBarriers(database, projections, memories, rounds, floor)
  database.exec('PRAGMA secure_delete=ON; BEGIN IMMEDIATE')
  try {
    for (const p of active) {
      if (p.table === 'content_tombstones')
        database
          .prepare('INSERT OR IGNORE INTO content_tombstones VALUES(?,?,?, ?,0)')
          .run(...p.keys, 'governance-restore')
      if (p.table === 'assistant_tombstones')
        database.prepare('INSERT OR IGNORE INTO assistant_tombstones VALUES(?,0)').run(...p.keys)
      if (p.table === 'memory_suppressions')
        database
          .prepare('INSERT OR IGNORE INTO memory_suppressions VALUES(?,?,?,?,?)')
          .run(...p.keys)
      if (p.table === 'item_tombstones')
        database.prepare('INSERT OR IGNORE INTO item_tombstones VALUES(?,?)').run(...p.keys)
      if (p.table === 'retention_original_trash')
        database
          .prepare("INSERT OR REPLACE INTO retention_original_trash VALUES(?,?,'[]',0)")
          .run(...p.keys, ...p.values)
      if (p.table === 'retained_source_edges')
        database
          .prepare('INSERT OR REPLACE INTO retained_source_edges VALUES(?,?,?,?,?,?,?,0)')
          .run(...p.keys, ...p.values)
      if (p.table === 'item_retained_edges')
        database
          .prepare('INSERT OR REPLACE INTO item_retained_edges VALUES(?,?,?,?)')
          .run(...p.keys, ...p.values)
    }
    const replacement =
      database
        .prepare(
          'SELECT id FROM assistants WHERE archived_at IS NULL AND id NOT IN(SELECT id FROM assistant_tombstones) ORDER BY created_at,id LIMIT 1'
        )
        .get()?.id ?? null
    database
      .prepare(
        'UPDATE assistant_state SET primary_assistant_id=CASE WHEN primary_assistant_id IN(SELECT id FROM assistant_tombstones) THEN ? ELSE primary_assistant_id END,current_assistant_id=CASE WHEN current_assistant_id IN(SELECT id FROM assistant_tombstones) THEN ? ELSE current_assistant_id END,revision=revision+1 WHERE singleton=1'
      )
      .run(replacement, replacement)
    for (const id of assistants) {
      const now = new Date().toISOString()
      database
        .prepare(
          "UPDATE assistants SET display_name='已删除助手',persona='',avatar_key='mashiro',archived_at=?,updated_at=?,version=version+1 WHERE id=?"
        )
        .run(now, now, id)
    }
    // Reversible restoration of originals is honored only when the later journal records it.
    for (const p of projections)
      if (p.table === 'retention_original_trash' && p.deleted)
        database.prepare('DELETE FROM retention_original_trash WHERE request_id=?').run(...p.keys)

    for (const id of memories) {
      const row = database
        .prepare('SELECT record_json,version FROM memory_objects WHERE id=?')
        .get(id)
      if (!row) continue
      const record = memoryRecordSchema.parse(JSON.parse(at(row.record_json)))
      for (const version of database
        .prepare('SELECT file_name FROM memory_versions WHERE object_id=?')
        .all(id))
        if (version.file_name) files.add(at(version.file_name))
      const version = Math.max(Number(row.version), floor.get(id) ?? 0)
      const redacted = {
        ...record,
        objectVersion: version,
        title: '旧版本内容已被后续治理阻止',
        markdown: '',
        event: null,
        sources: [],
        state: 'suppressed',
        retention: 'trash'
      }
      database
        .prepare('UPDATE memory_objects SET version=?,record_json=? WHERE id=?')
        .run(version, JSON.stringify(redacted), id)
      database
        .prepare(
          "UPDATE memory_versions SET metadata_json='{}',file_name='',body_hash=? WHERE object_id=?"
        )
        .run(emptyHash, id)
      for (const table of ['memory_index', 'memory_pending', 'memory_cleanup'])
        database.prepare('DELETE FROM ' + table + ' WHERE object_id=?').run(id)
    }
    for (const id of rounds) {
      database
        .prepare(
          "UPDATE timeline_messages SET content='',source_session_id=NULL,source_message_id=NULL,status='interrupted' WHERE request_id=?"
        )
        .run(id)
      database
        .prepare(
          "UPDATE protocol_results SET result_json='{}' WHERE operation_id IN(SELECT o.id FROM tool_operations o JOIN protocol_segments s ON s.id=o.segment_id WHERE s.request_id=?)"
        )
        .run(id)
      database
        .prepare(
          "UPDATE tool_operations SET arguments_json='{}',record_json=json_remove(json_set(record_json,'$.summary','内容已被后续治理阻止','$.citations',json('[]')),'$.memoryReceipt','$.retentionIntent','$.retentionPreview') WHERE segment_id IN(SELECT id FROM protocol_segments WHERE request_id=?)"
        )
        .run(id)
      database
        .prepare(
          "UPDATE protocol_segments SET messages_json='[]',status='interrupted' WHERE request_id=?"
        )
        .run(id)
    }
    for (const id of proposals) {
      database.prepare("INSERT OR IGNORE INTO item_tombstones VALUES('proposal',?)").run(id)
      database.prepare('DELETE FROM item_proposals WHERE id=?').run(id)
      database.prepare("DELETE FROM item_sources WHERE node_type='proposal' AND node_id=?").run(id)
    }
    for (const id of items) {
      if (retiredItems.has(id)) {
        database.prepare("INSERT OR IGNORE INTO item_tombstones VALUES('item',?)").run(id)
        database.prepare('DELETE FROM items WHERE id=?').run(id)
        database.prepare("DELETE FROM item_sources WHERE node_type='item' AND node_id=?").run(id)
        continue
      }
      const row = database.prepare('SELECT record_json FROM items WHERE id=?').get(id)
      if (!row) continue
      const record = itemRecordSchema.parse(JSON.parse(at(row.record_json)))
      // Keep the formal identity. A later correction's unavailable body must not be fabricated.
      record.content = {
        ...record.content,
        title: '旧版本内容不可恢复，请核对后来版本',
        description: '',
        dueAt: null,
        timeZone: null,
        relatedIds: [],
        parentId: null,
        counterpart: ''
      }
      record.sources = []
      record.sourceUnavailable = true
      record.version = Math.max(
        record.version,
        Number(projections.find((p) => p.table === 'items' && p.keys[0] === id)?.values[0] ?? 0)
      )
      database
        .prepare('UPDATE items SET version=?,record_json=? WHERE id=?')
        .run(record.version, JSON.stringify(record), id)
    }
    redactGovernanceCopies(
      database,
      new Set([...memories, ...rounds, ...assistants, ...proposals, ...items])
    )
    applyRestoredReminderGovernance(database, projections, items)
    mergePermissions(database, projections)
    for (const p of projections)
      if (p.table === 'provider_connections') {
        const restored = database
          .prepare('SELECT version FROM provider_connections WHERE id=?')
          .get(...p.keys)
        // A later connection/credential generation cannot authorize a blob copied from an older one.
        // Conservatively require a new Key when the backup generation cannot be confirmed current.
        if (
          p.deleted ||
          p.values[2] === 0 ||
          (restored && Number(restored.version) < Number(p.values[0]))
        ) {
          markRestoredCredentialRevoked(directory, String(p.keys[0]))
          database
            .prepare('UPDATE provider_connections SET has_persistent_credential=0 WHERE id=?')
            .run(...p.keys)
        }
        database
          .prepare('UPDATE provider_connections SET version=max(version,?) WHERE id=?')
          .run(Number(p.values[0]), ...p.keys)
      }
    pauseRestoredWork(database)
    database.exec(
      'UPDATE retention_state SET epoch=epoch+1,generation=generation+1 WHERE singleton=1; COMMIT'
    )
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }

  // Only exact managed immutable files in this new copy are removed; the backup remains untouched.
  const memoryRoot = join(directory, 'memory')
  if (files.size) canonicalProductionDirectory(memoryRoot)
  for (const name of files) {
    if (!/^[a-f0-9-]+\.md(?:\.tmp)?$/.test(name)) throw Error('GOVERNANCE_MEMORY_PATH_INVALID')
    const path = join(memoryRoot, name)
    if (!existsSync(path)) continue
    const stat = lstatSync(path)
    if (!stat.isFile() || stat.isSymbolicLink()) throw Error('GOVERNANCE_MEMORY_PATH_INVALID')
    unlinkSync(path)
  }
  database.exec('VACUUM')
  return {
    unavailableMemories: memories.size,
    retiredRounds: rounds.size,
    unavailableItems: items.size
  }
}

function mergePermissions(database: DatabaseSync, projections: GovernanceProjection[]) {
  for (const p of projections) {
    const table = p.table
    const spec = {
      history_permissions: ['assistant_id', 'read_history'],
      history_recipient_grants: ['assistant_id,endpoint_fingerprint', 'send_history'],
      memory_permissions: ['assistant_id,scope', 'read_allowed,write_allowed,inferences_allowed'],
      memory_recipients: ['assistant_id,scope,fingerprint', 'allowed'],
      item_permissions: ['assistant_id', 'read_allowed,write_allowed,propose_allowed'],
      item_recipients: ['assistant_id,fingerprint', 'allowed']
    } as const
    if (!Object.hasOwn(spec, table)) continue
    const [keyText, flagText] = spec[table as keyof typeof spec]
    const keys = keyText.split(','),
      flags = flagText.split(',')
    const versioned = table.endsWith('_permissions')
    const allowed = p.values.slice(versioned ? 1 : 0)
    const assignments = flags.map(
      (flag, i) => flag + '=min(' + flag + ',' + (p.deleted ? 0 : Number(allowed[i])) + ')'
    )
    if (versioned) assignments.push('version=max(version,' + Number(p.values[0]) + ')')
    database
      .prepare(
        'UPDATE ' +
          table +
          ' SET ' +
          assignments.join(',') +
          ' WHERE ' +
          keys.map((key) => key + '=?').join(' AND ')
      )
      .run(...p.keys)
  }
}

function pauseRestoredWork(database: DatabaseSync) {
  database.exec(
    'UPDATE provider_connections SET enabled=0; DELETE FROM assistant_provider_bindings; DELETE FROM provider_capability_evidence'
  )
  for (const table of [
    'daily_configs',
    'background_configs',
    'steward_configs',
    'discovery_configs'
  ])
    database.exec(
      'UPDATE ' + table + " SET record_json=json_set(record_json,'$.enabled',json('false'))"
    )
  database.exec(
    "UPDATE memory_previews SET state='closed',payload_json='{}'; UPDATE retention_previews SET state='closed',manifest_json='{}'; UPDATE item_confirmations SET state='closed',payload_json='{}'"
  )
}
