import { execFileSync, spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
// @ts-expect-error Build hook is JavaScript and intentionally has no declaration file.
import { renderOwnedFilesNsis } from '../../build/installer-login-cleanup.mjs'

const roots: string[] = []
const temporaryBase = realpathSync.native(tmpdir())
const hidden = {
  stdio: 'pipe' as const,
  windowsHide: true,
  timeout: 30_000,
  encoding: 'utf8' as const
}

afterAll(() => {
  for (const root of roots.splice(0)) {
    const resolved = resolve(root)
    if (
      dirname(resolved) !== temporaryBase ||
      !basename(resolved).startsWith('mashiro-login-migration-') ||
      (existsSync(resolved) && lstatSync(resolved).isSymbolicLink())
    )
      throw new Error('UNSAFE_TEST_CLEANUP_ROOT')
    rmSync(resolved, { recursive: true, force: true })
  }
})

function findMakensis(): string {
  const localAppData = process.env.LOCALAPPDATA
  if (!localAppData) throw new Error('LOCALAPPDATA is required for the Windows NSIS oracle')
  const cache = join(localAppData, 'electron-builder', 'Cache')
  for (const outer of readdirSync(cache)
    .filter((name) => name.startsWith('nsis-'))
    .reverse()) {
    const outerPath = join(cache, outer)
    const direct = join(outerPath, 'makensis.exe')
    if (existsSync(direct)) return direct
    for (const inner of readdirSync(outerPath).reverse()) {
      const candidate = join(outerPath, inner, 'makensis.exe')
      if (existsSync(candidate)) return candidate
    }
  }
  throw new Error('electron-builder NSIS compiler is not installed')
}

const nsisPath = (path: string) => resolve(path).replaceAll('/', '\\')
const registryValue = (key: string, name: string) =>
  spawnSync('reg.exe', ['query', `HKCU\\${key}`, '/v', name, '/reg:64'], hidden)

function addRegistryValue(key: string, name: string, type: 'REG_SZ' | 'REG_BINARY', value: string) {
  execFileSync(
    'reg.exe',
    ['add', `HKCU\\${key}`, '/v', name, '/t', type, '/d', value, '/f', '/reg:64'],
    hidden
  )
}

type Scenario = {
  name: string
  legacy: 'owned' | 'foreign' | 'unicode-lookalike'
  approval: boolean
  current?: 'foreign'
  expectedMigration: boolean
}

function runScenario(scenario: Scenario) {
  const root = mkdtempSync(join(temporaryBase, 'mashiro-login-migration-'))
  roots.push(root)
  const install = join(root, '中文 Å 安装路径')
  const setup = join(root, 'MashiroLoginMigrationProbe.exe')
  const script = join(root, 'probe.nsi')
  const registryRoot = `Software\\Mashiro\\Tests\\LoginMigration\\${randomUUID()}`
  const runKey = `${registryRoot}\\Run`
  const approvalKey = `${registryRoot}\\StartupApproved\\Run`
  const legacyName = 'Mashiro.Legacy.Test'
  const currentName = 'Mashiro.Current.Test'
  const ownedCommand = `"${join(install, 'Mashiro Test.exe')}" --mashiro-login`
  const legacyCommand =
    scenario.legacy === 'owned'
      ? ownedCommand
      : scenario.legacy === 'unicode-lookalike'
        ? ownedCommand.replace('Å', 'Å')
        : '"C:\\Elsewhere\\Mashiro Test.exe" --mashiro-login'
  const generated = renderOwnedFilesNsis([], [], {
    runKey,
    approvalKey,
    valueName: currentName,
    legacyValueName: legacyName,
    executableFilename: 'Mashiro Test.exe'
  })
  writeFileSync(
    script,
    `Unicode true
SilentInstall silent
RequestExecutionLevel user
Name "Mashiro login migration probe"
OutFile "${nsisPath(setup)}"
InstallDir "${nsisPath(install)}"
!addincludedir "${nsisPath(join(process.cwd(), 'node_modules', 'app-builder-lib', 'templates', 'nsis', 'include'))}"
${generated}
Section
  StrCpy $INSTDIR "${nsisPath(install)}"
  SetRegView 64
  !insertmacro customInstall
SectionEnd
`
  )
  try {
    addRegistryValue(runKey, legacyName, 'REG_SZ', legacyCommand)
    if (scenario.approval)
      addRegistryValue(approvalKey, legacyName, 'REG_BINARY', '020000000000000000000000')
    if (scenario.current)
      addRegistryValue(runKey, currentName, 'REG_SZ', '"C:\\Concurrent\\Mashiro.exe" --different')
    execFileSync(findMakensis(), ['/WX', '/V2', '/INPUTCHARSET', 'UTF8', script], hidden)
    execFileSync(setup, ['/S'], hidden)
    const legacyRun = registryValue(runKey, legacyName)
    const currentRun = registryValue(runKey, currentName)
    const legacyApproval = registryValue(approvalKey, legacyName)
    const currentApproval = registryValue(approvalKey, currentName)
    return {
      ownedCommand,
      legacyRun,
      currentRun,
      legacyApproval,
      currentApproval
    }
  } finally {
    const query = spawnSync('reg.exe', ['query', `HKCU\\${registryRoot}`], hidden)
    if (query.status === 0)
      execFileSync('reg.exe', ['delete', `HKCU\\${registryRoot}`, '/f'], hidden)
  }
}

describe.skipIf(process.platform !== 'win32')('legacy login registration migration', () => {
  it.each<Scenario>([
    {
      name: 'owned registration with approval snapshot',
      legacy: 'owned',
      approval: true,
      expectedMigration: true
    },
    {
      name: 'owned registration without approval snapshot',
      legacy: 'owned',
      approval: false,
      expectedMigration: true
    },
    {
      name: 'foreign installation path',
      legacy: 'foreign',
      approval: true,
      expectedMigration: false
    },
    {
      name: 'Unicode lookalike installation path',
      legacy: 'unicode-lookalike',
      approval: true,
      expectedMigration: false
    },
    {
      name: 'existing current registration',
      legacy: 'owned',
      approval: true,
      current: 'foreign',
      expectedMigration: false
    }
  ])('$name', (scenario) => {
    const result = runScenario(scenario)

    if (scenario.expectedMigration) {
      expect(result.legacyRun.status).not.toBe(0)
      expect(result.currentRun.status).toBe(0)
      expect(result.currentRun.stdout).toContain('" --mashiro-login')
      if (scenario.approval) {
        expect(result.legacyApproval.status).not.toBe(0)
        expect(result.currentApproval.status).toBe(0)
        expect(result.currentApproval.stdout).toContain('020000000000000000000000')
      } else {
        expect(result.currentApproval.status).not.toBe(0)
      }
    } else {
      expect(result.legacyRun.status).toBe(0)
      expect(result.legacyRun.stdout).toContain('Mashiro Test.exe')
      expect(result.legacyRun.stdout).toContain('--mashiro-login')
      expect(result.currentRun.status).toBe(scenario.current ? 0 : 1)
      if (scenario.current) expect(result.currentRun.stdout).toContain('--different')
      expect(result.legacyApproval.status).toBe(0)
      expect(result.currentApproval.status).not.toBe(0)
    }
  })
})
