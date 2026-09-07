import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, lstatSync, realpathSync } from 'node:fs'
import { resolve, join, sep } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import process from 'node:process'
const evidence = resolve('.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT')
const sha = value => createHash('sha256').update(value).digest('hex').toUpperCase()
const canonical = value => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Buffer.isBuffer(value)) return JSON.stringify({ bufferSha256: sha(value) })
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
}
const read = name => JSON.parse(readFileSync(join(evidence, name), 'utf8'))
const proof = read('delivery-014-release-v4-root-backup05.json')
const backup = resolve(proof.backupDirectory)
const guard = (path, directory = false) => {
  const stat = lstatSync(path)
  assert.equal(stat.isSymbolicLink(), false)
  assert.equal(directory ? stat.isDirectory() : stat.isFile(), true)
  assert.equal(realpathSync.native(path), path)
}
guard(backup, true)
const manifestPath = join(backup, 'backup.json')
guard(manifestPath)
assert.equal(sha(readFileSync(manifestPath)), '86C605EA93D3EBA23B520D7ADB10D9DBEAE5E5239B6C7CF51981FDDC40C48B00')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
assert.equal(manifest.backupId, 'e25f2bb0-1f07-44a9-a8e3-7268081cb10b')
assert.equal(manifest.dataSetId, '9f2cf384-daa4-4bb6-819a-33976e479c5a')
assert.equal(manifest.files.length, 17)
for (const file of manifest.files) {
  const path = resolve(backup, 'payload', file.path)
  assert.ok(path.startsWith(join(backup, 'payload') + sep))
  guard(path)
  const bytes = readFileSync(path)
  assert.equal(bytes.length, file.bytes)
  assert.equal(sha(bytes), file.sha256.toUpperCase())
}
const ids = ['7047bddd-41d8-44b6-a465-f9d67ca88c1f', '89bf8311-b044-47b7-907f-b928af63532a']
const snapshots = {}
for (const phase of ['before', 'after', 'backup']) {
  const reference = phase === 'backup' ? null : read(`delivery-014-release-v4-op-rows-${phase}.json`)
  const source = phase === 'backup' ? join(backup, 'payload') : reference.source
  guard(source, true)
  const path = join(source, 'mashiro.sqlite')
  guard(path)
  const database = new DatabaseSync(path, { readOnly: true })
  try {
    database.exec('BEGIN')
    assert.equal(database.prepare('PRAGMA user_version').get().user_version, 19)
    snapshots[phase] = ids.map(id => {
      const row = database.prepare('SELECT * FROM tool_operations WHERE id=?').get(id)
      assert.ok(row)
      if (reference) assert.equal(sha(canonical(row)), reference.tables.find(t => t.name === 'tool_operations').rows.find(r => r.id === id).rowSha256)
      const record = JSON.parse(row.record_json)
      const transformed = JSON.parse(database.prepare("SELECT json_remove(json_set(?,'$.summary','内容已被后续治理阻止','$.citations',json('[]')),'$.memoryReceipt','$.retentionIntent','$.retentionPreview') AS value").get(row.record_json).value)
      return { id, record, transformed }
    })
    database.exec('ROLLBACK')
  } finally { database.close() }
}
const differences = (left, right) => [...new Set([...Object.keys(left), ...Object.keys(right)])].filter(key => canonical(left[key]) !== canonical(right[key])).map(key => ({ key, beforePresent: Object.hasOwn(left, key), afterPresent: Object.hasOwn(right, key), beforeHash: Object.hasOwn(left, key) ? sha(canonical(left[key])) : null, afterHash: Object.hasOwn(right, key) ? sha(canonical(right[key])) : null, ...(/^(createdAt|updatedAt|completedAt|startedAt)$/.test(key) ? { beforeTime: left[key] ?? null, afterTime: right[key] ?? null } : {}) }))
const rows = ids.map((id, i) => ({ id,
  beforeToAfter: differences(snapshots.before[i].record, snapshots.after[i].record),
  backupToBefore: differences(snapshots.backup[i].record, snapshots.before[i].record),
  backupToAfter: differences(snapshots.backup[i].record, snapshots.after[i].record),
  beforeSqlEqualsAfter: canonical(snapshots.before[i].transformed) === canonical(snapshots.after[i].record),
  backupSqlEqualsAfter: canonical(snapshots.backup[i].transformed) === canonical(snapshots.after[i].record),
  transformedBackupRemainingDiff: differences(snapshots.backup[i].transformed, snapshots.after[i].record)
}))
const report = { observedAt: new Date().toISOString(), scope: 'readonly phase-row-bound semantic comparison; no plaintext except timestamps; all 17 immutable backup payload hashes checked without credential decryption', priorFailure: 'root b148d6 before-to-SQL-to-after assertion FAILED; preserved', rows }
writeFileSync(join(evidence, 'delivery-014-release-v4-op-semantic-diagnosis.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' })
process.stdout.write(JSON.stringify(report))
const fixedHash = value => sha(JSON.stringify(value))
const fullPass = rows.every(row => row.beforeToAfter.length === 1 && row.beforeToAfter[0].key === 'summary' && row.beforeToAfter[0].beforeHash === fixedHash('操作内容已清理') && row.beforeToAfter[0].afterHash === fixedHash('操作正文已被后续治理清理') && row.transformedBackupRemainingDiff.length === 1 && row.transformedBackupRemainingDiff[0].key === 'summary' && row.transformedBackupRemainingDiff[0].beforeHash === fixedHash('内容已被后续治理阻止') && row.transformedBackupRemainingDiff[0].afterHash === fixedHash('操作正文已被后续治理清理'))
assert.equal(fullPass, true, 'FULL_REDACTION_SEMANTICS_MISMATCH')
writeFileSync(join(evidence, 'delivery-014-release-v4-op-semantic-diagnosis-02.json'), JSON.stringify({ observedAt: new Date().toISOString(), priorDiagnosisSha256: sha(readFileSync(join(evidence, 'delivery-014-release-v4-op-semantic-diagnosis.json'))), originalSingleSqlEquality: false, timeFieldsChanged: false, beforeSummaryMatchesRetentionCleanupConstant: true, afterSummaryMatchesFinalGovernanceRedactionConstant: true, bothBackupSqlResultsWithFinalRedactionSummaryEqualAfter: fullPass, scope: 'The complete record comparison differs only in summary; fixed final scrubReceipt summary closes that difference. No ignored fields, no plaintext payload emitted.' }, null, 2) + '\n', { flag: 'wx' })
