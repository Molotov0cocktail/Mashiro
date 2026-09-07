import { Buffer } from 'node:buffer'
import console from 'node:console'
import { createHash } from 'node:crypto'
import process from 'node:process'
import {
  lstatSync,
  readFileSync,
  realpathSync,
  readdirSync,
  writeFileSync
} from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const scene = resolve(
  'C:/Users/30910/AppData/Local/Temp/mashiro-install-full-Zbzmgp'
)
const phases = {
  'later-before-restore': join(scene, '安装 旧版本', 'data'),
  'after-old-backup-restore': join(scene, '恢复治理-C')
}
const phase = process.argv[2]
const source = phases[phase]
if (!source) throw new Error('PHASE_INVALID')

const output = resolve(
  `.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/delivery-014-release-v4-governance-${phase}.json`
)
const sha256 = (value) =>
  createHash('sha256').update(value).digest('hex').toUpperCase()
const canonical = (value) => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Buffer.isBuffer(value)) return JSON.stringify({ bufferSha256: sha256(value) })
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
    .join(',')}}`
}

const sourceStat = lstatSync(source)
if (!sourceStat.isDirectory() || sourceStat.isSymbolicLink()) {
  throw new Error('SOURCE_NOT_PLAIN_DIRECTORY')
}
if (realpathSync.native(source) !== source) throw new Error('SOURCE_REALPATH_MISMATCH')
const databasePath = join(source, 'mashiro.sqlite')
const databaseStat = lstatSync(databasePath)
if (!databaseStat.isFile() || databaseStat.isSymbolicLink()) {
  throw new Error('DATABASE_NOT_PLAIN_FILE')
}
if (realpathSync.native(databasePath) !== databasePath) {
  throw new Error('DATABASE_REALPATH_MISMATCH')
}

const files = []
const visit = (directory) => {
  for (const name of readdirSync(directory).sort()) {
    const path = join(directory, name)
    const stat = lstatSync(path)
    if (stat.isSymbolicLink()) throw new Error('SOURCE_REPARSE_POINT')
    if (stat.isDirectory()) {
      visit(path)
      continue
    }
    if (!stat.isFile()) throw new Error('SOURCE_NON_FILE_ENTRY')
    files.push({
      relative: relative(source, path).replaceAll('\\', '/'),
      bytes: stat.size,
      sha256: sha256(readFileSync(path))
    })
  }
}
visit(source)

const database = new DatabaseSync(databasePath, { readOnly: true })
const tableNames = [
  'assistant_provider_bindings',
  'daily_configs',
  'daily_jobs',
  'memory_objects',
  'memory_permissions',
  'memory_recipients',
  'memory_round_evidence',
  'memory_suppressions',
  'memory_versions',
  'protocol_segments',
  'provider_connections',
  'retention_job_items',
  'retention_jobs',
  'steward_configs',
  'steward_jobs',
  'tool_operations',
  'usage_attempts'
]
const tableDigests = tableNames.map((name) => {
  const escaped = name.replaceAll('"', '""')
  const rows = database
    .prepare(`SELECT * FROM "${escaped}"`)
    .all()
    .map(canonical)
    .sort()
  return { name, rowCount: rows.length, rowsSha256: sha256(rows.join('\n')) }
})

const assistantId = '61c7cbec-1175-4a3e-9ccb-6212fb92c5db'
const objectId = 'f93a4a2f-430f-4f28-acc4-31f7f803e844'
const objectRow = database
  .prepare('SELECT version,record_json AS recordJson FROM memory_objects WHERE id=?')
  .get(objectId)
const objectRecord = objectRow ? JSON.parse(String(objectRow.recordJson)) : null
const safeObject = objectRecord
  ? {
      id: objectRecord.id,
      version: Number(objectRow.version),
      kind: objectRecord.kind,
      scope: objectRecord.scope,
      ownerAssistantId: objectRecord.ownerAssistantId,
      nature: objectRecord.nature,
      state: objectRecord.state,
      recordJsonSha256: sha256(String(objectRow.recordJson)),
      titleSha256: sha256(String(objectRecord.title ?? '')),
      markdownSha256: sha256(String(objectRecord.markdown ?? ''))
    }
  : null
const versions = database
  .prepare(
    'SELECT object_id AS objectId,version,file_name AS fileName,body_hash AS bodyHash,metadata_json AS metadataJson FROM memory_versions WHERE object_id=? ORDER BY version'
  )
  .all(objectId)
  .map((row) => ({
    objectId: String(row.objectId),
    version: Number(row.version),
    fileName: String(row.fileName),
    bodyHash: String(row.bodyHash),
    metadataSha256: sha256(String(row.metadataJson))
  }))
const suppressions = database
  .prepare(
    'SELECT source_type AS sourceType,source_id AS sourceId,source_version AS sourceVersion,kind,object_id AS objectId FROM memory_suppressions WHERE object_id=? OR source_id=? ORDER BY kind,source_id'
  )
  .all(objectId, objectId)
const permissions = database
  .prepare(
    'SELECT scope,version,read_allowed AS readAllowed,write_allowed AS writeAllowed,inferences_allowed AS inferencesAllowed FROM memory_permissions WHERE assistant_id=? ORDER BY scope'
  )
  .all(assistantId)
const recipients = database
  .prepare(
    'SELECT scope,fingerprint,allowed FROM memory_recipients WHERE assistant_id=? ORDER BY scope,fingerprint'
  )
  .all(assistantId)
  .map((row) => ({
    scope: String(row.scope),
    fingerprintSha256: sha256(String(row.fingerprint)),
    allowed: Number(row.allowed)
  }))
const connections = database
  .prepare(
    'SELECT id,display_name AS displayName,base_url AS baseUrl,enabled,has_persistent_credential AS hasPersistentCredential,version FROM provider_connections ORDER BY id'
  )
  .all()
  .map((row) => ({
    id: String(row.id),
    displayName: String(row.displayName),
    baseUrlSha256: sha256(String(row.baseUrl)),
    enabled: Number(row.enabled),
    hasPersistentCredential: Number(row.hasPersistentCredential),
    version: Number(row.version)
  }))
const bindings = database
  .prepare(
    'SELECT assistant_id AS assistantId,connection_id AS connectionId,model,version FROM assistant_provider_bindings ORDER BY assistant_id'
  )
  .all()
const daily = database
  .prepare('SELECT id,feature,record_json AS recordJson FROM daily_configs ORDER BY id')
  .all()
  .map((row) => {
    const record = JSON.parse(String(row.recordJson))
    return {
      id: String(row.id),
      feature: String(row.feature),
      enabled: Boolean(record.enabled),
      recordJsonSha256: sha256(String(row.recordJson))
    }
  })
const attempts = database
  .prepare('SELECT id,record_json AS recordJson FROM usage_attempts ORDER BY rowid')
  .all()
  .map((row) => ({ id: String(row.id), ...JSON.parse(String(row.recordJson)) }))
const sum = (field) =>
  attempts.reduce(
    (total, attempt) => total + Number(attempt.actual?.[field] ?? 0),
    0
  )

const report = {
  scope: 'later synthetic governance state around old-backup restore',
  phase,
  observedAt: new Date().toISOString(),
  source,
  dataSetId: JSON.parse(
    readFileSync(join(source, '.mashiro-dataset.json'), 'utf8')
  ).dataSetId,
  schemaVersion: Number(database.prepare('PRAGMA user_version').get().user_version),
  integrity: database
    .prepare('PRAGMA integrity_check')
    .all()
    .map((row) => row.integrity_check),
  foreignKeyViolations: database.prepare('PRAGMA foreign_key_check').all(),
  files,
  tableDigests,
  selected: {
    assistantId,
    objectId,
    object: safeObject,
    versions,
    suppressions,
    permissions,
    recipients,
    connections,
    bindings,
    daily,
    usage: {
      attempts: attempts.length,
      settled: attempts.filter((attempt) => attempt.state === 'SETTLED').length,
      unknown: attempts.filter((attempt) => attempt.state === 'UNKNOWN').length,
      sending: attempts.filter((attempt) => attempt.state === 'SENDING').length,
      promptTokens: sum('promptTokens'),
      completionTokens: sum('completionTokens'),
      totalTokens: sum('totalTokens'),
      inputCharacters: attempts.reduce(
        (total, attempt) => total + Number(attempt.inputCharacters ?? 0),
        0
      )
    }
  },
  credentialContentRead: false,
  messageContentRead: false,
  externalCalls: 0
}
database.close()
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)
console.log(
  JSON.stringify({
    output,
    phase,
    schemaVersion: report.schemaVersion,
    objectState: report.selected.object?.state ?? null,
    suppressionCount: report.selected.suppressions.length,
    recipientCount: report.selected.recipients.length,
    connectionEnabled: report.selected.connections.map((value) => value.enabled),
    bindingCount: report.selected.bindings.length,
    usage: report.selected.usage
  })
)
