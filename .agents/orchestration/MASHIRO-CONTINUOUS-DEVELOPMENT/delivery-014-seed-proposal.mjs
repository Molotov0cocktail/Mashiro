import process from 'node:process'
import { build } from 'esbuild'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, realpathSync } from 'node:fs'
import { resolve, relative, dirname, join, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'

const root = realpathSync.native(resolve('.'))
const revision = '8154d0e09fc95014b8d205f8ed70c0028557208e'
const scene = 'C:/Users/30910/AppData/Local/Temp/mashiro-install-full-Zbzmgp'
const data = join(scene, '全域 合成数据')
const marker = JSON.parse(readFileSync(join(scene, '.mashiro-delivery-synthetic.json'), 'utf8'))
const manifest = JSON.parse(readFileSync(join(data, '.mashiro-dataset.json'), 'utf8'))
if (marker.expectedRun !== '813ded0c-1e7f-4b44-8442-fdcd19ffe20d' || marker.schemaVersion !== 15 || manifest.dataSetId !== '9f2cf384-daa4-4bb6-819a-33976e479c5a' || manifest.state !== 'READY') throw Error('SYNTHETIC_IDENTITY_MISMATCH')
const bundle = join(scene, 'proposal-schema15.mjs')
const loaded = []
await build({ stdin: { contents: "export { SqliteStore } from './src/main/data/sqlite.ts'; export { ItemService } from './src/main/item/item-service.ts'; export { acquireProductionLease } from './src/main/data/production-lease.ts';", resolveDir: root, loader: 'ts' }, outfile: bundle, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent', plugins: [{ name: 'exact-reviewed-source', setup(builder) {
  builder.onLoad({ filter: /\.[cm]?[jt]sx?$/ }, args => {
    const path = relative(root, args.path)
    if (!path.startsWith('src' + sep)) return
    const gitPath = path.split(sep).join('/')
    const contents = execFileSync('D:/Git/Git/cmd/git.exe', ['-c', 'safe.directory=D:/Mashiro', 'show', revision + ':' + gitPath], { encoding: 'utf8', windowsHide: true })
    loaded.push(gitPath)
    return { contents, loader: args.path.endsWith('.tsx') ? 'tsx' : 'ts', resolveDir: dirname(args.path) }
  })
} }] })
const { SqliteStore, ItemService, acquireProductionLease } = await import(pathToFileURL(bundle).href)
const lease = await acquireProductionLease(data, () => { throw Error('LEASE_LOST') })
let store
try {
  const check = new DatabaseSync(join(data, 'mashiro.sqlite'), { readOnly: true })
  try { if (check.prepare('PRAGMA user_version').get().user_version !== 15) throw Error('OLD_SCHEMA_REQUIRED') } finally { check.close() }
  store = new SqliteStore(join(data, 'mashiro.sqlite'))
  const db = store.database
  const tables = ['assistants', 'timeline_messages', 'memory_objects', 'items', 'item_proposals', 'reminders', 'daily_jobs', 'daily_reports', 'content_tombstones']
  const counts = () => Object.fromEntries(tables.map(t => [t, db.prepare('SELECT count(*) AS n FROM ' + t).get().n]))
  const before = counts()
  if (before.item_proposals !== 0) throw Error('PROPOSAL_ALREADY_PRESENT')
  const assistant = db.prepare('SELECT id FROM assistants WHERE archived_at IS NULL AND id NOT IN(SELECT id FROM assistant_tombstones) ORDER BY created_at LIMIT 1').get()
  if (!assistant) throw Error('ACTIVE_ASSISTANT_REQUIRED')
  const service = new ItemService(store, () => ({ fingerprint: null, display: null }), () => { throw Error('UNEXPECTED_SOURCE_ACCESS') })
  const receipt = service.proposeLocal(assistant.id, randomUUID(), { kind: 'task', title: '安装升级合成待确认提案', description: '', status: 'open', dueAt: null, timeZone: null, parentId: null, relatedIds: [], counterpart: '' }, [])
  const after = counts()
  for (const table of tables) if (after[table] !== before[table] + (table === 'item_proposals' ? 1 : 0)) throw Error('UNEXPECTED_DOMAIN_CHANGE')
  if (db.prepare('PRAGMA user_version').get().user_version !== 15 || db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok' || db.prepare('PRAGMA foreign_key_check').all().length || db.prepare("SELECT count(*) AS n FROM item_proposals WHERE state='DRAFT_PROPOSAL'").get().n !== 1) throw Error('POSTCONDITION_FAILED')
  const report = { sourceCommit: revision, dataSetId: manifest.dataSetId, schemaVersion: 15, sourceFiles: loaded.sort(), assistantId: assistant.id, receipt, before, after, scope: 'Synthetic trusted local proposal setup only; no Provider or installation acceptance' }
  writeFileSync(join(scene, 'proposal-seed-receipt.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' })
  process.stdout.write(JSON.stringify(report, null, 2) + '\n')
} finally { store?.close(); await lease.release() }
