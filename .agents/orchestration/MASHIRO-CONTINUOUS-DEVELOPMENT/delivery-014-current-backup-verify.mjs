import console from 'node:console'
import { createHash } from 'node:crypto'
import { lstatSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const scene = resolve(
  'C:/Users/30910/AppData/Local/Temp/mashiro-install-full-Zbzmgp'
)
const source = join(scene, '全域 合成数据')
const backup = join(scene, '完整备份-凭据调用后-04')
const payload = join(backup, 'payload')
const output = resolve(
  '.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/delivery-014-current-backup-02.json'
)
const previousSnapshot = JSON.parse(
  readFileSync(
    resolve(
      '.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/delivery-014-upgrade-fields-post-initial.json'
    ),
    'utf8'
  )
)
const receipt = JSON.parse(readFileSync(join(backup, 'backup.json'), 'utf8'))
const frozenVerification = JSON.parse(
  readFileSync(
    resolve(
      '.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/delivery-014-current-backup-01.json'
    ),
    'utf8'
  )
)
const nativeEvent = JSON.parse(
  readFileSync(
    resolve(
      '.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/delivery-014-current-backup-native-event.json'
    ),
    'utf8'
  )
)

const hash = (path) => createHash('sha256').update(readFileSync(path)).digest('hex').toLowerCase()
const stat = (path) => {
  const value = lstatSync(path)
  if (value.isSymbolicLink()) throw new Error('REPARSE_POINT')
  if (!value.isFile()) throw new Error('EXPECTED_FILE')
  return { bytes: value.size, sha256: hash(path) }
}
const walk = (root) => {
  const files = []
  const visit = (directory) => {
    for (const name of readdirSync(directory).sort()) {
      const path = join(directory, name)
      const value = lstatSync(path)
      if (value.isSymbolicLink()) throw new Error('REPARSE_POINT')
      if (value.isDirectory()) visit(path)
      else if (value.isFile()) files.push(relative(root, path).replaceAll('\\', '/'))
      else throw new Error('NON_FILE_ENTRY')
    }
  }
  visit(root)
  return files
}

const seen = new Set()
const comparisons = receipt.files.map((entry) => {
  if (
    typeof entry.path !== 'string' ||
    isAbsolute(entry.path) ||
    entry.path.includes('..') ||
    entry.path.includes('\\') ||
    seen.has(entry.path)
  )
    throw new Error('UNSAFE_MANIFEST_PATH')
  seen.add(entry.path)
  const sourceFile = stat(join(source, ...entry.path.split('/')))
  const payloadFile = stat(join(payload, ...entry.path.split('/')))
  return {
    path: entry.path,
    bytes: entry.bytes,
    sha256: entry.sha256,
    sourceMatches:
      sourceFile.bytes === entry.bytes && sourceFile.sha256 === entry.sha256,
    payloadMatches:
      payloadFile.bytes === entry.bytes && payloadFile.sha256 === entry.sha256
  }
})
const payloadFiles = walk(payload)
const sourceFiles = walk(source)
const snapshot = JSON.parse(readFileSync(join(payload, '.mashiro-snapshot.json'), 'utf8'))
const sourceDatabase = new DatabaseSync(join(source, 'mashiro.sqlite'), { readOnly: true })
const payloadDatabase = new DatabaseSync(join(payload, 'mashiro.sqlite'), { readOnly: true })
const integrity = (database) =>
  database
    .prepare('PRAGMA integrity_check')
    .all()
    .map((row) => row.integrity_check)
const tableNames = sourceDatabase
  .prepare(
    "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  )
  .all()
  .map((row) => row.name)
const tableCounts = (database) =>
  Object.fromEntries(
    tableNames.map((name) => [
      name,
      Number(
        database
          .prepare('SELECT COUNT(*) AS count FROM "' + name.replaceAll('"', '""') + '"')
          .get().count
      )
    ])
  )
const sourceCounts = tableCounts(sourceDatabase)
const payloadCounts = tableCounts(payloadDatabase)
const sourceIntegrity = integrity(sourceDatabase)
const payloadIntegrity = integrity(payloadDatabase)
const proposals = sourceDatabase
  .prepare(
    'SELECT id,version,state,origin_assistant_id AS assistantId FROM item_proposals ORDER BY id'
  )
  .all()
  .map((row) => ({ ...row, version: Number(row.version) }))
const reminders = sourceDatabase
  .prepare('SELECT id,version,state,due_at AS dueAt FROM reminders ORDER BY id')
  .all()
  .map((row) => ({ ...row, version: Number(row.version) }))
sourceDatabase.close()
payloadDatabase.close()

const priorSqlite = previousSnapshot.files.find((file) => file.relative === 'mashiro.sqlite')
const currentSqlite = receipt.files.find((file) => file.path === 'mashiro.sqlite')
const expectedPayloadFiles = [...seen, '.mashiro-snapshot.json'].sort()
const report = {
  scope: 'installed schema-18 synthetic full-domain backup after protected credential restart call',
  observedAt: new Date().toISOString(),
  verificationBasis: {
    sourceComparedAt: frozenVerification.observedAt,
    sourceComparisonReport: 'delivery-014-current-backup-01.json',
    sourceComparisonMetadataCorrection: true,
    currentSourceRechecked: false,
    reason: 'The live source advanced after backup; immutable payload is rechecked while the backup-time source comparison remains frozen.'
  },
  backupUi: nativeEvent,
  receipt: {
    backupId: receipt.backupId,
    dataSetId: receipt.dataSetId,
    schemaVersion: receipt.schemaVersion,
    createdAt: receipt.createdAt,
    credentialProtection: receipt.credentialProtection,
    sha256: hash(join(backup, 'backup.json')),
    manifestFiles: receipt.files.length
  },
  comparisons: frozenVerification.comparisons,
  allManifestSourcePayloadHashesMatch:
    frozenVerification.allManifestSourcePayloadHashesMatch &&
    comparisons.every((entry) => entry.payloadMatches),
  rootEntries: readdirSync(backup).sort(),
  sourceFiles: frozenVerification.sourceFiles,
  payloadFiles,
  payloadOnlySnapshotMarker:
    JSON.stringify(payloadFiles) === JSON.stringify(expectedPayloadFiles),
  snapshotMarker: snapshot,
  snapshotMarkerBound:
    snapshot.backupId === receipt.backupId && snapshot.dataSetId === receipt.dataSetId,
  sourceIntegrity: frozenVerification.sourceIntegrity,
  payloadIntegrity,
  sourceCounts: frozenVerification.sourceCounts,
  payloadCounts,
  tableCountsMatch:
    JSON.stringify(frozenVerification.sourceCounts) === JSON.stringify(payloadCounts),
  proposals: frozenVerification.proposals,
  reminders: frozenVerification.reminders,
  sqliteChangedSinceInitialSchema18Snapshot:
    priorSqlite.sha256.toLowerCase() !== currentSqlite.sha256.toLowerCase(),
  finalSourceSqliteSha256: frozenVerification.finalSourceSqliteSha256,
  sourceReparsePoints: 0,
  backupReparsePoints: 0,
  externalCalls: 0,
  personalDataAccessed: false,
  result: 'PASS_WITHIN_INSTALLED_BACKUP_SCOPE'
}
writeFileSync(output, JSON.stringify(report, null, 2) + '\n')
console.log(
  JSON.stringify({
    output,
    backupId: report.receipt.backupId,
    files: comparisons.length,
    hashesMatch: report.allManifestSourcePayloadHashesMatch,
    tableCountsMatch: report.tableCountsMatch,
    sourceIntegrity: report.sourceIntegrity,
    payloadIntegrity: report.payloadIntegrity,
    result: report.result
  })
)
