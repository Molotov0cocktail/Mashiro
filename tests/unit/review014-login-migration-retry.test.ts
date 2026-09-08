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
import { afterAll, expect, it } from 'vitest'
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
      !basename(resolved).startsWith('mashiro-review014-migration-') ||
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

const exactRegistryString = (key: string, name: string) => {
  const script = `$key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('${key}'); try { [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes([string]$key.GetValue('${name}'))) } finally { $key.Close() }`
  return Buffer.from(
    execFileSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      hidden
    ).trim(),
    'base64'
  ).toString('utf16le')
}
it.skipIf(process.platform !== 'win32')(
  'an approval-first Run write failure leaves the old choice intact and permits a complete retry',
  () => {
    const root = mkdtempSync(join(temporaryBase, 'mashiro-review014-migration-'))
    roots.push(root)
    const install = join(root, '中文 Å 安装路径')
    const registryRoot = `Software\\Mashiro\\Tests\\Review014Migration\\${randomUUID()}`
    const runKey = `${registryRoot}\\Run`
    const approvalKey = `${registryRoot}\\StartupApproved\\Run`
    const legacyName = 'Review014.Legacy'
    const currentName = 'Review014.Current'
    const command = `"${join(install, 'Mashiro Test.exe')}" --mashiro-login`
    const approval = '030000000000000000000000'
    const generated: string = renderOwnedFilesNsis([], [], {
      runKey,
      approvalKey,
      valueName: currentName,
      legacyValueName: legacyName,
      executableFilename: 'Mashiro Test.exe'
    })
    const target = "System::Call 'advapi32::RegSetValueExW(p r0, w R3, i 0, i 1, p r5, i R5) i .r1'"
    expect(generated.split(target)).toHaveLength(2)
    const failed = generated.replace(target, 'StrCpy $1 5')
    const execute = (text: string, name: string) => {
      const script = join(root, name + '.nsi')
      const setup = join(root, name + '.exe')
      writeFileSync(
        script,
        `Unicode true
SilentInstall silent
RequestExecutionLevel user
Name "Review014 isolated retry"
OutFile "${nsisPath(setup)}"
InstallDir "${nsisPath(install)}"
${text}
Section
  StrCpy $INSTDIR "${nsisPath(install)}"
  SetRegView 64
  !insertmacro customInstall
SectionEnd
`
      )
      execFileSync(findMakensis(), ['/WX', '/V2', '/INPUTCHARSET', 'UTF8', script], hidden)
      execFileSync(setup, ['/S'], hidden)
    }
    expect(spawnSync('reg.exe', ['query', `HKCU\\${registryRoot}`], hidden).status).not.toBe(0)
    try {
      addRegistryValue(runKey, legacyName, 'REG_SZ', command)
      addRegistryValue(approvalKey, legacyName, 'REG_BINARY', approval)
      execute(failed, 'fail-once')
      expect(exactRegistryString(runKey, legacyName)).toBe(command)
      expect(registryValue(approvalKey, legacyName).stdout).toContain(approval)
      expect(registryValue(runKey, currentName).status).not.toBe(0)
      expect(registryValue(approvalKey, currentName).status).not.toBe(0)
      execute(generated, 'retry')
      expect(registryValue(runKey, legacyName).status).not.toBe(0)
      expect(registryValue(approvalKey, legacyName).status).not.toBe(0)
      expect(exactRegistryString(runKey, currentName)).toBe(command)
      expect(registryValue(approvalKey, currentName).stdout).toContain(approval)
    } finally {
      const query = spawnSync('reg.exe', ['query', `HKCU\\${registryRoot}`], hidden)
      if (query.status === 0)
        execFileSync('reg.exe', ['delete', `HKCU\\${registryRoot}`, '/f'], hidden)
      expect(spawnSync('reg.exe', ['query', `HKCU\\${registryRoot}`], hidden).status).not.toBe(0)
    }
  }
)

it.skipIf(process.platform !== 'win32')(
  'a late legacy Off choice cannot leave the newly migrated login enabled',
  () => {
    const root = mkdtempSync(join(temporaryBase, 'mashiro-review014-migration-'))
    roots.push(root)
    const install = join(root, '中文 Å 安装路径')
    const registryRoot = `Software\\Mashiro\\Tests\\Review014Migration\\${randomUUID()}`
    const runKey = `${registryRoot}\\Run`
    const approvalKey = `${registryRoot}\\StartupApproved\\Run`
    const legacyName = 'Review014.Legacy'
    const currentName = 'Review014.Current'
    const command = `"${join(install, 'Mashiro Test.exe')}" --mashiro-login`
    const approval = '020000000000000000000000'
    const generated: string = renderOwnedFilesNsis([], [], {
      runKey,
      approvalKey,
      valueName: currentName,
      legacyValueName: legacyName,
      executableFilename: 'Mashiro Test.exe'
    })
    const target = "System::Call 'advapi32::RegSetValueExW(p r0, w R3, i 0, i 1, p r5, i R5) i .r1'"
    expect(generated.split(target)).toHaveLength(2)
    const failed = generated.replace(
      target,
      target + `\n  WriteRegBin HKCU "${approvalKey}" "${legacyName}" "030000000000000000000000"`
    )
    const execute = (text: string, name: string) => {
      const script = join(root, name + '.nsi')
      const setup = join(root, name + '.exe')
      writeFileSync(
        script,
        `Unicode true
SilentInstall silent
RequestExecutionLevel user
Name "Review014 isolated retry"
OutFile "${nsisPath(setup)}"
InstallDir "${nsisPath(install)}"
${text}
Section
  StrCpy $INSTDIR "${nsisPath(install)}"
  SetRegView 64
  !insertmacro customInstall
SectionEnd
`
      )
      execFileSync(findMakensis(), ['/WX', '/V2', '/INPUTCHARSET', 'UTF8', script], hidden)
      execFileSync(setup, ['/S'], hidden)
    }
    expect(spawnSync('reg.exe', ['query', `HKCU\\${registryRoot}`], hidden).status).not.toBe(0)
    try {
      addRegistryValue(runKey, legacyName, 'REG_SZ', command)
      addRegistryValue(approvalKey, legacyName, 'REG_BINARY', approval)
      execute(failed, 'late-off')
      expect(exactRegistryString(runKey, legacyName)).toBe(command)
      expect(registryValue(approvalKey, legacyName).stdout).toContain('030000000000000000000000')
      expect(registryValue(runKey, currentName).status).not.toBe(0)
    } finally {
      const query = spawnSync('reg.exe', ['query', `HKCU\\${registryRoot}`], hidden)
      if (query.status === 0)
        execFileSync('reg.exe', ['delete', `HKCU\\${registryRoot}`, '/f'], hidden)
      expect(spawnSync('reg.exe', ['query', `HKCU\\${registryRoot}`], hidden).status).not.toBe(0)
    }
  }
)
