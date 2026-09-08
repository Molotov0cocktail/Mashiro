import { URL } from 'node:url'
import console from 'node:console'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

const path = new URL('./release-transport-v2.mjs', import.meta.url)
const source = readFileSync(path, 'utf8')
const sha256 = createHash('sha256').update(source).digest('hex')
assert.equal(sha256, 'c28b246fca559f730b6f45fc156e7c331b67bf1ca396a92b5a06b35a1c232e07')
const start = source.indexOf('// Draft download URLs may change on publication.')
const end = source.indexOf('report.releaseUrl = release.html_url', start)
assert.ok(start > 0 && end > start)
const guard = source.split('\n').find(line => line.includes("'DOWNLOAD_TARGET'"))
assert.ok(guard)
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
// Execute exact candidate reconciliation and URL guard, not its credential/Git/network entrypoint.
const run = new AsyncFunction('assert', 'request', 'release', 'report', 'api', 'plan', 'body', 'repo',
  source.slice(start, end) + '\nfor (const asset of report.assets) {' + guard + '}\nreturn report')
const repo = 'Molotov0cocktail/Mashiro'
const url = `https://github.com/${repo}/releases/download/v0.1.0/setup.exe`
function fixture() {
  return {
    report: { releaseId: 42, assets: [{ id: 7, name: 'setup.exe', bytes: 3, sha256: 'a'.repeat(64), url: `https://github.com/${repo}/releases/download/untagged-old/setup.exe` }] },
    release: { id: 42, tag_name: 'v0.1.0', draft: false, body: 'approved', prerelease: false,
      assets: [{ id: 7, name: 'setup.exe', size: 3, digest: 'sha256:' + 'a'.repeat(64), state: 'uploaded', browser_download_url: url }] }
  }
}
async function check(change) {
  const f = fixture()
  change?.(f.release)
  const calls = []
  const result = await run(assert, async (...args) => {
    calls.push(args)
    assert.deepEqual(args, ['https://api.github.com/repos/' + repo + '/releases/42'])
    return f.release
  }, { id: 42 }, f.report, 'https://api.github.com/repos/' + repo, { tag: 'v0.1.0' }, 'approved', repo)
  assert.equal(calls.length, 1)
  return result
}
const old = fixture()
assert.notEqual(old.report.assets[0].url, url) // Original cached-draft value fails the existing guard.
assert.equal((await check()).assets[0].url, url)
const changes = [
  r => { r.id++ }, r => { r.tag_name = 'v9.0.0' }, r => { r.draft = true },
  r => { r.body = 'changed' }, r => { r.prerelease = true }, r => { r.assets = [] },
  r => { r.assets[0].id++ }, r => { r.assets[0].name = 'other.exe' },
  r => { r.assets[0].size++ }, r => { r.assets[0].digest = 'sha256:' + 'b'.repeat(64) },
  r => { r.assets[0].state = 'new' }, r => { r.assets[0].browser_download_url = 'https://example.invalid/setup.exe' }
]
for (const change of changes) await assert.rejects(check(change), assert.AssertionError)
console.log(JSON.stringify({ verdict: 'PASS', candidateSha256: sha256, positive: 1, rejectedMutations: changes.length, networkCalls: 0, credentialReads: 0, scope: 'exact extracted reconciliation plus unchanged download URL assertion' }))
