import { spawn, spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
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
  {
    encoding: 'utf8',
    flag: 'wx'
  }
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

let summary
try {
  await runStartupFailureProbe()
  const seed = await runPhase('seed')
  const verify = await runPhase('verify')
  if (seed.pid === verify.pid) throw new Error('Electron restart reused the same PID')
  if (
    seed.electron !== '44.1.1' ||
    verify.electron !== '44.1.1' ||
    seed.node !== '24.19.0' ||
    verify.node !== '24.19.0'
  )
    throw new Error('Qualified Electron/Node versions changed')
  if (JSON.stringify(seed.snapshot) !== JSON.stringify(verify.snapshot))
    throw new Error('Restart snapshot changed')
  const active = verify.snapshot.assistants.filter((item) => !item.isArchived)
  const archived = verify.snapshot.assistants.filter((item) => item.isArchived)
  if (active.length !== 1 || archived.length !== 1 || active[0].displayName !== '雪')
    throw new Error('Lifecycle snapshot is incomplete')
  if (
    verify.snapshot.primaryAssistantId !== active[0].id ||
    verify.snapshot.currentAssistantId !== active[0].id
  )
    throw new Error('Primary/current invariant failed')
  if (
    !Object.values(verify.security).every(
      (value, index) => [true, true, false, true][index] === value
    )
  )
    throw new Error('Window security preferences changed')
  summary = {
    runId,
    startupFailureSanitized: true,
    pids: [seed.pid, verify.pid],
    electron: verify.electron,
    node: verify.node,
    sqlite: verify.sqlite,
    snapshot: verify.snapshot
  }
  mkdirSync(join(projectRoot, 'test-results'), { recursive: true })
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
