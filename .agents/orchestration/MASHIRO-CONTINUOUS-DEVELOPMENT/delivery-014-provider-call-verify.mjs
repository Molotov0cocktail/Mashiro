import console from 'node:console'
import { createHash } from 'node:crypto'
import { lstatSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const source = resolve(
  'C:/Users/30910/AppData/Local/Temp/mashiro-install-full-Zbzmgp/全域 合成数据'
)
const memoryId = '43c35979-ee88-4510-a699-7bb0bd8c026d'
const operationId = '97bcb3b7-cff7-4434-92c6-b38435733918'
const token = 'SYNTH_KEY_RESTART_c2a8f772aff5'
const database = new DatabaseSync(join(source, 'mashiro.sqlite'), { readOnly: true })
const objectRow = database
  .prepare('SELECT id,version,record_json AS recordJson FROM memory_objects WHERE id=?')
  .get(memoryId)
if (!objectRow || Number(objectRow.version) !== 1) throw new Error('MEMORY_OBJECT_NOT_FOUND')
const versionRow = database
  .prepare(
    'SELECT version,file_name AS fileName,body_hash AS bodyHash,metadata_json AS metadataJson FROM memory_versions WHERE object_id=? AND version=?'
  )
  .get(memoryId, 1)
if (!versionRow || !/^[a-f0-9-]+\.md$/.test(String(versionRow.fileName))) {
  throw new Error('MEMORY_VERSION_NOT_FOUND')
}
const memoryPath = join(source, 'memory', String(versionRow.fileName))
const stat = lstatSync(memoryPath)
if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('MEMORY_FILE_NOT_REGULAR')
const memoryBytes = readFileSync(memoryPath)
const memoryText = memoryBytes.toString('utf8')
const memorySha256 = createHash('sha256').update(memoryBytes).digest('hex').toUpperCase()
if (memorySha256 !== String(versionRow.bodyHash).toUpperCase()) {
  throw new Error('MEMORY_BODY_HASH_MISMATCH')
}
if (!memoryText.includes(token)) throw new Error('SYNTHETIC_TOKEN_NOT_PERSISTED')

const toolRow = database
  .prepare('SELECT record_json AS recordJson FROM tool_operations WHERE id=?')
  .get(operationId)
if (!toolRow) throw new Error('TOOL_OPERATION_NOT_FOUND')
const toolRecord = JSON.parse(String(toolRow.recordJson))
const objectRecord = JSON.parse(String(objectRow.recordJson))
const metadata = JSON.parse(String(versionRow.metadataJson))
const count = (table) =>
  Number(database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count)
const connection = database
  .prepare(
    'SELECT id,has_persistent_credential AS hasPersistentCredential,version FROM provider_connections WHERE id=?'
  )
  .get('f720fc8c-a2c4-4765-b02e-87e2c98bc8fd')
const report = {
  observedAt: new Date().toISOString(),
  source,
  schemaVersion: Number(database.prepare('PRAGMA user_version').get().user_version),
  integrity: database.prepare('PRAGMA integrity_check').all().map((row) => row.integrity_check),
  memory: {
    id: memoryId,
    version: 1,
    fileName: versionRow.fileName,
    bytes: stat.size,
    sha256: memorySha256,
    bodyHashMatches: true,
    containsSyntheticToken: true,
    objectRecordKeys: Object.keys(objectRecord).sort(),
    metadataKeys: Object.keys(metadata).sort()
  },
  tool: {
    operationId,
    recordKeys: Object.keys(toolRecord).sort(),
    state: toolRecord.state,
    command: toolRecord.command,
    memoryReceipt:
      toolRecord.memoryReceipt == null
        ? null
        : {
            operationId: toolRecord.memoryReceipt.operationId,
            objectId: toolRecord.memoryReceipt.objectId,
            objectVersion: toolRecord.memoryReceipt.objectVersion,
            state: toolRecord.memoryReceipt.state
          }
  },
  counts: {
    items: count('items'),
    itemProposals: count('item_proposals'),
    reminders: count('reminders'),
    memoryObjects: count('memory_objects'),
    timelineMessages: count('timeline_messages'),
    protocolSegments: count('protocol_segments'),
    toolOperations: count('tool_operations'),
    usageAttempts: count('usage_attempts')
  },
  connection: {
    id: connection?.id ?? null,
    hasPersistentCredential: Number(connection?.hasPersistentCredential ?? 0) === 1,
    version: Number(connection?.version ?? 0)
  },
  credentialContentRead: false,
  otherMemoryBodiesRead: false,
  personalDataAccessed: false
}
database.close()
const output = resolve(
  '.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/delivery-014-provider-call-verify.json'
)
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)
console.log(
  JSON.stringify({
    output,
    schemaVersion: report.schemaVersion,
    memory: report.memory,
    tool: report.tool,
    counts: report.counts,
    connection: report.connection
  })
)
