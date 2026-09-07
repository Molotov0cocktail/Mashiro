import { build } from 'esbuild'
import process from 'node:process'
import { DatabaseSync } from 'node:sqlite'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'

// Explicit synthetic-only converter. Originals are retained and no existing target is replaced.
const [requested, expectedRun] = process.argv.slice(2)
if (!requested || !expectedRun || process.argv.length !== 4) throw Error('SOURCE_AND_RUN_REQUIRED')
const temporary = realpathSync.native(tmpdir())
const source = realpathSync.native(requested)
if (dirname(source) !== temporary || !basename(source).startsWith('mashiro-f1-e2e-')) throw Error('UNOWNED_SOURCE')
const marker = JSON.parse(readFileSync(join(source, '.mashiro-f1-e2e.json'), 'utf8'))
if (marker.protocolVersion !== 1 || marker.runId !== expectedRun) throw Error('SOURCE_IDENTITY_MISMATCH')
for (const phase of ['seed', 'verify']) {
  const result = JSON.parse(readFileSync(join(source, 'results', phase + '.json'), 'utf8'))
  if (result.runId !== expectedRun || result.phase !== phase || result.failure) throw Error('SOURCE_NOT_VERIFIED')
}
const data = join(source, 'data')
const snapshot = new DatabaseSync(join(data, 'mashiro.sqlite'), { readOnly: true })
const tables = ['assistants', 'timeline_messages', 'memory_objects', 'items', 'item_proposals', 'reminders', 'daily_jobs', 'daily_reports', 'content_tombstones']
let before
try {
  if (snapshot.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok' || snapshot.prepare('PRAGMA foreign_key_check').all().length) throw Error('SOURCE_DATABASE_INVALID')
  if (snapshot.prepare('PRAGMA user_version').get().user_version !== 15) throw Error('SCHEMA15_REQUIRED')
  before = Object.fromEntries(tables.map(table => [table, snapshot.prepare('SELECT count(*) AS n FROM ' + table).get().n]))
} finally { snapshot.close() }
const scene = mkdtempSync(join(temporary, 'mashiro-install-full-'))
writeFileSync(join(scene, '.mashiro-delivery-synthetic.json'), JSON.stringify({ source, expectedRun, schemaVersion: 15 }), { flag: 'wx' })
const target = join(scene, '全域 合成数据')
mkdirSync(target)
const bundle = join(scene, 'initialize.mjs')
await build({ entryPoints: [resolve('src/main/data/production-initialize.ts')], outfile: bundle, bundle: true, platform: 'node', format: 'esm', packages: 'bundle', logLevel: 'silent' })
const { initializeProductionDataSet } = await import(pathToFileURL(bundle).href)
const copies = []
const copyTree = (from, to, prefix) => {
  for (const name of readdirSync(from)) {
    const sourceFile = join(from, name), destination = join(to, name), entry = lstatSync(sourceFile)
    if (entry.isSymbolicLink() || (!entry.isFile() && !entry.isDirectory())) throw Error('UNSAFE_SYNTHETIC_FILE')
    if (entry.isDirectory()) { mkdirSync(destination); copyTree(sourceFile, destination, prefix + name + '/'); continue }
    copyFileSync(sourceFile, destination)
    const digest = bytes => createHash('sha256').update(bytes).digest('hex')
    const expected = digest(readFileSync(sourceFile))
    if (digest(readFileSync(destination)) !== expected) throw Error('COPY_MISMATCH')
    copies.push({ path: prefix + name, bytes: entry.size, sha256: expected })
  }
}
const initialized = await initializeProductionDataSet(target, databasePath => {
  copyFileSync(join(data, 'mashiro.sqlite'), databasePath)
  for (const suffix of ['-wal', '-shm']) if (existsSync(join(data, 'mashiro.sqlite' + suffix)) && lstatSync(join(data, 'mashiro.sqlite' + suffix)).size) throw Error('SOURCE_NOT_QUIESCENT')
  for (const folder of ['memory', 'credentials']) if (existsSync(join(data, folder))) { mkdirSync(join(target, folder)); copyTree(join(data, folder), join(target, folder), folder + '/') }
  const db = new DatabaseSync(databasePath, { readOnly: true })
  try {
    const after = Object.fromEntries(tables.map(table => [table, db.prepare('SELECT count(*) AS n FROM ' + table).get().n]))
    if (JSON.stringify(after) !== JSON.stringify(before) || db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok' || db.prepare('PRAGMA foreign_key_check').all().length) throw Error('TARGET_DATABASE_MISMATCH')
  } finally { db.close() }
}, () => { throw Error('SYNTHETIC_LEASE_LOST') })
await initialized.lease.release()
const report = { scope: 'schema15 full-domain synthetic installation seed only; not installation acceptance', scene, target, source, expectedRun, dataSetId: initialized.manifest.dataSetId, schemaVersion: 15, counts: before, copiedFiles: copies }
writeFileSync(join(scene, 'seed-receipt.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' })
process.stdout.write(JSON.stringify(report, null, 2) + '\n')
