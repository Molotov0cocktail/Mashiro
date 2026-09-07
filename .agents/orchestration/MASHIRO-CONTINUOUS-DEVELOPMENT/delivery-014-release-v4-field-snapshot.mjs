import { Buffer } from 'node:buffer'
import console from 'node:console'
import { createHash } from 'node:crypto'
import process from 'node:process'
import { lstatSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const phase = process.argv[2]
if (!['pre-upgrade', 'post-install', 'post-first-launch'].includes(phase)) {
  throw new Error('PHASE_INVALID')
}

const scene = resolve(
  'C:/Users/30910/AppData/Local/Temp/mashiro-install-full-Zbzmgp'
)
const source = join(scene, '全域 合成数据')
const output = resolve(
  `.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/delivery-014-release-v4-${phase}.json`
)
const preOutput = resolve(
  '.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/delivery-014-release-v4-pre-upgrade.json'
)

const sha256 = (value) => createHash('sha256').update(value).digest('hex').toUpperCase()
const canonical = (value) => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Buffer.isBuffer(value)) return JSON.stringify({ bufferSha256: sha256(value) })
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
    .join(',')}}`
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

const dataset = JSON.parse(readFileSync(join(source, '.mashiro-dataset.json'), 'utf8'))
const database = new DatabaseSync(join(source, 'mashiro.sqlite'), { readOnly: true })
const integrity = database
  .prepare('PRAGMA integrity_check')
  .all()
  .map((row) => row.integrity_check)
const foreignKeyViolations = database.prepare('PRAGMA foreign_key_check').all()
const schemaVersion = Number(database.prepare('PRAGMA user_version').get().user_version)
const schemaRows = database
  .prepare(
    "SELECT name,sql FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  )
  .all()
const tableDigests = schemaRows.map(({ name, sql }) => {
  const escaped = name.replaceAll('"', '""')
  const rows = database
    .prepare(`SELECT * FROM "${escaped}"`)
    .all()
    .map(canonical)
    .sort()
  return {
    name,
    rowCount: rows.length,
    rowsSha256: sha256(rows.join('\n')),
    schemaSha256: sha256(sql ?? '')
  }
})

const selected = {
  assistants: database
    .prepare(
      `SELECT id,version,archived_at IS NOT NULL AS archived,
       EXISTS(SELECT 1 FROM assistant_tombstones t WHERE t.id=assistants.id) AS tombstoned
       FROM assistants ORDER BY id`
    )
    .all()
    .map((row) => ({ ...row, version: Number(row.version), archived: Boolean(row.archived), tombstoned: Boolean(row.tombstoned) })),
  assistantState: database
    .prepare(
      'SELECT primary_assistant_id AS primaryAssistantId,current_assistant_id AS currentAssistantId,revision FROM assistant_state WHERE singleton=1'
    )
    .get(),
  providerBindings: database
    .prepare(
      'SELECT assistant_id AS assistantId,connection_id AS connectionId,model,version FROM assistant_provider_bindings ORDER BY assistant_id'
    )
    .all(),
  providerConnections: database
    .prepare(
      'SELECT id,enabled,has_persistent_credential AS hasPersistentCredential,version FROM provider_connections ORDER BY id'
    )
    .all()
    .map((row) => ({ ...row, enabled: Boolean(row.enabled), hasPersistentCredential: Boolean(row.hasPersistentCredential), version: Number(row.version) })),
  timelineByAssistantRoleStatus: database
    .prepare(
      'SELECT assistant_id AS assistantId,role,status,COUNT(*) AS count FROM timeline_messages GROUP BY assistant_id,role,status ORDER BY assistant_id,role,status'
    )
    .all(),
  memoryObjects: database
    .prepare('SELECT id,version FROM memory_objects ORDER BY id')
    .all(),
  memoryVersions: database
    .prepare(
      'SELECT object_id AS objectId,version,file_name AS fileName,body_hash AS bodyHash FROM memory_versions ORDER BY object_id,version'
    )
    .all(),
  memoryPermissions: database
    .prepare(
      'SELECT assistant_id AS assistantId,scope,version,read_allowed AS readAllowed,write_allowed AS writeAllowed,inferences_allowed AS inferencesAllowed FROM memory_permissions ORDER BY assistant_id,scope'
    )
    .all(),
  items: database
    .prepare('SELECT id,version,origin_proposal_id AS originProposalId FROM items ORDER BY id')
    .all(),
  proposals: database
    .prepare(
      'SELECT id,version,origin_assistant_id AS assistantId,state,identity_hash AS identityHash FROM item_proposals ORDER BY id'
    )
    .all(),
  reminders: database
    .prepare('SELECT id,item_id AS itemId,version,state,due_at AS dueAt FROM reminders ORDER BY id')
    .all(),
  reminderSettings: database
    .prepare('SELECT version,policy_json AS policyJson FROM reminder_settings WHERE singleton=1')
    .all()
    .map((row) => ({ version: Number(row.version), policySha256: sha256(row.policyJson) })),
  reminderNotificationMembers: database
    .prepare(
      'SELECT group_id AS groupId,reminder_id AS reminderId,version FROM reminder_notification_members ORDER BY group_id,reminder_id,version'
    )
    .all(),
  reminderOccurrences: database
    .prepare('SELECT reminder_id AS reminderId,version,state FROM reminder_occurrences ORDER BY reminder_id,version')
    .all(),
  historyPermissions: database
    .prepare(
      'SELECT assistant_id AS assistantId,read_history AS readHistory,version FROM history_permissions ORDER BY assistant_id'
    )
    .all(),
  historyRecipientGrantCount: Number(
    database.prepare('SELECT COUNT(*) AS count FROM history_recipient_grants').get().count
  ),
  retentionState: database
    .prepare('SELECT epoch,generation FROM retention_state WHERE singleton=1')
    .get()
}
database.close()

const report = {
  scope: `schema-${schemaVersion} synthetic full-domain ${phase}-upgrade field and digest snapshot`,
  phase,
  expectedInstallerSha256: 'D352DD8AAD149D011405400476C2561C336768F076523E7DEDD2CCDB45D16EF4',
  expectedSourceRevision: '37620929a7f507bb31d41861114cf6f825d715fd',
  observedAt: new Date().toISOString(),
  source,
  dataSetId: dataset.dataSetId,
  schemaVersion,
  integrity,
  foreignKeyViolations,
  files,
  tableDigests,
  selected,
  sourceReparsePoints: 0,
  installedMashiroProcesses: 0,
  externalCalls: 0,
  personalDataAccessed: false
}

if (phase !== 'pre-upgrade') {
  const before = JSON.parse(readFileSync(preOutput, 'utf8'))
  const beforeTables = new Map(before.tableDigests.map((entry) => [entry.name, entry]))
  const afterTables = new Map(tableDigests.map((entry) => [entry.name, entry]))
  report.comparison = {
    sameDataSetId: before.dataSetId === report.dataSetId,
    schemaVersion: { before: before.schemaVersion, after: report.schemaVersion },
    existingTables: before.tableDigests.map((entry) => ({
      name: entry.name,
      present: afterTables.has(entry.name),
      rowsEqual: afterTables.get(entry.name)?.rowsSha256 === entry.rowsSha256,
      rowCountBefore: entry.rowCount,
      rowCountAfter: afterTables.get(entry.name)?.rowCount ?? null
    })),
    addedTables: tableDigests
      .filter((entry) => !beforeTables.has(entry.name))
      .map((entry) => ({ name: entry.name, rowCount: entry.rowCount })),
    selectedEqual: canonical(before.selected) === canonical(report.selected),
    unchangedNonDatabaseFiles:
      canonical(before.files.filter((file) => file.relative !== 'mashiro.sqlite')) ===
      canonical(report.files.filter((file) => file.relative !== 'mashiro.sqlite'))
  }
}

writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)
console.log(
  JSON.stringify({
    output,
    phase,
  expectedInstallerSha256: 'D352DD8AAD149D011405400476C2561C336768F076523E7DEDD2CCDB45D16EF4',
  expectedSourceRevision: '37620929a7f507bb31d41861114cf6f825d715fd',
    dataSetId: report.dataSetId,
    schemaVersion,
    integrity,
    foreignKeyViolations: foreignKeyViolations.length,
    fileCount: files.length,
    tableCount: tableDigests.length,
    selectedEqual: report.comparison?.selectedEqual ?? null
  })
)
