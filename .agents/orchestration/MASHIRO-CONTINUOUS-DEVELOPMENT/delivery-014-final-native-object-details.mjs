import console from 'node:console'
import process from 'node:process'
import { DatabaseSync } from 'node:sqlite'

const databasePath = process.argv[2]
if (!databasePath) throw new Error('DATABASE_PATH_REQUIRED')

const database = new DatabaseSync(databasePath, { readOnly: true })
try {
  database.exec('PRAGMA query_only=ON')
  const memoryChanges = database
    .prepare(
      `SELECT id AS operation_id,assistant_id,request_id,state,
        json_extract(intent_json,'$.mutation.action') AS action,
        json_extract(receipt_json,'$.objectId') AS object_id,
        json_extract(receipt_json,'$.objectVersion') AS object_version,
        json_extract(receipt_json,'$.state') AS receipt_state
      FROM memory_commands WHERE request_id IS NOT NULL ORDER BY rowid DESC LIMIT 20`
    )
    .all()
  const receiptOperations = database
    .prepare(
      `SELECT o.id AS operation_id,s.assistant_id,s.request_id,s.status AS segment_status,
        json_extract(o.record_json,'$.toolName') AS tool_name,
        json_extract(o.record_json,'$.state') AS operation_state,
        json_extract(o.record_json,'$.memoryReceipt.objectId') AS object_id,
        json_extract(o.record_json,'$.memoryReceipt.objectVersion') AS object_version,
        json_extract(o.record_json,'$.memoryReceipt.state') AS receipt_state
      FROM protocol_segments s JOIN tool_operations o ON o.segment_id=s.id
      ORDER BY o.rowid LIMIT 20`
    )
    .all()
  console.log(JSON.stringify({ memoryChanges, receiptOperations }, null, 2))
} finally {
  database.close()
}
