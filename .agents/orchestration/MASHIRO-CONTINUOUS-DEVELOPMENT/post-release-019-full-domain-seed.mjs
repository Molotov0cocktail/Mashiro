import { build } from 'esbuild'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import {
  constants,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  writeFileSync,
  closeSync,
  fsyncSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import process from 'node:process'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'

const evidenceRoot = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(evidenceRoot, '..', '..', '..')
const bindingPath = join(evidenceRoot, 'post-release-019-native-artifact-binding.json')
const initializedReceiptPath = join(
  evidenceRoot,
  'post-release-019-isolated-profile-initialized-01.json'
)
const contextHelperPath = join(evidenceRoot, 'post-release-019-full-domain-seed-context.ps1')
const successPath = join(evidenceRoot, 'post-release-019-full-domain-seed-01.json')
const failurePath = join(evidenceRoot, 'post-release-019-full-domain-seed-failed-01.json')
const expectedSchemaVersion = 19
const targetName = 'data-set-a-full-domain-019'
let stage = 'ARGUMENTS'
let targetCreated = false

function parseArguments(values) {
  const result = { execute: false }
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (value === '--execute') {
      if (result.execute) throw new Error('DUPLICATE_EXECUTE')
      result.execute = true
      continue
    }
    if (
      ![
        '--source',
        '--run-id',
        '--harness-sha256',
        '--initialized-receipt-sha256',
        '--context-helper-sha256'
      ].includes(value)
    )
      throw new Error('UNSUPPORTED_ARGUMENT')
    if (result[value]) throw new Error('DUPLICATE_ARGUMENT')
    const next = values[index + 1]
    if (!next || next.startsWith('--')) throw new Error('ARGUMENT_VALUE_REQUIRED')
    result[value] = next
    index += 1
  }
  return result
}

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex').toUpperCase()
}

function writeCreateNewJson(path, value) {
  const descriptor = openSync(path, 'wx', 0o600)
  try {
    writeFileSync(descriptor, JSON.stringify(value, null, 2) + '\n')
    fsyncSync(descriptor)
  } finally {
    closeSync(descriptor)
  }
}

function readJson(path) {
  const entry = lstatSync(path)
  if (!entry.isFile() || entry.isSymbolicLink()) throw new Error('JSON_PATH_UNSAFE')
  return JSON.parse(readFileSync(path, 'utf8'))
}

function assertRealDirectory(path, code) {
  const entry = lstatSync(path)
  if (!entry.isDirectory() || entry.isSymbolicLink()) throw new Error(code)
  if (realpathSync.native(path) !== resolve(path)) throw new Error(code)
}

function isInside(parent, candidate) {
  const segment = relative(parent, candidate)
  return segment !== '' && !segment.startsWith('..') && !isAbsolute(segment)
}

function expandWindowsPath(value) {
  return value.replace(/%([^%]+)%/gu, (_, name) => {
    const match = Object.entries(process.env).find(([key]) => key.toLowerCase() === name.toLowerCase())
    if (!match?.[1]) throw new Error('BINDING_ENVIRONMENT_MISSING')
    return match[1]
  })
}

function assertNoExactProcess(imageName) {
  const output = execFileSync(
    join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tasklist.exe'),
    ['/FI', 'IMAGENAME eq ' + imageName, '/FO', 'CSV', '/NH'],
    { encoding: 'utf8', windowsHide: true }
  )
  if (output.toLowerCase().includes(('"' + imageName + '"').toLowerCase()))
    throw new Error('MASHIRO_PROCESS_RUNNING')
}

function assertNoMashiroProcesses() {
  for (const name of [
    'Mashiro.exe',
    'Mashiro-0.1.1-win-x64-setup.exe',
    'Uninstall Mashiro.exe'
  ])
    assertNoExactProcess(name)
}

function assertTreeSafe(root) {
  assertRealDirectory(root, 'TREE_ROOT_UNSAFE')
  const queue = [root]
  while (queue.length) {
    const directory = queue.shift()
    for (const name of readdirSync(directory)) {
      const path = join(directory, name)
      const entry = lstatSync(path)
      if (entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile()))
        throw new Error('TREE_ENTRY_UNSAFE')
      if (entry.isDirectory()) queue.push(path)
    }
  }
}

function copyKnownTree(source, target, prefix, copies) {
  mkdirSync(target, { recursive: false })
  for (const name of readdirSync(source)) {
    const sourcePath = join(source, name)
    const targetPath = join(target, name)
    const entry = lstatSync(sourcePath)
    if (entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile()))
      throw new Error('SOURCE_TREE_ENTRY_UNSAFE')
    if (entry.isDirectory()) {
      copyKnownTree(sourcePath, targetPath, prefix + name + '/', copies)
      continue
    }
    copyFileSync(sourcePath, targetPath, constants.COPYFILE_EXCL)
    const sourceHash = sha256File(sourcePath)
    if (sha256File(targetPath) !== sourceHash) throw new Error('COPIED_FILE_HASH_MISMATCH')
    copies.push({ path: prefix + name, bytes: entry.size, sha256: sourceHash })
  }
}

function countRows(database, table) {
  const present = database
    .prepare("SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name=?")
    .get(table)
  if (!present) throw new Error('SOURCE_TABLE_MISSING')
  return Number(database.prepare('SELECT count(*) AS count FROM "' + table + '"').get().count)
}

function sqlName(value) {
  if (!/^[a-z_]+$/u.test(value)) throw new Error('SQL_NAME_INVALID')
  return '"' + value + '"'
}

function tableSnapshot(database) {
  const tables = database
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    )
    .all()
    .map((row) => String(row.name))
  return Object.fromEntries(
    tables.map((table) => {
      const rows = database.prepare('SELECT * FROM ' + sqlName(table) + ' ORDER BY rowid').all()
      return [
        table,
        {
          count: rows.length,
          digest: createHash('sha256').update(JSON.stringify(rows)).digest('hex').toUpperCase(),
          rows
        }
      ]
    })
  )
}

function sanitizeTableSnapshot(snapshot) {
  return Object.fromEntries(
    Object.entries(snapshot).map(([table, value]) => [
      table,
      { count: value.count, digest: value.digest }
    ])
  )
}

function mapRows(rows, key) {
  return new Map(rows.map((row) => [String(row[key]), row]))
}

function sameExcept(before, after, allowed) {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  for (const key of keys)
    if (!allowed.has(key) && JSON.stringify(before[key]) !== JSON.stringify(after[key])) return false
  return true
}

function assertJsonPause(beforeText, afterText) {
  const before = JSON.parse(String(beforeText))
  const after = JSON.parse(String(afterText))
  if (!sameExcept(before, after, new Set(['enabled', 'version'])))
    throw new Error('TARGET_PAUSE_JSON_BROAD_CHANGE')
  if (before.enabled !== true || after.enabled !== false || after.version !== before.version + 1)
    throw new Error('TARGET_PAUSE_JSON_INVALID')
  return { priorVersion: before.version, pausedVersion: after.version }
}

function validatePausedTable(beforeRows, afterRows, table, key, changedIds) {
  const before = mapRows(beforeRows, key)
  const after = mapRows(afterRows, key)
  if (before.size !== after.size || [...before.keys()].some((id) => !after.has(id)))
    throw new Error('TARGET_PAUSE_ROW_SET_CHANGED')
  const changes = []
  for (const [id, prior] of before) {
    const next = after.get(id)
    if (!changedIds.has(id)) {
      if (JSON.stringify(prior) !== JSON.stringify(next))
        throw new Error('TARGET_PAUSE_UNEXPECTED_ROW_CHANGE')
      continue
    }
    if (
      !sameExcept(
        prior,
        next,
        new Set(['record_json', ...(table === 'background_configs' ? ['version'] : [])])
      )
    )
      throw new Error('TARGET_PAUSE_ROW_BROAD_CHANGE')
    const versions = assertJsonPause(prior.record_json, next.record_json)
    if (table === 'background_configs' && Number(next.version) !== Number(prior.version) + 1)
      throw new Error('TARGET_PAUSE_OUTER_VERSION_INVALID')
    changes.push({ table, id, ...versions })
  }
  return changes
}

function pauseTargetDatabase(databasePath, schemas) {
  const database = new DatabaseSync(databasePath)
  try {
    database.exec('PRAGMA foreign_keys=ON')
    const before = tableSnapshot(database)
    const connectionRows = before.provider_connections?.rows ?? []
    const bindingRows = before.assistant_provider_bindings?.rows ?? []
    if (
      connectionRows.length !== 1 ||
      Number(connectionRows[0].enabled) !== 1 ||
      Number(connectionRows[0].has_persistent_credential) !== 1 ||
      bindingRows.length !== 1 ||
      String(bindingRows[0].connection_id) !== String(connectionRows[0].id)
    )
      throw new Error('TARGET_PROVIDER_SENTINEL_INVALID')

    const configured = [
      ['background_configs', 'assistant_id', schemas.backgroundConfigurationSchema],
      ['daily_configs', 'id', schemas.dailyConfigurationSchema],
      ['steward_configs', 'singleton', schemas.stewardConfigurationSchema],
      ['discovery_configs', 'assistant_id', schemas.discoveryConfigurationSchema]
    ]
    const changed = new Map()
    database.exec('BEGIN IMMEDIATE')
    try {
      const connection = connectionRows[0]
      const now = new Date().toISOString()
      const providerWrite = database
        .prepare(
          'UPDATE provider_connections SET enabled=0,updated_at=?,version=version+1 WHERE id=? AND enabled=1 AND version=?'
        )
        .run(now, connection.id, connection.version)
      if (Number(providerWrite.changes) !== 1) throw new Error('TARGET_PROVIDER_PAUSE_WRITE_FAILED')
      changed.set('provider_connections', new Set([String(connection.id)]))

      for (const [table, key, schema] of configured) {
        const ids = new Set()
        for (const row of before[table]?.rows ?? []) {
          const record = schema.parse(JSON.parse(String(row.record_json)))
          if (record.enabled !== true) continue
          record.enabled = false
          record.version += 1
          const statement =
            table === 'background_configs'
              ? database.prepare(
                  'UPDATE background_configs SET version=version+1,record_json=? WHERE assistant_id=? AND version=?'
                )
              : database.prepare(
                  'UPDATE ' + sqlName(table) + ' SET record_json=? WHERE ' + sqlName(key) + '=?'
                )
          const result =
            table === 'background_configs'
              ? statement.run(JSON.stringify(schema.parse(record)), row[key], row.version)
              : statement.run(JSON.stringify(schema.parse(record)), row[key])
          if (Number(result.changes) !== 1) throw new Error('TARGET_PAUSE_WRITE_FAILED')
          ids.add(String(row[key]))
        }
        changed.set(table, ids)
      }
      database.exec('COMMIT')
    } catch (error) {
      try {
        database.exec('ROLLBACK')
      } catch {
        // Preserve the first target-only pause failure.
      }
      throw error
    }

    const after = tableSnapshot(database)
    if (
      database.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok' ||
      database.prepare('PRAGMA foreign_key_check').all().length !== 0
    )
      throw new Error('TARGET_PAUSE_DATABASE_INVALID')
    const allowedTables = new Set([
      'provider_connections',
      'background_configs',
      'daily_configs',
      'steward_configs',
      'discovery_configs',
      'retention_state'
    ])
    for (const [table, prior] of Object.entries(before)) {
      const next = after[table]
      if (!next || prior.count !== next.count) throw new Error('TARGET_PAUSE_TABLE_SET_CHANGED')
      if (!allowedTables.has(table) && prior.digest !== next.digest)
        throw new Error('TARGET_PAUSE_UNRELATED_TABLE_CHANGED')
    }

    const changes = []
    const priorConnection = connectionRows[0]
    const nextConnection = after.provider_connections.rows[0]
    if (
      !sameExcept(priorConnection, nextConnection, new Set(['enabled', 'updated_at', 'version'])) ||
      Number(nextConnection.enabled) !== 0 ||
      Number(nextConnection.version) !== Number(priorConnection.version) + 1 ||
      String(nextConnection.updated_at) === String(priorConnection.updated_at)
    )
      throw new Error('TARGET_PROVIDER_PAUSE_INVALID')
    changes.push({
      table: 'provider_connections',
      id: String(priorConnection.id),
      priorVersion: Number(priorConnection.version),
      pausedVersion: Number(nextConnection.version)
    })
    for (const [table, key] of configured)
      changes.push(
        ...validatePausedTable(
          before[table].rows,
          after[table].rows,
          table,
          key,
          changed.get(table)
        )
      )
    if (after.assistant_provider_bindings.digest !== before.assistant_provider_bindings.digest)
      throw new Error('TARGET_BINDING_CHANGED')
    const priorRetention = before.retention_state.rows[0]
    const nextRetention = after.retention_state.rows[0]
    if (
      before.retention_state.rows.length !== 1 ||
      after.retention_state.rows.length !== 1 ||
      !sameExcept(priorRetention, nextRetention, new Set(['epoch'])) ||
      Number(nextRetention.epoch) !== Number(priorRetention.epoch) + 1 ||
      Number(nextRetention.generation) !== Number(priorRetention.generation)
    )
      throw new Error('TARGET_RETENTION_EPOCH_INVALID')
    if (
      changed.get('background_configs').size < 1 ||
      changed.get('daily_configs').size < 1
    )
      throw new Error('TARGET_ENABLED_AUTOMATION_SENTINEL_MISSING')
    for (const table of [
      'background_configs',
      'daily_configs',
      'steward_configs',
      'discovery_configs'
    ])
      for (const row of after[table].rows)
        if (JSON.parse(String(row.record_json)).enabled !== false)
          throw new Error('TARGET_AUTOMATION_STILL_ENABLED')
    return {
      before: sanitizeTableSnapshot(before),
      after: sanitizeTableSnapshot(after),
      changes,
      connectionId: String(priorConnection.id),
      bindingDigest: before.assistant_provider_bindings.digest,
      retentionEpoch: {
        before: Number(priorRetention.epoch),
        after: Number(nextRetention.epoch),
        generation: Number(nextRetention.generation)
      }
    }
  } finally {
    database.close()
  }
}

function assertMinimums(counts) {
  const minimums = {
    assistants: 2,
    timeline_messages: 2,
    memory_objects: 1,
    items: 6,
    reminders: 1,
    provider_connections: 1,
    assistant_provider_bindings: 1,
    background_configs: 1,
    background_jobs: 1,
    background_chapters: 1,
    daily_configs: 1,
    daily_jobs: 1,
    daily_reports: 1,
    steward_configs: 1,
    steward_jobs: 1,
    memory_branches: 1,
    retention_jobs: 2,
    content_tombstones: 1,
    assistant_tombstones: 1,
    production_governance_state: 1
  }
  for (const [table, minimum] of Object.entries(minimums))
    if (counts[table] < minimum) throw new Error('SOURCE_DOMAIN_SENTINEL_MISSING')
}

function semanticEvidence(seed, verify) {
  const evidence = {
    assistants: Array.isArray(verify.assistant?.assistants) && verify.assistant.assistants.length >= 2,
    history:
      Array.isArray(verify.timelineAfterSend?.messages) &&
      verify.timelineAfterSend.messages.some(
        (message) => message.role === 'assistant' && message.status === 'completed'
      ),
    memory:
      Array.isArray(verify.memory?.query?.records) && verify.memory.query.records.length >= 1,
    items: Number(verify.itemsUi?.formalCount) >= 6,
    reminder:
      verify.reminders?.syntheticDeliveryObserved === true &&
      typeof verify.reminders?.reminderId === 'string',
    provider:
      verify.provider?.connections?.length === 1 && verify.provider?.bindings?.length === 1,
    retention: verify.retention?.state === 'COMPLETED',
    background:
      typeof verify.background?.chapterId === 'string' &&
      verify.background?.priorIdentityRestored === true,
    steward:
      typeof verify.steward?.branchId === 'string' &&
      verify.steward?.priorIdentityRestored === true,
    daily:
      typeof verify.daily?.reportId === 'string' && verify.daily?.priorIdentityRestored === true,
    toolReceipt:
      Array.isArray(verify.toolOperations) &&
      verify.toolOperations.length === 1 &&
      verify.toolOperations[0].state === 'SUCCEEDED',
    fakeTransportOnly:
      Number(seed.backgroundTransportCalls) === 1 &&
      Number(seed.stewardTransportCalls) === 2 &&
      Number(seed.dailyTransportCalls) === 1 &&
      Number(verify.backgroundTransportCalls) === 1 &&
      Number(verify.stewardTransportCalls) === 0 &&
      Number(verify.dailyTransportCalls) === 0
  }
  if (Object.values(evidence).some((value) => value !== true))
    throw new Error('SOURCE_SEMANTIC_SENTINEL_MISSING')
  return evidence
}

async function executeSeed(arguments_) {
  for (const name of [
    '--source',
    '--run-id',
    '--harness-sha256',
    '--initialized-receipt-sha256',
    '--context-helper-sha256'
  ])
    if (typeof arguments_[name] !== 'string') throw new Error('EXECUTION_ARGUMENT_MISSING')
  stage = 'BINDING'
  if (existsSync(successPath) || existsSync(failurePath)) throw new Error('SEED_RECEIPT_EXISTS')
  if (resolve(process.cwd()) !== projectRoot) throw new Error('PROJECT_ROOT_REQUIRED')
  if (!existsSync(bindingPath)) throw new Error('BINDING_MISSING')
  const binding = readJson(bindingPath)
  if (
    binding.schemaVersion !== 1 ||
    binding.status !== 'REVIEWED_READY' ||
    binding.candidateVersion !== '0.1.1' ||
    binding.execution?.profilePreserved !== true ||
    binding.execution?.candidateStaticPass !== true ||
    binding.execution?.nativeExecutionAuthorized !== true
  )
    throw new Error('BINDING_NOT_READY')

  const harnessPath = join(projectRoot, 'scripts', 'electron-f1-harness.mjs')
  if (!/^[A-Fa-f0-9]{64}$/u.test(arguments_['--harness-sha256']))
    throw new Error('HARNESS_HASH_INVALID')
  if (sha256File(harnessPath) !== arguments_['--harness-sha256'].toUpperCase())
    throw new Error('HARNESS_HASH_CHANGED')
  if (!/^[A-Fa-f0-9]{64}$/u.test(arguments_['--initialized-receipt-sha256']))
    throw new Error('INITIALIZED_RECEIPT_HASH_INVALID')
  if (
    sha256File(initializedReceiptPath) !==
    arguments_['--initialized-receipt-sha256'].toUpperCase()
  )
    throw new Error('INITIALIZED_RECEIPT_CHANGED')
  if (!/^[A-Fa-f0-9]{64}$/u.test(arguments_['--context-helper-sha256']))
    throw new Error('CONTEXT_HELPER_HASH_INVALID')
  if (
    sha256File(contextHelperPath) !== arguments_['--context-helper-sha256'].toUpperCase()
  )
    throw new Error('CONTEXT_HELPER_CHANGED')

  stage = 'PROFILE'
  const profilePath = resolve(expandWindowsPath(binding.paths.profilePath))
  const expectedProfile = resolve(process.env.APPDATA, 'Mashiro')
  if (profilePath.toLowerCase() !== expectedProfile.toLowerCase())
    throw new Error('PROFILE_SCOPE_CHANGED')
  assertRealDirectory(profilePath, 'PROFILE_PATH_UNSAFE')
  const initializedReceipt = readJson(initializedReceiptPath)
  const contextOutput = execFileSync(
    join(
      process.env.SystemRoot ?? ['C:', 'Windows'].join(String.fromCharCode(92)),
      'System32',
      'WindowsPowerShell',
      'v1.0',
      'powershell.exe'
    ),
    [
      '-NoProfile',
      '-File',
      contextHelperPath,
      '-TargetProcessId',
      String(process.pid),
      '-ProfilePath',
      profilePath
    ],
    { encoding: 'utf8', windowsHide: true, timeout: 15000 }
  )
  const desktopContext = JSON.parse(contextOutput)
  if (
    desktopContext.schemaVersion !== 1 ||
    desktopContext.kind !== 'FULL_DOMAIN_SEED_DESKTOP_CONTEXT' ||
    desktopContext.parentIsShell !== true ||
    desktopContext.helperParentIsTarget !== true ||
    desktopContext.targetProcessName !== 'node' ||
    desktopContext.profilePath.toLowerCase() !== profilePath.toLowerCase() ||
    desktopContext.profileIdentity !== initializedReceipt.profile.identity ||
    desktopContext.profileWrite !== false ||
    desktopContext.applicationStarted !== false
  )
    throw new Error('DESKTOP_PROFILE_IDENTITY_INVALID')

  const profileEntries = readdirSync(profilePath).sort()
  if (
    profileEntries.length !== 1 ||
    profileEntries[0] !== '.mashiro-019-isolated-profile.json'
  )
    throw new Error('ISOLATED_PROFILE_NOT_PRISTINE')
  const profileMarker = readJson(join(profilePath, profileEntries[0]))
  if (
    initializedReceipt.kind !== 'ISOLATED_PROFILE_INITIALIZED' ||
    initializedReceipt.sceneId !== profileMarker.sceneId ||
    initializedReceipt.profilePath.toLowerCase() !== profilePath.toLowerCase() ||
    initializedReceipt.candidateSetupSha256 !== binding.candidate.setupSha256 ||
    initializedReceipt.exclusiveCreate !== true ||
    initializedReceipt.applicationStarted !== false ||
    initializedReceipt.databaseOpened !== false ||
    profileMarker.containsOriginalData !== false ||
    profileMarker.candidateSetupSha256 !== binding.candidate.setupSha256
  )
    throw new Error('ISOLATED_PROFILE_RECEIPT_INVALID')
  assertNoMashiroProcesses()

  stage = 'SOURCE'
  const sourceRequested = resolve(arguments_['--source'])
  if (!isAbsolute(sourceRequested)) throw new Error('SOURCE_ABSOLUTE_REQUIRED')
  const source = realpathSync.native(sourceRequested)
  const canonicalTemporary = realpathSync.native(tmpdir())
  if (
    source !== sourceRequested ||
    !isInside(canonicalTemporary, source) ||
    !basename(source).startsWith('mashiro-f1-e2e-')
  )
    throw new Error('SOURCE_SCOPE_INVALID')
  assertTreeSafe(source)
  const runId = arguments_['--run-id']
  if (!/^[0-9a-f-]{36}$/u.test(runId)) throw new Error('RUN_ID_INVALID')
  const sourceMarker = readJson(join(source, '.mashiro-f1-e2e.json'))
  if (sourceMarker.protocolVersion !== 1 || sourceMarker.runId !== runId)
    throw new Error('SOURCE_IDENTITY_MISMATCH')
  const seed = readJson(join(source, 'results', 'seed.json'))
  const verify = readJson(join(source, 'results', 'verify.json'))
  for (const [phase, result] of [
    ['seed', seed],
    ['verify', verify]
  ]) {
    if (
      result.runId !== runId ||
      result.phase !== phase ||
      result.processType !== 'browser' ||
      result.failure
    )
      throw new Error('SOURCE_PHASE_NOT_VERIFIED')
  }
  const semantics = semanticEvidence(seed, verify)

  const sourceData = join(source, 'data')
  assertRealDirectory(sourceData, 'SOURCE_DATA_UNSAFE')
  if (existsSync(join(sourceData, '.mashiro-dataset.json')))
    throw new Error('PRODUCTION_OR_PRIOR_DATASET_SOURCE_REJECTED')
  for (const suffix of ['-wal', '-shm'])
    if (
      existsSync(join(sourceData, 'mashiro.sqlite' + suffix)) &&
      statSync(join(sourceData, 'mashiro.sqlite' + suffix)).size > 0
    )
      throw new Error('SOURCE_NOT_QUIESCENT')

  const tableNames = [
    'assistants',
    'timeline_messages',
    'memory_objects',
    'items',
    'reminders',
    'provider_connections',
    'assistant_provider_bindings',
    'background_configs',
    'background_jobs',
    'background_chapters',
    'daily_configs',
    'daily_jobs',
    'daily_reports',
    'steward_configs',
    'steward_jobs',
    'memory_branches',
    'retention_jobs',
    'content_tombstones',
    'assistant_tombstones',
    'production_governance_state'
  ]
  const sourceDatabasePath = join(sourceData, 'mashiro.sqlite')
  let counts
  let sourceDatabaseHash
  const credentialSource = join(sourceData, 'credentials')
  const memorySource = join(sourceData, 'memory')
  assertRealDirectory(credentialSource, 'SOURCE_CREDENTIAL_DIRECTORY_INVALID')
  assertRealDirectory(memorySource, 'SOURCE_MEMORY_DIRECTORY_INVALID')
  const credentialFiles = readdirSync(credentialSource)
  if (credentialFiles.length !== 1) throw new Error('SOURCE_CREDENTIAL_SENTINEL_INVALID')
  const credentialBytes = readFileSync(join(credentialSource, credentialFiles[0]))
  if (
    credentialBytes.length === 0 ||
    credentialBytes.includes(Buffer.from('e2e-persistent-key')) ||
    credentialBytes.includes(Buffer.from('e2e-temporary-key'))
  )
    throw new Error('SOURCE_CREDENTIAL_NOT_PROTECTED')
  if (readdirSync(memorySource).length < 1) throw new Error('SOURCE_MEMORY_FILE_MISSING')

  stage = 'TARGET_CREATE'
  const target = join(profilePath, targetName)
  if (existsSync(target)) throw new Error('TARGET_ALREADY_EXISTS')
  mkdirSync(target, { recursive: false })
  targetCreated = true
  assertRealDirectory(target, 'TARGET_PATH_UNSAFE')

  stage = 'INITIALIZE'
  const bundle = await build({
    stdin: {
      contents: [
        "export { initializeProductionDataSet } from './src/main/data/production-initialize.ts'",
        "export { backgroundConfigurationSchema } from './src/shared/background-contract.ts'",
        "export { dailyConfigurationSchema } from './src/shared/daily-contract.ts'",
        "export { stewardConfigurationSchema, discoveryConfigurationSchema } from './src/shared/steward-contract.ts'"
      ].join('\n'),
      resolveDir: projectRoot,
      sourcefile: 'post-release-019-full-domain-seed-entry.ts',
      loader: 'ts'
    },
    bundle: true,
    write: false,
    platform: 'node',
    format: 'esm',
    packages: 'bundle',
    logLevel: 'silent'
  })
  if (bundle.outputFiles.length !== 1) throw new Error('INITIALIZER_BUNDLE_INVALID')
  const initializerModule = await import(
    'data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].contents).toString('base64')
  )
  const copies = []
  let lease
  let sourceDatabase
  let sourceTransactionOpen = false
  let sourceDatabaseOpen = false
  const closeSourceSnapshot = () => {
    if (!sourceDatabaseOpen) return
    if (sourceTransactionOpen)
      try {
        sourceDatabase.exec('ROLLBACK')
      } catch {
        // Preserve the first seed error.
      }
    sourceTransactionOpen = false
    sourceDatabase.close()
    sourceDatabaseOpen = false
  }
  try {
    sourceDatabase = new DatabaseSync(sourceDatabasePath, { readOnly: true })
    sourceDatabaseOpen = true
    if (
      Number(sourceDatabase.prepare('PRAGMA user_version').get().user_version) !==
        expectedSchemaVersion ||
      sourceDatabase.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok' ||
      sourceDatabase.prepare('PRAGMA foreign_key_check').all().length !== 0 ||
      sourceDatabase.prepare('PRAGMA journal_mode').get().journal_mode !== 'delete'
    )
      throw new Error('SOURCE_DATABASE_INVALID')
    sourceDatabase.exec('BEGIN')
    sourceTransactionOpen = true
    counts = Object.fromEntries(tableNames.map((table) => [table, countRows(sourceDatabase, table)]))
    assertMinimums(counts)
    sourceDatabaseHash = sha256File(sourceDatabasePath)

    const initialized = await initializerModule.initializeProductionDataSet(
      target,
      (databasePath) => {
        copyFileSync(sourceDatabasePath, databasePath, constants.COPYFILE_EXCL)
        for (const folder of ['memory', 'credentials'])
          copyKnownTree(join(sourceData, folder), join(target, folder), folder + '/', copies)
        if (sha256File(databasePath) !== sourceDatabaseHash)
          throw new Error('TARGET_DATABASE_HASH_MISMATCH')
        const targetDatabase = new DatabaseSync(databasePath, { readOnly: true })
        try {
          const targetCounts = Object.fromEntries(
            tableNames.map((table) => [table, countRows(targetDatabase, table)])
          )
          if (
            Number(targetDatabase.prepare('PRAGMA user_version').get().user_version) !==
              expectedSchemaVersion ||
            targetDatabase.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok' ||
            targetDatabase.prepare('PRAGMA foreign_key_check').all().length !== 0 ||
            JSON.stringify(targetCounts) !== JSON.stringify(counts)
          )
            throw new Error('TARGET_DATABASE_INVALID')
        } finally {
          targetDatabase.close()
        }
      },
      () => {
        throw new Error('SYNTHETIC_TARGET_LEASE_LOST')
      }
    )
    lease = initialized.lease
    closeSourceSnapshot()
    stage = 'TARGET_PAUSE'
    assertNoMashiroProcesses()
    const targetDatabasePath = join(target, 'mashiro.sqlite')
    const copiedDatabaseHash = sha256File(targetDatabasePath)
    if (copiedDatabaseHash !== sourceDatabaseHash) throw new Error('TARGET_DATABASE_CHANGED')
    const pause = pauseTargetDatabase(targetDatabasePath, initializerModule)
    const pausedDatabaseHash = sha256File(targetDatabasePath)
    if (pausedDatabaseHash === copiedDatabaseHash) throw new Error('TARGET_PAUSE_NOT_PERSISTED')
    stage = 'FINAL_VERIFY'
    assertNoMashiroProcesses()
    const manifest = initialized.manifest
    const report = {
      schemaVersion: 1,
      kind: 'FULL_DOMAIN_SYNTHETIC_DATASET_A_CREATED',
      status: 'EXECUTED',
      observedAt: new Date().toISOString(),
      scope: 'isolated profile schema19 seed; not installation or UI acceptance',
      source: {
        root: source,
        runId,
        schemaVersion: expectedSchemaVersion,
        databaseSha256: sourceDatabaseHash,
        harnessSha256: arguments_['--harness-sha256'].toUpperCase(),
        seedFakeTransportCalls: {
          background: seed.backgroundTransportCalls,
          steward: seed.stewardTransportCalls,
          daily: seed.dailyTransportCalls
        },
        verifyFakeTransportCalls: {
          background: verify.backgroundTransportCalls,
          steward: verify.stewardTransportCalls,
          daily: verify.dailyTransportCalls
        }
      },
      target: {
        path: target,
        dataSetId: manifest.dataSetId,
        manifestState: manifest.state,
        schemaVersion: expectedSchemaVersion,
        copiedDatabaseSha256: copiedDatabaseHash,
        pausedDatabaseSha256: pausedDatabaseHash,
        counts,
        safePause: {
          connectionId: pause.connectionId,
          bindingDigest: pause.bindingDigest,
          changes: pause.changes,
          tableDigestsBefore: pause.before,
          tableDigestsAfter: pause.after
        }
      },
      profile: {
        path: profilePath,
        initializedReceiptSha256: arguments_['--initialized-receipt-sha256'].toUpperCase(),
        initializedIdentity: initializedReceipt.profile.identity,
        observedIdentity: desktopContext.profileIdentity,
        desktopParentProcessId: desktopContext.parentProcessId,
        desktopShellProcessId: desktopContext.shellProcessId,
        contextHelperSha256: arguments_['--context-helper-sha256'].toUpperCase(),
        containsOriginalData: false
      },
      semantics,
      copiedFiles: copies.sort((left, right) => left.path.localeCompare(right.path)),
      networkCallsBySeedHelper: 0,
      providerCallsAdded: 0,
      originalProfileRead: false,
      priorProductionDatasetRead: false,
      applicationStarted: false
    }
    await lease.release()
    lease = undefined
    writeCreateNewJson(successPath, report)
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
  } finally {
    closeSourceSnapshot()
    if (lease) await lease.release()
  }
}

const arguments_ = parseArguments(process.argv.slice(2))
if (!arguments_.execute) {
  if (process.argv.length !== 2) throw new Error('PREPARE_TAKES_NO_ARGUMENTS')
  process.stdout.write(
    JSON.stringify(
      {
        schemaVersion: 1,
        kind: 'FULL_DOMAIN_SYNTHETIC_DATASET_A_HELPER',
        status: 'PREPARED_ONLY',
        expectedSchemaVersion,
        targetName,
        executionRequiredArguments: [
          '--source',
          '--run-id',
          '--harness-sha256',
          '--initialized-receipt-sha256',
          '--context-helper-sha256',
          '--execute'
        ],
        profileRead: false,
        databaseRead: false,
        filesystemWrite: false,
        applicationStarted: false,
        providerCallsAdded: 0
      },
      null,
      2
    ) + '\n'
  )
} else {
  executeSeed(arguments_).catch(() => {
    try {
      writeCreateNewJson(failurePath, {
        schemaVersion: 1,
        kind: 'FULL_DOMAIN_SYNTHETIC_DATASET_A_FAILED',
        status: 'FAILED',
        observedAt: new Date().toISOString(),
        stage,
        code: 'SEED_GUARD_OR_COPY_FAILED',
        originalProfileRead: false,
        priorProductionDatasetRead: false,
        applicationStarted: false,
        providerCallsAdded: 0,
        partialTargetPreserved: targetCreated
      })
    } catch {
      process.stderr.write('SEED_FAILURE_RECEIPT_UNAVAILABLE\n')
    }
    process.exitCode = 1
  })
}
