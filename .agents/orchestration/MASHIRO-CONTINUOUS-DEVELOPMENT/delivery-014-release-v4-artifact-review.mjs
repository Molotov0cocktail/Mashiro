import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, lstatSync, writeFileSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { extractFile as readAsar, listPackage } from '@electron/asar'
import { renderOwnedFilesNsis } from '../../../build/installer-login-cleanup.mjs'

const extractFile = (archive, path) => readAsar(archive, path.split(/[\\/]/).join(sep))
const evidence = '.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/'
const root = resolve('dist/windows-candidate-release-v4/win-unpacked')
const hash = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase()
const manifest = JSON.parse(readFileSync(evidence + 'delivery-014-release-v4-packaged-hashes.json', 'utf8'))
const result = { scope: 'read-only internal artifact static review; no executable runs', files: [], outputs: [], notices: [], owned: null }
for (const expected of manifest.files) {
  const bytes = readFileSync(expected.path)
  assert.equal(bytes.length, expected.bytes)
  assert.equal(hash(bytes), expected.sha256)
  result.files.push({ path: expected.path, bytes: bytes.length, sha256: hash(bytes) })
}
const asar = join(root, 'resources/app.asar')
for (const expected of JSON.parse(readFileSync(evidence + 'retention-009-root-frozen-output-v4.json', 'utf8')).files) {
  const bytes = extractFile(asar, expected.path.split(/[\\/]/).join(sep))
  assert.equal(bytes.length, expected.bytes)
  assert.equal(hash(bytes), expected.sha256)
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
result.owned = { count: files.length, actualCount: owned.files.length, generatedSha256: hash(generated), generatedExactlyMatchesToastV2: true }
result.runtime = notices.runtime
const packaged = JSON.parse(extractFile(asar, 'package.json').toString())
assert.equal(packaged.version, '0.1.0')
assert.equal(packaged.main, './out/main/index.js')
const roots = [...new Set(listPackage(asar).map(p => p.replaceAll('\\', '/').split('/').filter(Boolean)[0]))].sort()
assert.deepEqual(roots, ['node_modules', 'out', 'package.json'])
for (const runtime of notices.runtime) {
  const metadata = JSON.parse(extractFile(asar, `node_modules/${runtime.name}/package.json`).toString())
  assert.equal(metadata.version, runtime.version)
}
const main = extractFile(asar, 'out/main/index.js').toString()
for (const marker of ['PRAGMA user_version=19', 'policy-status', 'assistantRevision', 'pendingNavigation', 'contextIsolation: true', 'sandbox: true', 'nodeIntegration: false']) assert.ok(main.includes(marker), marker)
const preload = extractFile(asar, 'out/preload/index.cjs').toString()
assert.equal(preload.includes('node:sqlite'), false)
result.packaged = { version: packaged.version, main: packaged.main, dependencies: packaged.dependencies, roots, sourceCommit: manifest.commit, schema19AndColdNavigationAndPolicyStatus: true }
result.verdict = 'STATIC_PASS'
writeFileSync(evidence + 'delivery-014-release-v4-artifact-review.json', JSON.stringify(result, null, 2) + '\n')
