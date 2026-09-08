import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import process from 'node:process'
import console from 'node:console'
import { Buffer } from 'node:buffer'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, lstatSync, realpathSync } from 'node:fs'
import { basename, resolve, relative, isAbsolute } from 'node:path'

// Coordinator transport only. A final independent release PASS is required before --execute.
// Never delete/replace assets, rewrite a tag, or modify repository settings.
const root = 'D:/Mashiro'
const repo = 'Molotov0cocktail/Mashiro'
const api = `https://api.github.com/repos/${repo}`
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
const [planPath, mode = '--validate'] = process.argv.slice(2)
assert.ok(planPath && ['--validate', '--execute'].includes(mode), 'ARGUMENTS')
const plan = JSON.parse(readFileSync(planPath, 'utf8'))
assert.equal(plan.repository, repo)
assert.match(plan.commit, /^[a-f0-9]{40}$/)
assert.match(plan.tag, /^v\d+\.\d+\.\d+$/)
assert.equal(plan.releaseVerdict, 'PASS')
assert.equal(plan.prerelease, false)
const git = (...args) => execFileSync('D:/Git/Git/cmd/git.exe', ['-c', 'safe.directory=D:/Mashiro', ...args], {
  cwd: root, encoding: 'utf8', timeout: 30000, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe']
}).trim()
assert.equal(git('rev-parse', 'HEAD'), plan.commit, 'HEAD_CHANGED')
assert.equal(git('rev-parse', `${plan.tag}^{commit}`), plan.commit, 'TAG_CHANGED')
function file(path, expectedHash) {
  const target = resolve(root, path)
  const rel = relative(resolve(root), target)
  assert.ok(rel && !rel.startsWith('..') && !isAbsolute(rel), 'OUTSIDE_PROJECT')
  assert.ok(lstatSync(target).isFile() && !lstatSync(target).isSymbolicLink(), 'NOT_REGULAR_FILE')
  assert.equal(realpathSync.native(target).toLowerCase(), target.toLowerCase(), 'LINKED_PATH')
  const bytes = readFileSync(target)
  assert.equal(hash(bytes), expectedHash.toLowerCase(), 'FILE_HASH_CHANGED')
  return bytes
}
file(plan.review.path, plan.review.sha256)
const body = file(plan.notes.path, plan.notes.sha256).toString('utf8')
assert.ok(body.includes(plan.commit) && body.includes(plan.tag), 'NOTES_IDENTITY')
assert.ok(plan.assets.length >= 3 && plan.assets.length <= 10, 'ASSET_COUNT')
assert.equal(new Set(plan.assets.map(a => a.name)).size, plan.assets.length)
const assets = plan.assets.map(a => {
  assert.equal(basename(a.path), a.name)
  assert.match(a.name, /^[A-Za-z0-9][A-Za-z0-9._-]+$/)
  const bytes = file(a.path, a.sha256)
  assert.equal(bytes.length, a.bytes)
  return { ...a, bytes }
})
assert.ok(assets.some(a => a.name === `Mashiro-${plan.tag.slice(1)}-win-x64-setup.exe`))
assert.ok(assets.some(a => a.name === 'SHA256SUMS.txt'))
const report = { repository: repo, tag: plan.tag, commit: plan.commit, mode, startedAt: new Date().toISOString(), assets: [] }
if (mode === '--validate') {
  console.log(JSON.stringify({ ...report, verdict: 'LOCAL_VALIDATION_ONLY', assetCount: assets.length }))
  process.exit(0)
}

const attempt = randomUUID()
let sequence = 0
let reportPath
function checkpoint(stage) {
  report.stage = stage
  report.observedAt = new Date().toISOString()
  report.attempt = attempt
  reportPath = resolve(root, '.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT',
    `release-${plan.tag}-${attempt}-${String(++sequence).padStart(3, '0')}.json`)
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' })
}
checkpoint('LOCAL_INPUTS_VALIDATED')
try {
// Credentials remain in memory and are never included in errors, headers logs, or reports.
let credential
try {
  credential = execFileSync('D:/Git/Git/cmd/git.exe', ['-c', 'safe.directory=D:/Mashiro', 'credential', 'fill'], {
    cwd: root, input: 'protocol=https\nhost=github.com\npath=Molotov0cocktail/Mashiro.git\n\n',
    encoding: 'utf8', timeout: 30000, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' }
  })
} catch { throw Error('GITHUB_CREDENTIAL_UNAVAILABLE') }
const token = credential.split(/\r?\n/).find(line => line.startsWith('password='))?.slice(9)
assert.ok(token, 'GITHUB_CREDENTIAL_UNAVAILABLE')
async function request(url, method = 'GET', value, contentType = 'application/json') {
  assert.ok(url.startsWith(api + '/') || url === api || url.startsWith(`https://uploads.github.com/repos/${repo}/releases/`), 'REQUEST_TARGET')
  const response = await globalThis.fetch(url, {
    method, redirect: 'error', signal: globalThis.AbortSignal.timeout(method === 'POST' ? 180000 : 30000),
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2026-03-10', 'Content-Type': contentType },
    body: value === undefined ? undefined : Buffer.isBuffer(value) ? value : JSON.stringify(value)
  })
  if (response.status === 404 && method === 'GET') return null
  if (!response.ok) throw Error(`GITHUB_${method}_HTTP_${response.status}`)
  return response.json()
}
const identity = await request(api)
assert.equal(identity?.id, 1353930434)
assert.equal(identity.full_name, repo)
assert.equal(identity.private, false)
assert.equal(identity.archived, false)
assert.equal(identity.permissions?.push, true)
const remoteTag = await request(`${api}/git/ref/tags/${plan.tag}`)
assert.equal(remoteTag?.object.type, 'commit', 'EXPECTED_LIGHTWEIGHT_TAG')
assert.equal(remoteTag.object.sha, plan.commit, 'REMOTE_TAG_CHANGED')
assert.equal((await request(`${api}/branches/main`))?.commit.sha, plan.commit, 'REMOTE_MAIN_CHANGED')
let release = await request(`${api}/releases/tags/${plan.tag}`)
if (!release) {
  // Authenticated listing also finds a draft if the by-tag endpoint does not expose it.
  for (let page = 1; page <= 10; page++) {
    const entries = await request(`${api}/releases?per_page=100&page=${page}`)
    const matching = entries.filter(entry => entry.tag_name === plan.tag)
    assert.ok(matching.length <= 1, 'DUPLICATE_RELEASE')
    if (matching.length) { release = matching[0]; break }
    if (entries.length < 100) break
    assert.ok(page < 10, 'RELEASE_LOOKUP_LIMIT')
  }
}
if (!release) {
checkpoint('DRAFT_CREATE_PENDING')
release = await request(`${api}/releases`, 'POST', {
  tag_name: plan.tag, target_commitish: plan.commit, name: plan.tag, body,
  draft: true, prerelease: false, generate_release_notes: false
})
}
assert.equal(release.tag_name, plan.tag)
assert.equal(release.body, body, 'EXISTING_RELEASE_DIFFERS')
assert.equal(release.prerelease, false)
assert.ok(release.assets.every(a => assets.some(wanted => wanted.name === a.name)), 'UNEXPECTED_EXISTING_ASSET')
report.releaseId = release.id
checkpoint(release.draft ? 'DRAFT_CONFIRMED' : 'EXISTING_PUBLIC_RELEASE_CONFIRMED')
for (const asset of assets) {
  let uploaded = release.assets.find(a => a.name === asset.name)
  if (!uploaded) {
    assert.equal(release.draft, true, 'NEVER_MODIFY_PUBLISHED_RELEASE_ASSETS')
    report.pendingAsset = asset.name
    checkpoint('ASSET_UPLOAD_PENDING')
    uploaded = await request(`https://uploads.github.com/repos/${repo}/releases/${release.id}/assets?name=${encodeURIComponent(asset.name)}`,
      'POST', asset.bytes, asset.contentType)
  }
  assert.equal(uploaded.state, 'uploaded')
  assert.equal(uploaded.size, asset.bytes.length)
  assert.equal(uploaded.digest, `sha256:${hash(asset.bytes)}`, 'UPLOAD_DIGEST')
  report.assets.push({ id: uploaded.id, name: uploaded.name, bytes: uploaded.size, sha256: hash(asset.bytes), url: uploaded.browser_download_url })
  delete report.pendingAsset
  checkpoint('ASSET_DIGEST_VERIFIED')
}
if (release.draft) {
  checkpoint('PUBLISH_PENDING')
  release = await request(`${api}/releases/${release.id}`, 'PATCH', { draft: false, make_latest: 'true' })
}
assert.equal(release.draft, false)
// Draft download URLs may change on publication. Reconcile the public asset identity
// before anonymous download; never mutate an existing published asset.
release = await request(`${api}/releases/${release.id}`)
assert.equal(release.id, report.releaseId, 'PUBLIC_RELEASE_ID_CHANGED')
assert.equal(release.tag_name, plan.tag, 'PUBLIC_RELEASE_TAG_CHANGED')
assert.equal(release.draft, false, 'RELEASE_NOT_PUBLIC')
assert.equal(release.body, body, 'PUBLIC_RELEASE_BODY_CHANGED')
assert.equal(release.prerelease, false)
assert.equal(release.assets.length, report.assets.length, 'PUBLIC_ASSET_COUNT_CHANGED')
for (const asset of report.assets) {
  const published = release.assets.find(entry => entry.id === asset.id)
  assert.ok(published, 'PUBLIC_ASSET_ID_CHANGED')
  assert.equal(published.name, asset.name, 'PUBLIC_ASSET_NAME_CHANGED')
  assert.equal(published.state, 'uploaded')
  assert.equal(published.size, asset.bytes, 'PUBLIC_ASSET_SIZE_CHANGED')
  assert.equal(published.digest, `sha256:${asset.sha256}`, 'PUBLIC_ASSET_DIGEST_CHANGED')
  asset.url = published.browser_download_url
}
report.releaseUrl = release.html_url
checkpoint('PUBLIC_RELEASE_CONFIRMED')
for (const asset of report.assets) {
  assert.equal(asset.url, `https://github.com/${repo}/releases/download/${plan.tag}/${asset.name}`, 'DOWNLOAD_TARGET')
  const response = await globalThis.fetch(asset.url, { signal: globalThis.AbortSignal.timeout(180000) })
  assert.equal(response.ok, true, 'PUBLIC_DOWNLOAD_FAILED')
  const bytes = Buffer.from(await response.arrayBuffer())
  assert.equal(bytes.length, asset.bytes, 'DOWNLOAD_SIZE')
  assert.equal(hash(bytes), asset.sha256, 'DOWNLOAD_HASH')
  asset.downloadVerified = true
  checkpoint('PUBLIC_ASSET_DOWNLOAD_VERIFIED')
}
report.completedAt = new Date().toISOString()
report.verdict = 'PUBLISHED_AND_PUBLIC_DOWNLOAD_VERIFIED'
checkpoint('COMPLETE')
console.log(JSON.stringify({ ...report, reportPath }))
} catch (error) {
  report.lastStage = report.stage
  report.verdict = 'FAILED_OR_UNCERTAIN_RECONCILE_EXISTING_RELEASE_BEFORE_RETRY'
  report.errorCode = error instanceof Error && /^[A-Z][A-Z0-9_]+$/.test(error.message)
    ? error.message : 'TRANSPORT_OR_ASSERTION_FAILURE'
  checkpoint('STOPPED')
  console.error(JSON.stringify({ verdict: report.verdict, errorCode: report.errorCode, reportPath }))
  process.exitCode = 1
}
