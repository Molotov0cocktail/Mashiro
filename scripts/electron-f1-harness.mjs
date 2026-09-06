import { spawn, spawnSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'

const projectRoot = resolve(process.cwd())
const electron = join(projectRoot, 'node_modules', 'electron', 'dist', 'electron.exe')
if (!existsSync(electron))
  throw new Error('Electron executable is missing; run the official install-electron step')

const runId = randomUUID()
const testRoot = mkdtempSync(join(tmpdir(), 'mashiro-f1-e2e-'))
const canonicalTemp = realpathSync.native(tmpdir())
const canonicalRoot = realpathSync.native(testRoot)
const segment = relative(canonicalTemp, canonicalRoot)
if (!segment || segment.startsWith('..') || resolve(testRoot) !== canonicalRoot)
  throw new Error('Unsafe E2E root')
writeFileSync(
  join(testRoot, '.mashiro-f1-e2e.json'),
  JSON.stringify({ protocolVersion: 1, runId }),
  { encoding: 'utf8', flag: 'wx' }
)
mkdirSync(join(testRoot, 'results'), { recursive: false })

async function runStartupFailureProbe() {
  const environment = {
    ...process.env,
    MASHIRO_E2E: '1',
    MASHIRO_E2E_ROOT: projectRoot,
    MASHIRO_E2E_RUN_ID: randomUUID(),
    MASHIRO_E2E_PHASE: 'seed'
  }
  delete environment.ELECTRON_RUN_AS_NODE
  const child = spawn(electron, [projectRoot], {
    cwd: projectRoot,
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe']
  })
  const stdout = []
  const stderr = []
  child.stdout.on('data', (chunk) => stdout.push(chunk.toString()))
  child.stderr.on('data', (chunk) => stderr.push(chunk.toString()))
  const exitCode = await new Promise((resolveExit, reject) => {
    const timer = setTimeout(() => {
      spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true })
      reject(new Error('Electron startup-failure probe timed out'))
    }, 45_000)
    child.once('error', () => {
      clearTimeout(timer)
      reject(new Error('Electron startup-failure probe could not start'))
    })
    child.once('exit', (code) => {
      clearTimeout(timer)
      resolveExit(code)
    })
  })
  if (exitCode === 0) throw new Error('Electron accepted an invalid trusted E2E root')
  const captured = `${stdout.join('')}\n${stderr.join('')}`
  if (!stderr.join('').includes('MASHIRO_STARTUP_FAILURE'))
    throw new Error('Electron startup failure did not emit the stable event')
  const forbidden = [
    /D:\\/iu,
    /file:\/\/\//iu,
    /node_modules/iu,
    /(?:^|\r?\n)\s*at\s+/u,
    /\b(?:SQL|SQLite|SQLITE_[A-Z_]+)\b/iu
  ]
  if (forbidden.some((pattern) => pattern.test(captured)))
    throw new Error('Electron startup failure exposed internal details')
}

async function runPhase(phase) {
  const environment = {
    ...process.env,
    MASHIRO_E2E: '1',
    MASHIRO_E2E_ROOT: testRoot,
    MASHIRO_E2E_RUN_ID: runId,
    MASHIRO_E2E_PHASE: phase
  }
  delete environment.ELECTRON_RUN_AS_NODE
  const child = spawn(electron, [projectRoot], {
    cwd: projectRoot,
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe']
  })
  const output = []
  child.stdout.on('data', (chunk) => output.push(chunk.toString()))
  child.stderr.on('data', (chunk) => output.push(chunk.toString()))
  const exitCode = await new Promise((resolveExit, reject) => {
    const timer = setTimeout(() => {
      spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true })
      reject(new Error(`Electron ${phase} timed out`))
    }, 45_000)
    child.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.once('exit', (code) => {
      clearTimeout(timer)
      resolveExit(code)
    })
  })
  if (exitCode !== 0)
    throw new Error(`Electron ${phase} exited ${exitCode}: ${output.join('').slice(-1000)}`)
  const result = JSON.parse(readFileSync(join(testRoot, 'results', `${phase}.json`), 'utf8'))
  if (result.runId !== runId || result.phase !== phase || result.processType !== 'browser')
    throw new Error('Invalid Electron evidence identity')
  return result
}

function messageShape(message) {
  return {
    id: message.id,
    requestId: message.requestId,
    role: message.role,
    content: message.content,
    status: message.status,
    createdAt: message.createdAt,
    saved: message.saved
  }
}

let summary
try {
  await runStartupFailureProbe()
  const seed = await runPhase('seed')
  const verify = await runPhase('verify')
  if (seed.failure || verify.failure) {
    const failure = seed.failure ?? verify.failure
    throw new Error('Electron stage ' + failure.stage + ' failed: ' + failure.code)
  }
  if (seed.pid === verify.pid) throw new Error('Electron restart reused the same PID')
  if (
    seed.electron !== '44.1.1' ||
    verify.electron !== '44.1.1' ||
    seed.node !== '24.19.0' ||
    verify.node !== '24.19.0'
  ) {
    throw new Error('Qualified Electron/Node versions changed')
  }
  if (JSON.stringify(seed.assistant) !== JSON.stringify(verify.assistant))
    throw new Error('Restart assistant snapshot changed')
  const active = verify.assistant.assistants.filter((item) => !item.isArchived)
  const archived = verify.assistant.assistants.filter((item) => item.isArchived)
  if (active.length !== 1 || archived.length !== 1 || active[0].displayName !== '雪')
    throw new Error('Lifecycle snapshot is incomplete')
  if (
    verify.assistant.primaryAssistantId !== active[0].id ||
    verify.assistant.currentAssistantId !== active[0].id
  ) {
    throw new Error('Primary/current invariant failed')
  }
  if (
    !Object.values(verify.security).every(
      (value, index) => [true, true, false, true][index] === value
    )
  ) {
    throw new Error('Window security preferences changed')
  }
  if (
    seed.provider.connections.length !== 1 ||
    seed.provider.connections[0].credentialPersistence !== 'temporary' ||
    verify.provider.connections.length !== 1 ||
    verify.provider.connections[0].credentialPersistence !== 'persistent' ||
    seed.provider.bindings.length !== 1 ||
    verify.provider.bindings.length !== 1
  ) {
    throw new Error('Provider connection, binding, or credential restart evidence failed')
  }

  const before = seed.timelineBeforeClose.messages
  const restored = verify.timelineRestored.messages
  const expectedBefore = [
    ['user', 'E2E_NORMAL_USER', 'completed'],
    ['assistant', 'E2E_NORMAL_ASSISTANT', 'completed'],
    ['user', 'E2E_SAVED_TEMP_USER', 'completed'],
    ['assistant', 'E2E_SAVED_TEMP_ASSISTANT', 'completed'],
    ['user', 'E2E_PENDING_NORMAL', 'completed'],
    ['assistant', '', 'pending']
  ]
  if (
    before.length !== expectedBefore.length ||
    before.some(
      (message, index) =>
        message.role !== expectedBefore[index][0] ||
        message.content !== expectedBefore[index][1] ||
        message.status !== expectedBefore[index][2] ||
        !message.saved
    )
  ) {
    throw new Error('Seed timeline states are incomplete')
  }
  if (
    restored.length !== before.length ||
    restored
      .slice(0, 5)
      .some(
        (message, index) =>
          JSON.stringify(messageShape(message)) !== JSON.stringify(messageShape(before[index]))
      )
  ) {
    throw new Error('Stable timeline identity or content changed across restart')
  }
  const pendingBefore = before[5]
  const interrupted = restored[5]
  if (
    interrupted.id !== pendingBefore.id ||
    interrupted.requestId !== pendingBefore.requestId ||
    interrupted.role !== 'assistant' ||
    interrupted.createdAt !== pendingBefore.createdAt ||
    !interrupted.saved ||
    interrupted.status !== 'interrupted' ||
    interrupted.content !== 'E2E_PARTIAL_NORMAL'
  ) {
    throw new Error('Pending partial was not recovered as interrupted')
  }
  if (
    seed.savedTemporary.messages.length !== 2 ||
    !seed.savedTemporary.messages.every((message) => message.saved) ||
    seed.temporaryBeforeClose.messages.length !== 4 ||
    !seed.temporaryBeforeClose.messages.slice(0, 2).every((message) => message.saved) ||
    seed.temporaryBeforeClose.messages.slice(2).some((message) => message.saved) ||
    verify.temporaryRestored.messages.length !== 0
  ) {
    throw new Error('Explicit save or temporary reset evidence failed')
  }
  if (
    seed.pendingPartial !== 'E2E_PARTIAL_NORMAL' ||
    seed.normalChat.text !== 'E2E_NORMAL_ASSISTANT' ||
    seed.temporarySavedChat.text !== 'E2E_SAVED_TEMP_ASSISTANT' ||
    seed.temporaryUnsavedChat.text !== 'E2E_UNSAVED_TEMP_REPLY_MARKER'
  ) {
    throw new Error('Synthetic seed response evidence changed')
  }
  if (
    seed.transportAfterExplicit.count !== 4 ||
    seed.transportAfterExplicit.requests.some((request) => request.credential !== 'temporary') ||
    verify.transportBeforeExplicit.count !== 0 ||
    verify.transportAfterExplicit.count !== 1 ||
    verify.transportAfterExplicit.requests[0]?.credential !== 'persistent'
  ) {
    throw new Error('Restart recovery made an automatic Provider request')
  }
  const verifyMessages = verify.transportAfterExplicit.requests[0]?.messages.map(
    (message) => message.content
  )
  if (
    JSON.stringify(verifyMessages) !==
    JSON.stringify([
      'E2E_NORMAL_USER',
      'E2E_NORMAL_ASSISTANT',
      'E2E_SAVED_TEMP_USER',
      'E2E_SAVED_TEMP_ASSISTANT',
      'E2E_VERIFY_USER'
    ])
  ) {
    throw new Error('Recovered context included ineligible timeline content')
  }
  const afterSend = verify.timelineAfterSend.messages
  if (
    afterSend.length !== 8 ||
    afterSend
      .slice(0, 6)
      .some(
        (message, index) =>
          JSON.stringify(messageShape(message)) !== JSON.stringify(messageShape(restored[index]))
      ) ||
    afterSend[6].content !== 'E2E_VERIFY_USER' ||
    afterSend[6].status !== 'completed' ||
    afterSend[7].content !== 'E2E_VERIFY_ASSISTANT' ||
    afterSend[7].status !== 'completed' ||
    verify.chat.status !== 'completed' ||
    verify.chat.text !== 'E2E_VERIFY_ASSISTANT'
  ) {
    throw new Error('Explicit post-restart send did not append exactly one completed pair')
  }
  if (
    JSON.stringify(verify.timelineRestored).includes('E2E_UNSAVED_TEMP') ||
    JSON.stringify(verify.temporaryRestored).includes('E2E_UNSAVED_TEMP') ||
    JSON.stringify(verifyMessages).includes('E2E_UNSAVED_TEMP')
  ) {
    throw new Error('Unsaved temporary content recovered or entered normal context')
  }

  const credentialFiles = readdirSync(join(testRoot, 'data', 'credentials'))
  if (
    credentialFiles.length !== 1 ||
    readFileSync(join(testRoot, 'data', 'credentials', credentialFiles[0])).includes(
      Buffer.from('e2e-persistent-key')
    ) ||
    readFileSync(join(testRoot, 'data', 'credentials', credentialFiles[0])).includes(
      Buffer.from('e2e-temporary-key')
    )
  ) {
    throw new Error('Credential persistence or protection evidence failed')
  }
  const databaseFiles = readdirSync(join(testRoot, 'data')).filter((name) =>
    name.startsWith('mashiro.sqlite')
  )
  if (
    databaseFiles.some((name) =>
      readFileSync(join(testRoot, 'data', name)).includes(Buffer.from('E2E_UNSAVED_TEMP_MARKER'))
    )
  ) {
    throw new Error('Unsaved temporary body reached persistent database files')
  }

  summary = {
    runId,
    startupFailureSanitized: true,
    pids: [seed.pid, verify.pid],
    electron: verify.electron,
    node: verify.node,
    sqlite: verify.sqlite,
    snapshot: verify.assistant,
    provider: verify.provider,
    timeline: verify.timelineAfterSend,
    temporaryConversationReset: true,
    persistentCredentialProtected: true,
    recoveryTransportCalls: verify.transportBeforeExplicit.count,
    explicitSendTransportCalls: verify.transportAfterExplicit.count,
    chat: verify.chat
  }
  mkdirSync(join(projectRoot, 'test-results'), { recursive: true })
  copyFileSync(
    join(testRoot, 'results', 'provider-ui.png'),
    join(projectRoot, 'test-results', 'provider-ui.png')
  )
  writeFileSync(
    join(projectRoot, 'test-results', 'electron-f1.json'),
    JSON.stringify(summary, null, 2)
  )
  console.log(JSON.stringify(summary, null, 2))
} finally {
  const marker = JSON.parse(readFileSync(join(testRoot, '.mashiro-f1-e2e.json'), 'utf8'))
  if (marker.runId === runId && realpathSync.native(testRoot) === canonicalRoot)
    rmSync(testRoot, { recursive: true })
}
