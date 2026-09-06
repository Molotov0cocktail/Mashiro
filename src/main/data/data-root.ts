import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, isAbsolute, join, relative, resolve } from 'node:path'

interface AppPaths {
  isPackaged: boolean
  getPath(name: 'appData'): string
  setPath(name: 'userData' | 'sessionData', path: string): void
}

export interface DataRoot {
  profile: 'development' | 'test'
  root: string
  databasePath: string
  credentialDirectory: string
  resultsDirectory: string | null
  runId: string | null
  phase: 'seed' | 'verify' | null
}

function isInside(base: string, candidate: string): boolean {
  const segment = relative(base, candidate)
  return (
    segment !== '' &&
    segment !== '..' &&
    !segment.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) &&
    !isAbsolute(segment)
  )
}

function ensureWritableDirectory(path: string): void {
  mkdirSync(path, { recursive: true })
  const probe = join(path, `.mashiro-write-probe-${process.pid}`)
  let descriptor: number | undefined
  try {
    descriptor = openSync(probe, 'wx', 0o600)
    writeFileSync(descriptor, 'ok', { encoding: 'utf8' })
    fsyncSync(descriptor)
  } finally {
    if (descriptor !== undefined) closeSync(descriptor)
    if (existsSync(probe)) unlinkSync(probe)
  }
}

function resolveTestRoot(environment: NodeJS.ProcessEnv): {
  root: string
  runId: string
  phase: 'seed' | 'verify'
} {
  const requestedRoot = environment.MASHIRO_E2E_ROOT
  const runId = environment.MASHIRO_E2E_RUN_ID
  const phase = environment.MASHIRO_E2E_PHASE
  if (!requestedRoot || !isAbsolute(requestedRoot) || !runId || !/^[0-9a-f-]{36}$/u.test(runId)) {
    throw new Error('Invalid trusted E2E root metadata')
  }
  if (phase !== 'seed' && phase !== 'verify') throw new Error('Invalid trusted E2E phase')
  const canonicalTemp = realpathSync.native(tmpdir())
  const canonicalRoot = realpathSync.native(requestedRoot)
  if (resolve(requestedRoot) !== canonicalRoot || !isInside(canonicalTemp, canonicalRoot)) {
    throw new Error('E2E root must be a canonical OS-temp descendant')
  }
  if (!basename(canonicalRoot).startsWith('mashiro-f1-e2e-')) {
    throw new Error('E2E root name is not owned by the F1 harness')
  }
  const rootItem = lstatSync(canonicalRoot)
  if (!rootItem.isDirectory() || rootItem.isSymbolicLink())
    throw new Error('E2E root is not a real directory')
  const marker = JSON.parse(
    readFileSync(join(canonicalRoot, '.mashiro-f1-e2e.json'), 'utf8')
  ) as unknown
  if (
    typeof marker !== 'object' ||
    marker === null ||
    (marker as { protocolVersion?: unknown }).protocolVersion !== 1 ||
    (marker as { runId?: unknown }).runId !== runId
  ) {
    throw new Error('E2E ownership marker mismatch')
  }
  return { root: canonicalRoot, runId, phase }
}

export function resolveDataRoot(
  app: AppPaths,
  environment: NodeJS.ProcessEnv = process.env
): DataRoot {
  if (app.isPackaged)
    throw new Error('Packaged data location is outside the F1 qualification scope')

  let profile: DataRoot['profile'] = 'development'
  let root: string
  let resultsDirectory: string | null = null
  let runId: string | null = null
  let phase: DataRoot['phase'] = null

  if (environment.MASHIRO_E2E === '1') {
    const test = resolveTestRoot(environment)
    profile = 'test'
    root = test.root
    runId = test.runId
    phase = test.phase
    resultsDirectory = join(root, 'results')
  } else {
    root = join(app.getPath('appData'), 'Mashiro Development')
  }

  const dataDirectory = join(root, 'data')
  const userData = join(root, 'runtime', 'userData')
  const sessionData = join(root, 'runtime', 'sessionData')
  for (const directory of [dataDirectory, userData, sessionData]) ensureWritableDirectory(directory)
  if (resultsDirectory) ensureWritableDirectory(resultsDirectory)
  app.setPath('userData', userData)
  app.setPath('sessionData', sessionData)
  return {
    profile,
    root,
    databasePath: join(dataDirectory, 'mashiro.sqlite'),
    credentialDirectory: join(dataDirectory, 'credentials'),
    resultsDirectory,
    runId,
    phase
  }
}
