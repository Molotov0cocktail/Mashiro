import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { lstatSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { DatabaseSync } from 'node:sqlite'

const phase = process.argv[2]
assert.ok(['before', 'after'].includes(phase), 'PHASE_INVALID')
const scene = resolve('C:/Users/30910/AppData/Local/Temp/mashiro-install-full-Zbzmgp')
const source = phase === 'before'
  ? join(scene, '安装-data-later-mutations-B')
  : join(scene, '安装 旧版本', 'data')
const evidence = resolve('.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT')
const referencePath = join(evidence, `delivery-014-release-v4-governance-${phase === 'before' ? 'later-before-restore' : 'after-old-backup-restore'}.json`)
const reference = JSON.parse(readFileSync(referencePath, 'utf8'))
const sha = (value) => createHash('sha256').update(value).digest('hex').toUpperCase()
const canonical = (value) => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Buffer.isBuffer(value)) return JSON.stringify({ bufferSha256: sha(value) })
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
}
for (const path of [source, join(source, 'mashiro.sqlite'), join(source, '.mashiro-dataset.json')]) {
  assert.equal(lstatSync(path).isSymbolicLink(), false, 'REPARSE_POINT')
  assert.equal(realpathSync.native(path), path, 'REALPATH_MISMATCH')
}
const dataset = JSON.parse(readFileSync(join(source, '.mashiro-dataset.json'), 'utf8'))
assert.equal(dataset.dataSetId, '9f2cf384-daa4-4bb6-819a-33976e479c5a', 'DATASET_ID')
const database = new DatabaseSync(join(source, 'mashiro.sqlite'), { readOnly: true })
const tables = []
try {
  database.exec('BEGIN')
  assert.equal(database.prepare('PRAGMA user_version').get().user_version, 19)
  for (const name of ['tool_operations', 'protocol_segments', 'usage_attempts']) {
    const rows = database.prepare(`SELECT * FROM ${name}`).all()
    const digest = sha(rows.map(canonical).sort().join('\n'))
    const expected = reference.tableDigests.find((entry) => entry.name === name)
    assert.equal(rows.length, expected.rowCount, `${name}_COUNT_DRIFT`)
    assert.equal(digest, expected.rowsSha256, `${name}_CONTENT_DRIFT`)
    tables.push({ name, rowCount: rows.length, rowsSha256: digest, rows: rows.map((row) => {
      const record = typeof row.record_json === 'string' ? JSON.parse(row.record_json) : {}
      return {
        id: row.id,
        requestId: row.request_id ?? record.requestId ?? null,
        segmentId: row.segment_id ?? record.segmentId ?? null,
        state: row.status ?? record.state ?? null,
        rowSha256: sha(canonical(row)),
        fieldHashes: Object.fromEntries(Object.entries(row).map(([key, value]) => [key, sha(canonical(value))]))
      }
    }).sort((left, right) => String(left.id).localeCompare(String(right.id))) })
  }
  database.exec('ROLLBACK')
} finally {
  database.close()
}
const output = join(evidence, `delivery-014-release-v4-op-rows-${phase}.json`)
writeFileSync(output, `${JSON.stringify({
  observedAt: new Date().toISOString(), phase, source, dataSetId: dataset.dataSetId,
  scope: 'read-only sanitized row and field digests; all three tables must match the frozen phase report',
  referenceSha256: sha(readFileSync(referencePath)), credentialFilesRead: false,
  plaintextIncluded: false, tables
}, null, 2)}\n`, { flag: 'wx' })
process.stdout.write(JSON.stringify({ output, tables: tables.map(({ name, rowCount, rowsSha256 }) => ({ name, rowCount, rowsSha256 })) }))
