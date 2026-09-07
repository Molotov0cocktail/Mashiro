import type { DatabaseSync } from 'node:sqlite'

/** Clear derived copies and close old execution authority without removing accepted domain identities. */
export function redactGovernanceCopies(database: DatabaseSync, ids: Set<string>): void {
  const references = (row: Record<string, unknown>) => {
    const text = JSON.stringify(row)
    return [...ids].some((id) => text.includes(id))
  }
  const scrubReceipt = (text: unknown): string | null => {
    if (text === null) return null
    const value = JSON.parse(String(text)) as Record<string, unknown>
    if ('summary' in value) value.summary = '操作正文已被后续治理清理'
    if (value.memory && typeof value.memory === 'object')
      value.memory = JSON.parse(scrubReceipt(JSON.stringify(value.memory))!)
    if ('confirmationId' in value) value.confirmationId = null
    delete value.impact
    delete value.itemReceipt
    delete value.reminderPreview
    delete value.reminderReceipt
    delete value.memoryReceipt
    delete value.retentionIntent
    delete value.retentionPreview
    if ('citations' in value) value.citations = []
    return JSON.stringify(value)
  }
  for (const row of database.prepare('SELECT * FROM memory_commands').all())
    if (references(row)) {
      const intent = JSON.parse(String(row.intent_json))
      database.prepare('UPDATE memory_commands SET intent_json=?,receipt_json=? WHERE id=?').run(
        JSON.stringify({
          mutation: { action: intent.mutation?.action ?? 'delete' },
          actor: intent.actor ?? 'user'
        }),
        scrubReceipt(row.receipt_json),
        String(row.id)
      )
    }
  for (const table of ['item_commands', 'retention_commands', 'daily_commands'])
    for (const row of database.prepare('SELECT * FROM ' + table).all())
      if (references(row))
        database
          .prepare('UPDATE ' + table + ' SET receipt_json=? WHERE id=?')
          .run(scrubReceipt(row.receipt_json), String(row.id))
  // A protocol transcript can copy results and reasoning from any earlier call in its segment.
  // Discover all affected segments before clearing any evidence, including search results whose
  // object IDs never appeared in tool arguments.
  const operations = database.prepare('SELECT * FROM tool_operations').all()
  const segments = new Set<string>()
  for (const row of operations) if (references(row)) segments.add(String(row.segment_id))
  for (const row of database
    .prepare(
      'SELECT o.segment_id,r.result_json FROM protocol_results r JOIN tool_operations o ON o.id=r.operation_id'
    )
    .all())
    if (references(row)) segments.add(String(row.segment_id))
  for (const row of database.prepare('SELECT id,messages_json FROM protocol_segments').all())
    if (references(row)) segments.add(String(row.id))
  for (const id of segments)
    database
      .prepare("UPDATE protocol_segments SET messages_json='[]',status='interrupted' WHERE id=?")
      .run(id)
  for (const row of operations)
    if (segments.has(String(row.segment_id))) {
      database
        .prepare("UPDATE tool_operations SET arguments_json='{}',record_json=? WHERE id=?")
        .run(scrubReceipt(row.record_json), String(row.id))
      database
        .prepare("UPDATE protocol_results SET result_json='{}' WHERE operation_id=?")
        .run(String(row.id))
    }
  for (const row of database.prepare('SELECT * FROM daily_reports').all())
    if (references(row)) {
      const record = JSON.parse(String(row.record_json))
      record.state = 'SUPPRESSED'
      record.bodyAvailable = false
      record.version++
      record.governanceVersion++
      database
        .prepare("UPDATE daily_reports SET record_json=?,content_json='{}' WHERE id=?")
        .run(JSON.stringify(record), String(row.id))
    }
  for (const row of database.prepare('SELECT * FROM background_chapters').all())
    if (references(row)) {
      const record = JSON.parse(String(row.record_json))
      record.state = 'UNAVAILABLE'
      record.title = '内容已被后续治理清理'
      record.topics = []
      record.version++
      database
        .prepare('UPDATE background_chapters SET record_json=? WHERE id=?')
        .run(JSON.stringify(record), String(row.id))
    }
  for (const table of ['daily_item_checkpoints', 'daily_item_changes'])
    for (const row of database.prepare('SELECT rowid AS _rowid,* FROM ' + table).all())
      if (references(row))
        database.prepare('DELETE FROM ' + table + ' WHERE rowid=?').run(Number(row._rowid))
  // Restored partial jobs cannot replay stable slots against a different governance generation.
  for (const table of ['daily_jobs', 'steward_jobs', 'background_jobs']) {
    database.exec('UPDATE ' + table + ' SET candidate_json=NULL')
    database.exec(
      'UPDATE ' +
        table +
        " SET record_json=json_set(record_json,'$.state','STALE','$.reason','备份恢复后请重新确认工作资格') WHERE json_extract(record_json,'$.state') NOT IN('COMPLETED','CANCELLED','FAILED','FAILED_CONFIRMED','STALE')"
    )
    if (table !== 'background_jobs') database.exec('UPDATE ' + table + " SET inputs_json='{}'")
  }
  for (const row of database.prepare('SELECT rowid AS _rowid,* FROM steward_slots').all())
    if (references(row) && row.receipt_json !== null)
      database
        .prepare('UPDATE steward_slots SET receipt_json=? WHERE rowid=?')
        .run(scrubReceipt(row.receipt_json), Number(row._rowid))
  database.exec(
    "UPDATE steward_slots SET plan_json='{}'; UPDATE memory_pending SET candidate_json=NULL,state='stale' WHERE state='pending'"
  )
}
