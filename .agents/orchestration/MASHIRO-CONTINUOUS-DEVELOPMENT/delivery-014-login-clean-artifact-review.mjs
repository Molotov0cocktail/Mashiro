import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, lstatSync, writeFileSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { extractFile } from '@electron/asar'
import { renderOwnedFilesNsis } from '../../../build/installer-login-cleanup.mjs'

const evidence = '.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/'
const root = resolve('dist/windows-candidate-login-clean/win-unpacked')
const hash = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase()
const manifest = JSON.parse(readFileSync(evidence + 'delivery-014-login-clean-packaged-hashes.json', 'utf8'))
const result = { scope: 'read-only internal artifact static review; no executable runs', files: [], outputs: [], notices: [], owned: null }
for (const expected of manifest.files) {
  const bytes = readFileSync(expected.path)
  assert.equal(bytes.length, expected.bytes)
  assert.equal(hash(bytes), expected.sha256)
  result.files.push({ path: expected.path, bytes: bytes.length, sha256: hash(bytes) })
}
const asar = join(root, 'resources/app.asar')
for (const expected of JSON.parse(readFileSync(evidence + 'delivery-014-notification-build-output.json', 'utf8'))) {
  const bytes = extractFile(asar, 'out' + sep + expected.path.split(/[\\/]/).join(sep))
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
result.owned = { count: files.length, actualCount: owned.files.length, generatedSha256: hash(generated), generatedExactlyMatchesV3: true }
result.runtime = notices.runtime
result.verdict = 'STATIC_PASS'
writeFileSync(evidence + 'delivery-014-login-clean-artifact-review.json', JSON.stringify(result, null, 2) + '\n')
