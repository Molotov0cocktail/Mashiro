import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import {
  lstatSync,
  readFileSync,
  realpathSync,
  rmSync
} from 'node:fs'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import process from 'node:process'
import { DatabaseSync } from 'node:sqlite'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const scene = realpathSync.native(
  'C:/Users/30910/AppData/Local/Temp/mashiro-install-full-Zbzmgp'
)
const dataPath = join(scene, '全域 合成数据')
const databasePath = join(dataPath, 'mashiro.sqlite')
const expectedDataSetId = '9f2cf384-daa4-4bb6-819a-33976e479c5a'
const expectedRun = '813ded0c-1e7f-4b44-8442-fdcd19ffe20d'
const assistantId = '61c7cbec-1175-4a3e-9ccb-6212fb92c5db'
const oldRequestId = '5e34c10f-c747-4be2-8e7b-e8e8c59871b7'
const oldOperationId = '65f43282-9144-4d5c-b5fb-8577e5336f56'
const appendCount = 384
const expectedInitialOperations = 2
const requestPrefix = '01800000-0000-4000-8001-'

const argument = (name) => {
  const prefix = `--${name}=`
  const value = process.argv.slice(2).find((entry) => entry.startsWith(prefix))?.slice(prefix.length)
  if (!value) throw new Error(`ARGUMENT_REQUIRED_${name.toUpperCase()}`)
  return value
}
const revision = argument('revision')
const expectedSchema = Number(argument('schema'))
const execute = process.argv.includes('--execute')
if (!/^[0-9a-f]{40}$/.test(revision)) throw new Error('INVALID_SOURCE_REVISION')
if (!Number.isSafeInteger(expectedSchema) || expectedSchema < 19)
  throw new Error('INVALID_EXPECTED_SCHEMA')

const marker = JSON.parse(readFileSync(join(scene, '.mashiro-delivery-synthetic.json'), 'utf8'))
const manifest = JSON.parse(readFileSync(join(dataPath, '.mashiro-dataset.json'), 'utf8'))
if (
  marker.expectedRun !== expectedRun ||
  manifest.dataSetId !== expectedDataSetId ||
  manifest.state !== 'READY'
)
  throw new Error('SYNTHETIC_IDENTITY_MISMATCH')

const git = 'D:/Git/Git/cmd/git.exe'
const root = realpathSync.native(resolve('.'))
const resolvedRevision = execFileSync(
  git,
  ['-c', 'safe.directory=D:/Mashiro', 'rev-parse', `${revision}^{commit}`],
  { encoding: 'utf8', windowsHide: true }
).trim()
if (resolvedRevision !== revision) throw new Error('SOURCE_REVISION_MISMATCH')

const tasklist = () =>
  execFileSync('tasklist.exe', ['/FI', 'IMAGENAME eq Mashiro.exe', '/FO', 'CSV', '/NH'], {
    encoding: 'utf8',
    windowsHide: true
  })
const assertMashiroStopped = () => {
  if (/^"Mashiro\.exe"/im.test(tasklist())) throw new Error('MASHIRO_PROCESS_RUNNING')
}
assertMashiroStopped()

if (!execute) {
  process.stdout.write(
    `${JSON.stringify(
      {
        state: 'PREPARED_ONLY',
        revision,
        expectedSchema,
        dataSetId: expectedDataSetId,
        assistantId,
        oldRequestId,
        oldOperationId,
        appendCount,
        providerCalls: 0
      },
      null,
      2
    )}\n`
  )
  process.exit(0)
}

const bundlePath = join(scene, `delivery-014-receipt-window-${randomUUID()}.mjs`)
const loaded = []
const removeBundle = () => {
  const resolved = resolve(bundlePath)
  if (
    dirname(resolved) !== scene ||
    !basename(resolved).startsWith('delivery-014-receipt-window-') ||
    !basename(resolved).endsWith('.mjs') ||
    lstatSync(resolved).isSymbolicLink()
  )
    throw new Error('UNSAFE_BUNDLE_CLEANUP')
  rmSync(resolved)
}

await build({
  stdin: {
    contents:
      "export { SqliteStore } from './src/main/data/sqlite.ts'; export { ToolRepository } from './src/main/provider/tool-repository.ts'; export { acquireProductionLease } from './src/main/data/production-lease.ts';",
    resolveDir: root,
    loader: 'ts'
  },
  outfile: bundlePath,
  bundle: true,
  platform: 'node',
  format: 'esm',
  logLevel: 'silent',
  plugins: [
    {
      name: 'exact-reviewed-source',
      setup(builder) {
        builder.onLoad({ filter: /\.[cm]?[jt]sx?$/ }, (args) => {
          const path = relative(root, args.path)
          if (!path.startsWith(`src${sep}`)) return undefined
          const gitPath = path.split(sep).join('/')
          const contents = execFileSync(
            git,
            ['-c', 'safe.directory=D:/Mashiro', 'show', `${revision}:${gitPath}`],
            { encoding: 'utf8', windowsHide: true }
          )
          loaded.push(gitPath)
          return {
            contents,
            loader: args.path.endsWith('.tsx') ? 'tsx' : 'ts',
            resolveDir: dirname(args.path)
          }
        })
      }
    }
  ]
})

let lease
let store
let leaseLost
try {
  assertMashiroStopped()
  const source = await import(pathToFileURL(bundlePath).href)
  lease = await source.acquireProductionLease(dataPath, (error) => {
    leaseLost = error
  })
  const databaseStat = lstatSync(databasePath)
  if (
    !databaseStat.isFile() ||
    databaseStat.isSymbolicLink() ||
    realpathSync.native(databasePath) !== resolve(databasePath)
  )
    throw new Error('DATABASE_FILE_IDENTITY_MISMATCH')
  const versionProbe = new DatabaseSync(databasePath, { readOnly: true })
  try {
    if (Number(versionProbe.prepare('PRAGMA user_version').get().user_version) !== expectedSchema)
      throw new Error('INSTALLER_SCHEMA_MIGRATION_NOT_OBSERVED')
  } finally {
    versionProbe.close()
  }
  assertMashiroStopped()
  store = new source.SqliteStore(databasePath)
  const database = store.database
  const schemaVersion = Number(database.prepare('PRAGMA user_version').get().user_version)
  if (schemaVersion !== expectedSchema) throw new Error('SCHEMA_VERSION_MISMATCH')
  if (database.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok')
    throw new Error('DATABASE_INTEGRITY_FAILED')
  if (database.prepare('PRAGMA foreign_key_check').all().length !== 0)
    throw new Error('DATABASE_FOREIGN_KEY_FAILED')
  const assistant = database
    .prepare(
      'SELECT id FROM assistants WHERE id=? AND archived_at IS NULL AND id NOT IN(SELECT id FROM assistant_tombstones)'
    )
    .get(assistantId)
  if (!assistant) throw new Error('ACTIVE_ASSISTANT_MISMATCH')

  const tableCounts = () =>
    Object.fromEntries(
      database
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
        )
        .all()
        .map(({ name }) => [
          String(name),
          Number(database.prepare(`SELECT count(*) AS count FROM ${name}`).get().count)
        ])
    )
  const usageDigest = () => {
    const rows = ['usage_attempts', 'background_attempts', 'steward_attempts'].map((table) => ({
      table,
      rows: database.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()
    }))
    return createHash('sha256').update(JSON.stringify(rows)).digest('hex')
  }
  const beforeCounts = tableCounts()
  const beforeUsage = usageDigest()
  if (beforeCounts.tool_operations !== expectedInitialOperations)
    throw new Error('INITIAL_TOOL_OPERATION_COUNT_MISMATCH')
  if (
    database
      .prepare('SELECT count(*) AS count FROM protocol_segments WHERE request_id GLOB ?')
      .get(`${requestPrefix}*`).count !== 0
  )
    throw new Error('WINDOW_SEED_ALREADY_PRESENT')

  const repository = new source.ToolRepository(store)
  const oldBefore = repository.read(assistantId, oldRequestId)
  if (
    oldBefore.length !== 1 ||
    oldBefore[0].operationId !== oldOperationId ||
    oldBefore[0].state !== 'SUCCEEDED'
  )
    throw new Error('OLD_REAL_OPERATION_MISMATCH')

  const createdOperationIds = []
  store.transaction(() => {
    const createdAt = new Date().toISOString()
    for (let index = 1; index <= appendCount; index += 1) {
      const suffix = index.toString().padStart(12, '0')
      const segment = {
        id: `01800000-0000-4000-8002-${suffix}`,
        assistantId,
        requestId: `${requestPrefix}${suffix}`,
        endpointFingerprint: 'delivery-014-local-synthetic',
        model: 'delivery-014-local-synthetic',
        adapterVersion: 'delivery-014-local-synthetic-v1',
        mode: 'standard-non-preserved',
        messages: [],
        createdAt
      }
      repository.create(segment)
      const prepared = repository.prepare(
        segment,
        `01800000-0000-4000-8003-${suffix}`,
        {
          id: `01800000-0000-4000-8004-${suffix}`,
          type: 'function',
          function: { name: 'get_current_time', arguments: '{}' }
        },
        'local-user-intent'
      )
      const dispatching = {
        ...prepared,
        state: 'DISPATCHING',
        updatedAt: createdAt,
        summary: '本地合成时钟回执已开始'
      }
      repository.update(dispatching)
      const succeeded = {
        ...dispatching,
        state: 'SUCCEEDED',
        summary: '本地合成时钟回执已完成'
      }
      repository.update(
        succeeded,
        JSON.stringify({ currentTime: createdAt, timeZone: 'UTC', synthetic: true })
      )
      repository.messages(segment.id, [], true)
      createdOperationIds.push(succeeded.operationId)
    }
    if (leaseLost) throw leaseLost
    assertMashiroStopped()

    const afterCounts = tableCounts()
    for (const [table, count] of Object.entries(beforeCounts)) {
      const expected =
        count +
        (table === 'protocol_segments' ||
        table === 'tool_operations' ||
        table === 'protocol_results'
          ? appendCount
          : 0)
      if (afterCounts[table] !== expected) throw new Error(`UNEXPECTED_TABLE_CHANGE_${table}`)
    }
    if (usageDigest() !== beforeUsage) throw new Error('PROVIDER_USAGE_CHANGED')
    const oldAfter = repository.read(assistantId, oldRequestId)
    if (
      oldAfter.length !== 1 ||
      oldAfter[0].operationId !== oldOperationId ||
      oldAfter[0].state !== 'SUCCEEDED'
    )
      throw new Error('OLD_REAL_OPERATION_CHANGED')
    const recent = repository.read(assistantId)
    if (recent.length !== 384 || recent.some((entry) => entry.operationId === oldOperationId))
      throw new Error('DEFAULT_RECEIPT_WINDOW_MISMATCH')
    if (database.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok')
      throw new Error('POST_DATABASE_INTEGRITY_FAILED')
    if (database.prepare('PRAGMA foreign_key_check').all().length !== 0)
      throw new Error('POST_DATABASE_FOREIGN_KEY_FAILED')
  })
  process.stdout.write(
    `${JSON.stringify(
      {
        state: 'SUCCEEDED',
        revision,
        sourceFiles: [...new Set(loaded)].sort(),
        dataSetId: expectedDataSetId,
        schemaVersion,
        assistantId,
        oldRequestId,
        oldOperationId,
        created: appendCount,
        firstCreatedOperationId: createdOperationIds[0],
        lastCreatedOperationId: createdOperationIds.at(-1),
        finalToolOperations: expectedInitialOperations + appendCount,
        providerUsageDigest: beforeUsage,
        providerCalls: 0
      },
      null,
      2
    )}\n`
  )
} finally {
  store?.close()
  await lease?.release()
  removeBundle()
}
