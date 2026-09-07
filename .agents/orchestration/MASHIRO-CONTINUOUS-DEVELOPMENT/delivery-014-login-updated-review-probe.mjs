import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import process from 'node:process'
import assert from 'node:assert/strict'

const root = resolve('.cache/review014-login-flag')
mkdirSync(root, { recursive: true })
const fixture = mkdtempSync(join(root, 'probe-'))
const exe = join(fixture, 'probe.exe')
const result = join(fixture, 'result.txt')
const script = join(fixture, 'probe.nsi')
const cache = join(process.env.LOCALAPPDATA, 'electron-builder/Cache')
const compiler = join(cache, 'nsis-3.0.4.1/nsis-3.0.4.1-1mx3n/makensis.exe')
const plugins = join(cache, 'nsis-resources-3.4.1/nsis-resources-3.4.1-2jx2y/plugins/x86-unicode')
const debug = readFileSync('dist/windows-candidate-notification/builder-debug.yml', 'utf8')
const flagMacro = debug.match(/ {4}!macro _isUpdated[\s\S]*? {4}!define isUpdated[^\r\n]*/)?.[0].replace(/^ {4}/gm, '')
assert.ok(flagMacro)
writeFileSync(script, `Unicode true
SilentInstall silent
RequestExecutionLevel user
Name "Mashiro independent updated flag probe"
OutFile "${exe}"
!addplugindir /x86-unicode "${plugins}"
!include "${resolve('node_modules/app-builder-lib/templates/nsis/include/StdUtils.nsh')}"
!include LogicLib.nsh
${flagMacro}
Section
  StrCpy $R9 "sentinel"
  Push $R9
  \${If} \${isUpdated}
    StrCpy $1 "updated"
  \${Else}
    StrCpy $1 "uninstall"
  \${EndIf}
  Pop $R9
  FileOpen $0 "${result}" w
  FileWrite $0 "$1|$R9"
  FileClose $0
SectionEnd
`)
const options = { windowsHide: true, timeout: 30000, encoding: 'utf8' }
const output = { scope: 'no Registry reads/writes; synthetic executable only', fixture, compile: '', cases: [] }
try {
  output.compile = execFileSync(compiler, ['/V2', script], options)
  for (const args of [['/S'], ['/S', '--updated'], ['/S', '--updated-other']]) {
    execFileSync(exe, args, options)
    const actual = readFileSync(result, 'utf8')
    const expected = args.includes('--updated') ? 'updated|sentinel' : 'uninstall|sentinel'
    output.cases.push({ args, actual, expected })
    assert.equal(actual, expected)
  }
  output.verdict = 'PASS'
} catch (error) {
  output.verdict = 'FAIL'
  output.error = String(error)
  process.exitCode = 1
} finally {
  writeFileSync('.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/delivery-014-login-updated-review-probe.json', JSON.stringify(output, null, 2) + '\n')
}
