import { createHash } from 'node:crypto'
import { lstatSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const scene = resolve(
  'C:/Users/30910/AppData/Local/Temp/mashiro-install-full-Zbzmgp'
)
const source = join(scene, '全域 合成数据')
const databasePath = join(source, 'mashiro.sqlite')
const output = resolve(
  '.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/delivery-014-upgrade-source-snapshot-01.json'
)

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
      length: stat.size,
      sha256: createHash('sha256').update(readFileSync(path)).digest('hex').toUpperCase()
    })
  }
}
visit(source)

const dataset = JSON.parse(readFileSync(join(source, '.mashiro-dataset.json'), 'utf8'))
const database = new DatabaseSync(databasePath, { readOnly: true })
const integrity = database.prepare('PRAGMA integrity_check').all()
const schemaVersion = Number(database.prepare('PRAGMA user_version').get().user_version)
const tables = database
  .prepare(
    "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  )
  .all()
  .map((row) => row.name)
const counts = Object.fromEntries(
  tables.map((name) => [
    name,
    Number(
      database
        .prepare('SELECT COUNT(*) AS count FROM "' + name.replaceAll('"', '""') + '"')
        .get().count
    )
  ])
)
const assistants = database
  .prepare(
    `SELECT a.id,a.version,a.archived_at IS NOT NULL AS archived,
      EXISTS(SELECT 1 FROM assistant_tombstones t WHERE t.id=a.id) AS tombstoned
      FROM assistants a ORDER BY a.id`
  )
  .all()
  .map((row) => ({
    id: row.id,
    version: Number(row.version),
    archived: Boolean(row.archived),
    tombstoned: Boolean(row.tombstoned)
  }))
const assistantState = database.prepare('SELECT * FROM assistant_state WHERE singleton=1').get()
const proposals = database
  .prepare('SELECT id,version,state,origin_assistant_id AS assistantId FROM item_proposals ORDER BY id')
  .all()
  .map((row) => ({ ...row, version: Number(row.version) }))
const reminders = database
  .prepare('SELECT id,version,state,due_at AS dueAt FROM reminders ORDER BY id')
  .all()
  .map((row) => ({ ...row, version: Number(row.version) }))
database.close()

const report = {
  scope: 'offline snapshot of exited schema-15 synthetic full-domain data before upgrade',
  observedAt: new Date().toISOString(),
  source,
  dataSetId: dataset.dataSetId,
  schemaVersion,
  integrity: integrity.map((row) => row.integrity_check),
  files,
  counts,
  assistants,
  assistantState: {
    primaryAssistantId: assistantState.primary_assistant_id,
    currentAssistantId: assistantState.current_assistant_id,
    revision: Number(assistantState.revision)
  },
  proposals,
  reminders,
  sourceReparsePoints: 0,
  installedMashiroProcesses: 0,
  externalCalls: 0,
  personalDataAccessed: false
}
writeFileSync(output, JSON.stringify(report, null, 2) + '\n')
console.log(
  JSON.stringify({
    output,
    dataSetId: report.dataSetId,
    schemaVersion,
    integrity: report.integrity,
    fileCount: files.length,
    tableCount: tables.length
  })
)
