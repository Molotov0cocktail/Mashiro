import { execFileSync, spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
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

afterAll(() => {
  for (const root of roots.splice(0)) {
    const resolved = resolve(root)
    if (
      dirname(resolved) !== temporaryBase ||
      !basename(resolved).startsWith('mashiro-login-uninstall-') ||
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

function findStdUtilsPlugins(): string {
  const localAppData = process.env.LOCALAPPDATA
  if (!localAppData) throw new Error('LOCALAPPDATA is required for the Windows NSIS oracle')
  const cache = join(localAppData, 'electron-builder', 'Cache')
  for (const outer of readdirSync(cache)
    .filter((name) => name.startsWith('nsis-resources-'))
    .reverse()) {
    const outerPath = join(cache, outer)
    for (const inner of readdirSync(outerPath).reverse()) {
      const candidate = join(outerPath, inner, 'plugins', 'x86-unicode')
      if (existsSync(join(candidate, 'StdUtils.dll'))) return candidate
    }
  }
  throw new Error('electron-builder StdUtils plugin is not installed')
}

const nsisPath = (path: string) => resolve(path).replaceAll('/', '\\')
const hidden = { stdio: 'pipe' as const, windowsHide: true, timeout: 30_000 }

function waitForFile(path: string) {
  const deadline = Date.now() + 10_000
  const signal = new Int32Array(new SharedArrayBuffer(4))
  while (!existsSync(path) && Date.now() < deadline) Atomics.wait(signal, 0, 0, 50)
  if (!existsSync(path)) throw new Error('NSIS_PROBE_RESULT_TIMEOUT')
}

type Scenario = {
  name: string
  updated?: boolean
  run?: 'owned' | 'foreign' | 'prefix' | 'extra' | 'unicode-lookalike'
  approval?: 'binary' | 'string'
  expected: { run: 'missing' | 'present'; approval: 'missing' | 'present' }
}

function runScenario(scenario: Scenario) {
  const root = mkdtempSync(join(temporaryBase, 'mashiro-login-uninstall-'))
  roots.push(root)
  const install = join(root, '中文 Å 安装路径')
  const setup = join(root, 'setup.exe')
  const uninstaller = join(root, 'probe-uninstaller.exe')
  const result = join(root, 'result.txt')
  const script = join(root, 'probe.nsi')
  const registryRoot = `Software\\Mashiro\\Tests\\LoginCleanup\\${randomUUID()}`
  const runKey = `${registryRoot}\\Run`
  const approvalKey = `${registryRoot}\\StartupApproved\\Run`
  const valueName = 'Mashiro.Test.Unique'
  const ownedCommand = `"${join(install, 'Mashiro Test.exe')}" --mashiro-login`
  const runCommand =
    scenario.run === 'owned'
      ? ownedCommand
      : scenario.run === 'prefix'
        ? `"${install}-other\\Mashiro Test.exe" --mashiro-login`
        : scenario.run === 'extra'
          ? `${ownedCommand} --extra`
          : scenario.run === 'unicode-lookalike'
            ? ownedCommand.replace('Å', 'Å')
            : '"C:\\Elsewhere\\Mashiro Test.exe" --mashiro-login'
  const generated = renderOwnedFilesNsis([], [], {
    runKey,
    approvalKey,
    valueName,
    executableFilename: 'Mashiro Test.exe'
  })
  writeFileSync(
    script,
    `Unicode true
SilentInstall silent
RequestExecutionLevel user
Name "Mashiro login cleanup probe"
OutFile "${nsisPath(setup)}"
InstallDir "${nsisPath(install)}"
!addincludedir "${nsisPath(join(process.cwd(), 'node_modules', 'app-builder-lib', 'templates', 'nsis', 'include'))}"
!addplugindir /x86-unicode "${nsisPath(findStdUtilsPlugins())}"
!include LogicLib.nsh
!include StdUtils.nsh
!define UNINSTALL_FILENAME "probe-uninstaller.exe"
!macro _isUpdated _a _b _t _f
  \${StdUtils.TestParameter} $R9 "updated"
  StrCmp "$R9" "true" \`\${_t}\` \`\${_f}\`
!macroend
!define isUpdated \`"" isUpdated ""\`
${generated}
Section
  SetOutPath "$INSTDIR"
  WriteUninstaller "${nsisPath(uninstaller)}"
SectionEnd
Section "Uninstall"
  StrCpy $INSTDIR "${nsisPath(install)}"
  SetRegView 64
  StrCpy $R9 "sentinel-r9"
  !insertmacro customRemoveFiles
  FileOpen $0 "${nsisPath(result)}" w
  FileWrite $0 "r9=$R9$\\r$\\n"
  ClearErrors
  EnumRegValue $1 HKCU "${runKey}" 0
  IfErrors 0 +3
  FileWrite $0 "run=missing$\\r$\\n"
  Goto +2
  FileWrite $0 "run=present$\\r$\\n"
  ClearErrors
  EnumRegValue $1 HKCU "${approvalKey}" 0
  IfErrors 0 +3
  FileWrite $0 "approval=missing$\\r$\\n"
  Goto +2
  FileWrite $0 "approval=present$\\r$\\n"
  FileClose $0
  DeleteRegKey HKCU "${registryRoot}"
SectionEnd
`
  )
  try {
    execFileSync(findMakensis(), ['/V2', '/INPUTCHARSET', 'UTF8', script], hidden)
    execFileSync(setup, ['/S'], hidden)
    if (scenario.run)
      execFileSync(
        'reg.exe',
        [
          'add',
          `HKCU\\${runKey}`,
          '/v',
          valueName,
          '/t',
          'REG_SZ',
          '/d',
          runCommand,
          '/f',
          '/reg:64'
        ],
        hidden
      )
    if (scenario.approval)
      execFileSync(
        'reg.exe',
        [
          'add',
          `HKCU\\${approvalKey}`,
          '/v',
          valueName,
          '/t',
          scenario.approval === 'binary' ? 'REG_BINARY' : 'REG_SZ',
          '/d',
          scenario.approval === 'binary' ? '020000000000000000000000' : 'not-binary',
          '/f',
          '/reg:64'
        ],
        hidden
      )
    const uninstallArgs = ['/S', ...(scenario.updated ? ['--updated'] : []), `_?=${root}`]
    execFileSync(uninstaller, uninstallArgs, hidden)
    waitForFile(result)
    return Object.fromEntries(
      readFileSync(result, 'utf8')
        .trim()
        .split(/\r?\n/u)
        .map((line) => line.split('='))
    )
  } finally {
    const query = spawnSync('reg.exe', ['query', `HKCU\\${registryRoot}`], hidden)
    if (query.status === 0)
      execFileSync('reg.exe', ['delete', `HKCU\\${registryRoot}`, '/f'], hidden)
  }
}

describe.skipIf(process.platform !== 'win32')('owned login registration uninstall cleanup', () => {
  it.each<Scenario>([
    {
      name: 'owned',
      run: 'owned',
      approval: 'binary',
      expected: { run: 'missing', approval: 'missing' }
    },
    {
      name: 'updated',
      updated: true,
      run: 'owned',
      approval: 'binary',
      expected: { run: 'present', approval: 'present' }
    },
    {
      name: 'foreign',
      run: 'foreign',
      approval: 'binary',
      expected: { run: 'present', approval: 'present' }
    },
    {
      name: 'prefix',
      run: 'prefix',
      approval: 'binary',
      expected: { run: 'present', approval: 'present' }
    },
    {
      name: 'extra',
      run: 'extra',
      approval: 'binary',
      expected: { run: 'present', approval: 'present' }
    },
    {
      name: 'unicode-lookalike',
      run: 'unicode-lookalike',
      approval: 'binary',
      expected: { run: 'present', approval: 'present' }
    },
    {
      name: 'orphan-approval',
      approval: 'binary',
      expected: { run: 'missing', approval: 'present' }
    },
    {
      name: 'nonbinary-approval',
      run: 'owned',
      approval: 'string',
      expected: { run: 'missing', approval: 'present' }
    }
  ])('$name', (scenario) => {
    const actual = runScenario(scenario)
    expect(actual).toMatchObject(scenario.expected)
    expect(actual.r9).toBe('sentinel-r9')
  })
})
