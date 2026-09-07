import console from 'node:console'
import process from 'node:process'
import { DatabaseSync } from 'node:sqlite'

const databasePath = process.argv[2]
if (!databasePath) throw new Error('DATABASE_PATH_REQUIRED')

const database = new DatabaseSync(databasePath, { readOnly: true })
try {
  database.exec('PRAGMA query_only=ON')
  const tableExists = (name) =>
    Boolean(
      database
        .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?")
        .get(name)
    )
  const count = (table) =>
    tableExists(table)
      ? Number(database.prepare(`SELECT count(*) AS count FROM ${table}`).get().count)
      : null
  const assistants = database
    .prepare(
      `SELECT a.id,a.archived_at IS NULL AS active,
        EXISTS(SELECT 1 FROM assistant_tombstones t WHERE t.id=a.id) AS tombstoned
      FROM assistants a ORDER BY a.created_at,a.id`
    )
    .all()
  const provided = tableExists('memory_round_evidence')
    ? database
        .prepare(
          `SELECT assistant_id,request_id,state,count(*) AS entry_count,
            min(rowid) AS first_cursor,max(rowid) AS last_cursor
          FROM memory_round_evidence
          GROUP BY assistant_id,request_id
          ORDER BY max(rowid) DESC LIMIT 20`
        )
        .all()
    : []
  const changes = tableExists('memory_commands')
    ? database
        .prepare(
          `SELECT assistant_id,request_id,state,count(*) AS entry_count,
            min(rowid) AS first_cursor,max(rowid) AS last_cursor
          FROM memory_commands WHERE request_id IS NOT NULL
          GROUP BY assistant_id,request_id,state
          ORDER BY max(rowid) DESC LIMIT 20`
        )
        .all()
    : []
  const receiptRounds = tableExists('protocol_segments') && tableExists('tool_operations')
    ? database
        .prepare(
          `SELECT s.assistant_id,s.request_id,s.status,count(o.id) AS operation_count,
            min(o.rowid) AS first_operation_cursor,max(o.rowid) AS last_operation_cursor
          FROM protocol_segments s JOIN tool_operations o ON o.segment_id=s.id
          GROUP BY s.id ORDER BY min(o.rowid) LIMIT 20`
        )
        .all()
    : []
  console.log(
    JSON.stringify(
      {
        schemaVersion: Number(database.prepare('PRAGMA user_version').get().user_version),
        integrity: String(database.prepare('PRAGMA integrity_check').get().integrity_check),
        assistants,
        counts: Object.fromEntries(
          [
            'timeline_messages',
            'protocol_segments',
            'tool_operations',
            'memory_round_evidence',
            'memory_commands',
            'memories',
            'items',
            'item_proposals'
          ].map((table) => [table, count(table)])
        ),
        provided,
        changes,
        oldestReceiptRounds: receiptRounds
      },
      null,
      2
    )
  )
} finally {
  database.close()
}
