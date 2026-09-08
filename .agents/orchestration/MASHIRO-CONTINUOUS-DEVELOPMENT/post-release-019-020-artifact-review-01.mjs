import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, lstatSync, writeFileSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { extractFile as readAsar, listPackage, getRawHeader } from '@electron/asar'
import { NtExecutable, NtExecutableResource } from 'resedit'
import { getCurrentFuseWire } from '@electron/fuses'
import { execFileSync } from 'node:child_process'
import { renderOwnedFilesNsis } from '../../../build/installer-login-cleanup.mjs'

const extractFile = (archive, path) => readAsar(archive, path.split(/[\\/]/).join(sep))
const evidence = '.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/'
const root = resolve('dist/windows-candidate-0.1.1-v1/win-unpacked')
const hash = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase()
const sourceCommit = '29831920b3ed1d0140f889f8a4a01dfab1e97ff9'
const manifest = JSON.parse(readFileSync(evidence + 'post-release-019-020-package-hashes-01.json', 'utf8'))
assert.equal(execFileSync('D:/Git/Git/cmd/git.exe', ['-c','safe.directory=D:/Mashiro','diff',sourceCommit,'--','src','build','scripts','package.json','package-lock.json','electron-builder.config.mjs'], {encoding:'utf8'}), '')
const config = (await import('../../../electron-builder.config.mjs')).default
assert.equal(config.appId, 'io.github.molotov0cocktail.mashiro')
assert.equal(config.nsis.guid, '5555e988-f7b5-5fe3-b6bd-8df3b21f793e')
const result = { scope: 'read-only internal artifact static review; no executable runs', files: [], outputs: [], notices: [], owned: null }
for (const expected of manifest) {
  const bytes = readFileSync(expected.path)
  assert.equal(bytes.length, expected.bytes)
  assert.equal(hash(bytes), expected.sha256)
  result.files.push({ path: expected.path, bytes: bytes.length, sha256: hash(bytes) })
}
const asar = join(root, 'resources/app.asar')
for (const expected of JSON.parse(readFileSync(evidence + 'post-release-019-020-output-04.json', 'utf8'))) {
  const bytes = extractFile(asar, expected.path.split(/[\\/]/).join(sep))
  assert.equal(bytes.length, expected.size)
  assert.equal(hash(bytes), expected.sha256)
  assert.equal(hash(readFileSync(expected.path)), expected.sha256, 'current frozen output ' + expected.path)
  result.outputs.push({ path: expected.path, bytes: bytes.length, sha256: hash(bytes) })
}
const noticeRoot = join(root, 'resources/third-party-notices')
const notices = JSON.parse(readFileSync(join(noticeRoot, 'index.json'), 'utf8'))
for (const entry of notices.files) {
  const bytes = readFileSync(join(noticeRoot, entry.file))
  assert.equal(hash(bytes), entry.sha256.toUpperCase())
  result.notices.push({ component: entry.component, file: entry.file, sha256: hash(bytes) })
}
assert.equal(notices.files.length, 6)
const owned = JSON.parse(readFileSync(join(root, 'resources/mashiro-program-files.json'), 'utf8'))
const files = [], directories = []
function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    assert.equal(lstatSync(path).isSymbolicLink(), false)
    const name = relative(root, path).split(sep).join('/')
    assert.equal(name.split('/').includes('..'), false)
    assert.notEqual(name.split('/')[0].toLowerCase(), 'data')
    if (entry.isDirectory()) { directories.push(name); walk(path) }
    else { assert.ok(entry.isFile()); files.push(name) }
  }
}
walk(root)
assert.deepEqual([...owned.files].sort(), files.sort())
assert.equal(files.length, 79)
assert.equal(files.includes('resources/default_app.asar'), false)
assert.equal(files.includes('version'), false)
assert.equal(new Set(owned.files).size, owned.files.length)
const generated = readFileSync('.cache/packaging/owned-files.nsh', 'utf8')
assert.equal(generated, renderOwnedFilesNsis(owned.files, directories, { executableFilename: 'Mashiro.exe' }))
result.owned = { count: files.length, actualCount: owned.files.length, generatedSha256: hash(generated), generatedExactlyMatchesReviewedIdentityMigration: true }
result.runtime = notices.runtime
const packaged = JSON.parse(extractFile(asar, 'package.json').toString())
assert.equal(packaged.version, '0.1.1')
assert.equal(packaged.main, './out/main/index.js')
const roots = [...new Set(listPackage(asar).map(p => p.replaceAll('\\', '/').split('/').filter(Boolean)[0]))].sort()
assert.deepEqual(roots, ['node_modules', 'out', 'package.json'])
for (const runtime of notices.runtime) {
  const metadata = JSON.parse(extractFile(asar, `node_modules/${runtime.name}/package.json`).toString())
  assert.equal(metadata.version, runtime.version)
}
const main = extractFile(asar, 'out/main/index.js').toString()
for (const marker of ['PRAGMA user_version=19', 'policy-status', 'assistantRevision', 'pendingNavigation', 'contextIsolation: true', 'sandbox: true', 'nodeIntegration: false']) assert.ok(main.includes(marker), marker)
assert.ok(main.includes('io.github.molotov0cocktail.mashiro'))
assert.ok(main.includes('Native notifications unavailable in development'))
assert.ok(generated.includes('Mashiro.Desktop'))
assert.ok(generated.includes('io.github.molotov0cocktail.mashiro'))
assert.ok(generated.includes('MashiroMigrateOwnedLegacyLogin'))
result.identity = { appId: config.appId, nsisGuid: config.nsis.guid,  migrationMacroExact: true }
const preload = extractFile(asar, 'out/preload/index.cjs').toString()
assert.equal(preload.includes('node:sqlite'), false)
result.packaged = { version: packaged.version, main: packaged.main, dependencies: packaged.dependencies, roots, sourceCommit, schema19AndColdNavigationAndPolicyStatus: true }
const executable = join(root, 'Mashiro.exe')
const resources = NtExecutableResource.from(NtExecutable.from(readFileSync(executable))).entries
const integrityResources = resources.filter(entry => entry.type === 'INTEGRITY' && entry.id === 'ELECTRONASAR')
assert.equal(integrityResources.length, 1)
const integrity = JSON.parse(Buffer.from(integrityResources[0].bin).toString('utf8'))
const headerHash = hash(getRawHeader(asar).headerString).toLowerCase()
assert.ok(integrity.some(entry => entry.file.replaceAll('\\','/') === 'resources/app.asar' && entry.alg === 'SHA256' && entry.value === headerHash))
result.asarIntegrity = {headerHash, entries: integrity, matches: true}
result.fuses = await getCurrentFuseWire(executable)
result.stockFuses = await getCurrentFuseWire(resolve('node_modules/electron/dist/electron.exe'))
assert.deepEqual(result.fuses, result.stockFuses)
assert.equal(config.nsis.deleteAppDataOnUninstall, false)
assert.equal(config.nsis.perMachine, false)
assert.equal(config.nsis.allowElevation, false)
result.installerDataProtection = {deleteAppDataOnUninstall: false, perMachine: false, allowElevation: false, exactOwnedMacro: true}
for (const marker of ['SESSION_PREPARE', 'createEmpty', 'startupCleanup']) assert.ok(main.includes(marker), marker)
result.verdict = 'STATIC_PASS'
writeFileSync(evidence + 'post-release-019-020-artifact-review-01.json', JSON.stringify(result, null, 2) + '\n', { flag: 'wx' })
