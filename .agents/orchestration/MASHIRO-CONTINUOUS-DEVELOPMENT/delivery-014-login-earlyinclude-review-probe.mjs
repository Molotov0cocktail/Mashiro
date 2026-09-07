import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import process from 'node:process'

const base = resolve('.cache/review014-earlyinclude')
mkdirSync(base, { recursive: true })
const fixture = mkdtempSync(join(base, 'compile-'))
const debug = readFileSync('dist/windows-candidate-login-cleanup/builder-debug.yml', 'utf8')
const script = debug.split('  script: |-')[1].split(/\r?\n/).slice(1).map(line => line.replace(/^ {4}/, '')).join('\n')
const header = script.slice(0, script.indexOf('Var newStartMenuLink'))
const original = readFileSync('.cache/packaging/owned-files.nsh', 'utf8')
const compiler = join(process.env.LOCALAPPDATA, 'electron-builder/Cache/nsis-3.0.4.1/nsis-3.0.4.1-1mx3n/makensis.exe')
const variants = {
  frozen_v2: original,
  explicit_logiclib: '!include LogicLib.nsh\n' + original,
  explicit_logiclib_uninstaller_only: '!ifdef BUILD_UNINSTALLER\n!include LogicLib.nsh\n' + original + '\n!endif\n'
}
const output = { scope: 'compile only; no generated executable runs, Registry access or application actions', fixture, cases: [] }
for (const [name, macro] of Object.entries(variants)) {
  const include = join(fixture, name + '.nsh')
  writeFileSync(include, macro)
  for (const uninstall of [true, false]) {
    const filename = join(fixture, name + (uninstall ? '-uninstall' : '-install') + '.nsi')
    // Preserve actual header order. Generated UI-language files are irrelevant to this tiny section body.
    const exactOrderHeader = header.split('\n').filter(line => !/!include .*\d-messages\.nsh/.test(line)).join('\n').replace(resolve('.cache/packaging/owned-files.nsh'), include)
    writeFileSync(filename, `Unicode true
RequestExecutionLevel user
OutFile "${filename}.exe"
!define PRODUCT_NAME "Mashiro"
!define PRODUCT_FILENAME "Mashiro"
!define VERSION "0.1.0"
${uninstall ? '!define BUILD_UNINSTALLER' : ''}
${exactOrderHeader}
!addincludedir "${resolve('node_modules/app-builder-lib/templates/nsis')}"
!include common.nsh
Section
!ifdef BUILD_UNINSTALLER
  WriteUninstaller "$TEMP\\review-never-executed.exe"
!endif
SectionEnd
!ifdef BUILD_UNINSTALLER
Section "Uninstall"
  !insertmacro customRemoveFiles
SectionEnd
!endif
`)
    const result = spawnSync(compiler, ['/WX', '/V2', '/INPUTCHARSET', 'UTF8', filename], { encoding: 'utf8', windowsHide: true, timeout: 30000 })
    output.cases.push({ name, branch: uninstall ? 'BUILD_UNINSTALLER' : 'installer', status: result.status, stdout: result.stdout, stderr: result.stderr, error: result.error ? String(result.error) : null })
  }
}
writeFileSync('.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/delivery-014-login-earlyinclude-review-probe.json', JSON.stringify(output, null, 2) + '\n')
