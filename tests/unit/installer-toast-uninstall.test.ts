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
const hidden = { stdio: 'pipe' as const, windowsHide: true, timeout: 30_000 }

afterAll(() => {
  for (const root of roots.splice(0)) {
    const resolved = resolve(root)
    if (
      dirname(resolved) !== temporaryBase ||
      !basename(resolved).startsWith('mashiro-toast-uninstall-') ||
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
const registryPath = (path: string) => `HKCU\\${path}`

function addRegistryValue(
  key: string,
  data: string,
  type: 'REG_SZ' | 'REG_EXPAND_SZ' = 'REG_SZ',
  name = ''
) {
  execFileSync(
    'reg.exe',
    [
      'add',
      registryPath(key),
      ...(name ? ['/v', name] : ['/ve']),
      '/t',
      type,
      '/d',
      data,
      '/f',
      '/reg:64'
    ],
    hidden
  )
}

function keyExists(key: string) {
  return spawnSync('reg.exe', ['query', registryPath(key), '/reg:64'], hidden).status === 0
}

function valueExists(key: string, name = '') {
  return (
    spawnSync(
      'reg.exe',
      ['query', registryPath(key), ...(name ? ['/v', name] : ['/ve']), '/reg:64'],
      hidden
    ).status === 0
  )
}

function valueContainsAscii(key: string, fragment: string, name = '') {
  const result = spawnSync(
    'reg.exe',
    ['query', registryPath(key), ...(name ? ['/v', name] : ['/ve']), '/reg:64'],
    hidden
  )
  return result.status === 0 && result.stdout.toString('latin1').includes(fragment)
}

function removeRegistryTree(key: string) {
  if (keyExists(key)) execFileSync('reg.exe', ['delete', registryPath(key), '/f'], hidden)
}

describe.skipIf(process.platform !== 'win32')(
  'owned Electron Toast activation uninstall cleanup',
  () => {
    it('keeps cleanup under the real uninstall-only guard and rejects unsafe roots', () => {
      const generated = renderOwnedFilesNsis([], [], {
        executableFilename: 'Mashiro Test.exe',
        toastClsidRoot: 'Software\\Mashiro\\Tests\\ToastCleanup\\Safe\\CLSID'
      })
      expect(generated).toContain('!insertmacro MashiroRemoveOwnedToastActivators')
      expect(generated.indexOf('${IfNot} ${isUpdated}')).toBeLessThan(
        generated.indexOf('!insertmacro MashiroRemoveOwnedToastActivators')
      )
      expect(generated.indexOf('!insertmacro MashiroRemoveOwnedToastActivators')).toBeLessThan(
        generated.indexOf('${EndIf}', generated.indexOf('${IfNot} ${isUpdated}'))
      )
      expect(() =>
        renderOwnedFilesNsis([], [], { toastClsidRoot: 'Software\\Classes\\CLSID"\\Other' })
      ).toThrow('PACKAGING_UNSAFE_REGISTRY_LITERAL')
    })

    it('removes only exact REG_SZ defaults and preserves every unrelated field or key', () => {
      const root = mkdtempSync(join(temporaryBase, 'mashiro-toast-uninstall-'))
      roots.push(root)
      const install = join(root, '中文 Å 安装路径')
      const setup = join(root, 'MashiroToastCleanupProbe.exe')
      const uninstaller = join(root, 'probe-uninstaller.exe')
      const script = join(root, 'probe.nsi')
      const registryRoot = `Software\\Mashiro\\Tests\\ToastCleanup\\${randomUUID()}`
      const clsidRoot = `${registryRoot}\\CLSID`
      const runKey = `${registryRoot}\\Run`
      const approvalKey = `${registryRoot}\\StartupApproved\\Run`
      const executable = join(install, 'Mashiro Test.exe')
      const keys = {
        ownedA: `${clsidRoot}\\{00000000-0000-0000-0000-000000000001}`,
        ownedB: `${clsidRoot}\\{00000000-0000-0000-0000-000000000002}`,
        quoted: `${clsidRoot}\\{00000000-0000-0000-0000-000000000003}`,
        localNamed: `${clsidRoot}\\{10000000-0000-0000-0000-000000000001}`,
        clsidNamed: `${clsidRoot}\\{10000000-0000-0000-0000-000000000002}`,
        clsidChild: `${clsidRoot}\\{10000000-0000-0000-0000-000000000003}`,
        foreign: `${clsidRoot}\\{20000000-0000-0000-0000-000000000001}`,
        prefix: `${clsidRoot}\\{20000000-0000-0000-0000-000000000002}`,
        arguments: `${clsidRoot}\\{20000000-0000-0000-0000-000000000003}`,
        malformedQuotes: `${clsidRoot}\\{20000000-0000-0000-0000-000000000004}`,
        expandable: `${clsidRoot}\\{20000000-0000-0000-0000-000000000005}`
      }
      const generated = renderOwnedFilesNsis([], [], {
        runKey,
        approvalKey,
        valueName: 'Mashiro.Test.Unique',
        executableFilename: 'Mashiro Test.exe',
        toastClsidRoot: clsidRoot
      })
      writeFileSync(
        script,
        `Unicode true
SilentInstall silent
RequestExecutionLevel user
Name "Mashiro Toast cleanup probe"
OutFile "${nsisPath(setup)}"
InstallDir "${nsisPath(install)}"
!addincludedir "${nsisPath(join(process.cwd(), 'node_modules', 'app-builder-lib', 'templates', 'nsis', 'include'))}"
!addplugindir /x86-unicode "${nsisPath(findStdUtilsPlugins())}"
!include StdUtils.nsh
!define BUILD_UNINSTALLER
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
  FileOpen $0 "${nsisPath(join(root, 'result.txt'))}" w
  FileWrite $0 "r9=$R9$\\r$\\n"
  FileClose $0
SectionEnd
`
      )

      try {
        const compiled = spawnSync(
          findMakensis(),
          ['/WX', '/V4', '/INPUTCHARSET', 'UTF8', script],
          hidden
        )
        if (compiled.status !== 0)
          throw new Error(
            `NSIS_COMPILE_FAILED
${compiled.stdout.toString()}
${compiled.stderr.toString()}`
          )
        execFileSync(setup, ['/S'], hidden)

        addRegistryValue(`${keys.ownedA}\\LocalServer32`, executable)
        addRegistryValue(`${keys.ownedB}\\LocalServer32`, executable)
        addRegistryValue(`${keys.quoted}\\LocalServer32`, `"${executable}"`)
        addRegistryValue(`${keys.localNamed}\\LocalServer32`, executable)
        addRegistryValue(`${keys.localNamed}\\LocalServer32`, 'preserved', 'REG_SZ', 'Keep')
        addRegistryValue(`${keys.clsidNamed}\\LocalServer32`, executable)
        addRegistryValue(keys.clsidNamed, 'preserved', 'REG_SZ', 'KeepRoot')
        addRegistryValue(`${keys.clsidChild}\\LocalServer32`, executable)
        addRegistryValue(`${keys.clsidChild}\\Other`, 'preserved')
        addRegistryValue(`${keys.foreign}\\LocalServer32`, 'C:\\Elsewhere\\Mashiro Test.exe')
        addRegistryValue(`${keys.prefix}\\LocalServer32`, `${install}-other\\Mashiro Test.exe`)
        addRegistryValue(`${keys.arguments}\\LocalServer32`, `${executable} --extra`)
        addRegistryValue(`${keys.malformedQuotes}\\LocalServer32`, `""${executable}""`)
        addRegistryValue(`${keys.expandable}\\LocalServer32`, executable, 'REG_EXPAND_SZ')

        execFileSync(uninstaller, ['/S', `_?=${root}`], hidden)
        expect(readFileSync(join(root, 'result.txt'), 'utf8')).toBe('r9=sentinel-r9\r\n')

        expect(keyExists(keys.ownedA)).toBe(false)
        expect(keyExists(keys.ownedB)).toBe(false)
        expect(keyExists(keys.quoted)).toBe(false)

        expect(valueContainsAscii(`${keys.localNamed}\\LocalServer32`, 'Mashiro Test.exe')).toBe(
          false
        )
        expect(valueExists(`${keys.localNamed}\\LocalServer32`, 'Keep')).toBe(true)
        expect(valueContainsAscii(`${keys.clsidNamed}\\LocalServer32`, 'Mashiro Test.exe')).toBe(
          false
        )
        expect(valueExists(keys.clsidNamed, 'KeepRoot')).toBe(true)
        expect(valueContainsAscii(`${keys.clsidChild}\\LocalServer32`, 'Mashiro Test.exe')).toBe(
          false
        )
        expect(keyExists(`${keys.clsidChild}\\Other`)).toBe(true)

        for (const key of [
          keys.foreign,
          keys.prefix,
          keys.arguments,
          keys.malformedQuotes,
          keys.expandable
        ])
          expect(valueContainsAscii(`${key}\\LocalServer32`, 'Mashiro Test.exe')).toBe(true)
      } finally {
        removeRegistryTree(registryRoot)
      }
    })
  }
)
