import { createHash } from 'node:crypto'
import console from 'node:console'
import { lstatSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import process from 'node:process'

const phase = process.argv[2]
if (!['pre', 'post'].includes(phase)) throw new Error('PHASE_REQUIRED')

const dataRoot = resolve(
  'C:/Users/30910/AppData/Local/Temp/mashiro-install-full-Zbzmgp/全域 合成数据'
)
const evidenceDirectory = resolve(
  '.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT'
)
const expectedDataSetId = '9f2cf384-daa4-4bb6-819a-33976e479c5a'
const hash = (path) =>
  createHash('sha256').update(readFileSync(path)).digest('hex').toUpperCase()

const files = []
const visit = (directory) => {
  for (const name of readdirSync(directory).sort()) {
    const path = join(directory, name)
    const stat = lstatSync(path)
    if (stat.isSymbolicLink()) throw new Error('REPARSE_POINT')
    if (stat.isDirectory()) visit(path)
    else if (stat.isFile()) {
      files.push({
        path: relative(dataRoot, path).replaceAll('\\', '/'),
        bytes: stat.size,
        sha256: hash(path)
      })
    } else throw new Error('UNEXPECTED_ENTRY')
  }
}
visit(dataRoot)

const marker = JSON.parse(readFileSync(join(dataRoot, '.mashiro-dataset.json'), 'utf8'))
if (marker.dataSetId !== expectedDataSetId) throw new Error('DATA_SET_ID_MISMATCH')

const database = new DatabaseSync(join(dataRoot, 'mashiro.sqlite'), {
  readOnly: true
})
let schemaVersion
let integrity
let foreignKeyErrors
let tableCounts
try {
  schemaVersion = Number(database.prepare('PRAGMA user_version').get().user_version)
  integrity = database
    .prepare('PRAGMA integrity_check')
    .all()
    .map((row) => row.integrity_check)
  foreignKeyErrors = database.prepare('PRAGMA foreign_key_check').all().length
  const tableNames = database
    .prepare(
      "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    )
    .all()
    .map((row) => row.name)
  tableCounts = Object.fromEntries(
    tableNames.map((name) => [
      name,
      Number(
        database
          .prepare('SELECT COUNT(*) AS count FROM "' + name.replaceAll('"', '""') + '"')
          .get().count
      )
    ])
  )
} finally {
  database.close()
}

const report = {
  scope: `isolated synthetic data before/after installed uninstall: ${phase}`,
  observedAt: new Date().toISOString(),
  phase,
  dataRoot,
  dataSetId: marker.dataSetId,
  schemaVersion,
  files,
  integrity,
  foreignKeyErrors,
  tableCounts,
  reparsePoints: 0,
  credentialContentRead: false,
  personalDataAccessed: false
}
const output = join(evidenceDirectory, `delivery-014-uninstall-data-${phase}.json`)
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
console.log(
  JSON.stringify({
    output,
    files: files.length,
    schemaVersion: report.schemaVersion,
    integrity,
    foreignKeyErrors,
    sha256: hash(output)
  })
)
