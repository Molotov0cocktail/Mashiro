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
      !basename(resolved).startsWith('mashiro-review014-existing-') ||
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
for (const scenario of [
  { approval: '020000000000000000000000', lateChange: false },
  { approval: '030000000000000000000000', lateChange: false },
  { approval: '030000000000000000000000', lateChange: true }
]) {
  const { approval, lateChange } = scenario
  it.skipIf(process.platform !== 'win32')(
    `retires duplicate owned legacy Run without changing current approval ${approval.slice(0, 2)} (late change ${lateChange})`,
    () => {
      const root = mkdtempSync(join(temporaryBase, 'mashiro-review014-existing-'))
      roots.push(root)
      const install = join(root, '中文 Å 安装路径')
      const registryRoot = `Software\\Mashiro\\Tests\\Review014Existing\\${randomUUID()}`
      const runKey = `${registryRoot}\\Run`
      const approvalKey = `${registryRoot}\\StartupApproved\\Run`
      const legacyName = 'Review014.Legacy'
      const currentName = 'Review014.Current'
      const command = `"${join(install, 'Mashiro Test.exe')}" --mashiro-login`
      let generated: string = renderOwnedFilesNsis([], [], {
        runKey,
        approvalKey,
        valueName: currentName,
        legacyValueName: legacyName,
        executableFilename: 'Mashiro Test.exe'
      })
      const foreignCommand = '"C:\\Concurrent\\Other.exe" --different'
      if (lateChange) {
        const checkpoint = 'mashiro_login_migration_verify_current:'
        expect(generated.split(checkpoint)).toHaveLength(2)
        generated = generated.replace(
          checkpoint,
          `${checkpoint}\n  WriteRegStr HKCU "$R0" "$R3" '"C:\\Concurrent\\Other.exe" --different'`
        )
      }
      const script = join(root, 'existing.nsi')
      const setup = join(root, 'existing.exe')
      writeFileSync(
        script,
        `Unicode true
SilentInstall silent
RequestExecutionLevel user
Name "Review014 isolated duplicate owned registration"
OutFile "${nsisPath(setup)}"
InstallDir "${nsisPath(install)}"
${generated}
Section
  StrCpy $INSTDIR "${nsisPath(install)}"
  SetRegView 64
  !insertmacro customInstall
SectionEnd
`
      )
      try {
        addRegistryValue(runKey, legacyName, 'REG_SZ', command)
        addRegistryValue(runKey, currentName, 'REG_SZ', command)
        addRegistryValue(approvalKey, legacyName, 'REG_BINARY', '020000000000000000000000')
        addRegistryValue(approvalKey, currentName, 'REG_BINARY', approval)
        const currentBefore = registryValue(approvalKey, currentName)
        expect(currentBefore.status).toBe(0)
        execFileSync(findMakensis(), ['/WX', '/V2', '/INPUTCHARSET', 'UTF8', script], hidden)
        execFileSync(setup, ['/S'], hidden)
        expect(exactRegistryString(runKey, currentName)).toBe(lateChange ? foreignCommand : command)
        expect(registryValue(approvalKey, currentName).stdout).toBe(currentBefore.stdout)
        if (lateChange) {
          expect(exactRegistryString(runKey, legacyName)).toBe(command)
          expect(registryValue(approvalKey, legacyName).status).toBe(0)
        } else {
          expect(registryValue(runKey, legacyName).status).not.toBe(0)
          expect(registryValue(approvalKey, legacyName).status).not.toBe(0)
        }
      } finally {
        if (spawnSync('reg.exe', ['query', `HKCU\\${registryRoot}`], hidden).status === 0)
          execFileSync('reg.exe', ['delete', `HKCU\\${registryRoot}`, '/f'], hidden)
        expect(spawnSync('reg.exe', ['query', `HKCU\\${registryRoot}`], hidden).status).not.toBe(0)
      }
    },
    30_000
  )
}
