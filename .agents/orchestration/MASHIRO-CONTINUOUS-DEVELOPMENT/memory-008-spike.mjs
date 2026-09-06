import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, renameSync, openSync, fsyncSync, closeSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
const root = mkdtempSync(join(tmpdir(), 'mashiro-memory-008-'))
const sha = (v) => createHash('sha256').update(v).digest('hex')
const results = []
for (const window of ['intent', 'temp', 'file', 'transaction', 'commit', 'stale', 'deleted', 'tampered', 'legacy-red']) {
  const dir = join(root, window); mkdirSync(dir)
  const file = join(dir, 'v2.md'); const temp = join(dir, 'v2.tmp')
  const dbPath = join(dir, 'state.sqlite')
  let db = new DatabaseSync(dbPath)
  db.exec('PRAGMA synchronous=FULL; CREATE TABLE object(id TEXT PRIMARY KEY, version INTEGER, accepted TEXT, suppressed INTEGER); CREATE TABLE intent(id TEXT PRIMARY KEY, expected INTEGER, hash TEXT, state TEXT); CREATE TABLE receipt(id TEXT PRIMARY KEY, state TEXT); INSERT INTO object VALUES(\'m\',1,NULL,0)')
  const body = '# Synthetic memory\nUser corrected value\n'
  db.prepare('INSERT INTO intent VALUES(?,?,?,?)').run('op', 1, sha(body), 'PREPARED')
  if (window !== 'intent') {
    writeFileSync(temp, body, { flag: 'wx' }); const fd = openSync(temp, 'r+'); fsyncSync(fd); closeSync(fd)
    if (window !== 'temp') renameSync(temp, file)
  }
  if (window === 'stale') db.exec('UPDATE object SET version=2')
  if (window === 'deleted') db.exec('UPDATE object SET version=2,suppressed=1')
  if (['transaction', 'commit', 'tampered', 'legacy-red'].includes(window)) {
    db.exec('BEGIN IMMEDIATE')
    db.prepare('UPDATE object SET version=2,accepted=? WHERE version=1 AND suppressed=0').run(file)
    if (window !== 'legacy-red') {
      db.exec("INSERT INTO receipt VALUES('op','SUCCEEDED'); UPDATE intent SET state='ACCEPTED'")
    }
    if (window !== 'transaction') db.exec('COMMIT')
  }
  db.close() // unfinished SQLite transaction rolls back; models process teardown, not power loss.
  if (window === 'tampered') writeFileSync(file, 'external edit')
  db = new DatabaseSync(dbPath)
  const object = db.prepare('SELECT * FROM object').get()
  const receipt = db.prepare('SELECT * FROM receipt').get()
  const validBody = object.accepted && existsSync(object.accepted) && sha(readFileSync(object.accepted)) === sha(body)
  const recalled = object.suppressed === 0 && validBody ? readFileSync(object.accepted, 'utf8') : null
  if (window === 'legacy-red') {
    assert.equal(object.version, 2); assert.equal(receipt, undefined)
    results.push({ window, result: 'RED_REPRODUCED', defect: 'accepted business without success receipt' })
  } else if (window === 'commit') {
    assert.equal(receipt.state, 'SUCCEEDED'); assert.equal(recalled, body)
    results.push({ window, result: 'GREEN', accepted: true, receipt: true })
  } else if (window === 'tampered') {
    assert.equal(receipt.state, 'SUCCEEDED'); assert.equal(recalled, null)
    results.push({ window, result: 'GREEN', historicalReceipt: true, currentRecallBlocked: true })
  } else {
    assert.equal(receipt, undefined); assert.equal(recalled, null)
    // Recovery adjudicates, never blindly accepts a pending file or replays a business write.
    db.prepare("UPDATE intent SET state='NOT_APPLIED' WHERE state='PREPARED'").run()
    assert.equal(db.prepare('SELECT version FROM object').get().version, ['stale', 'deleted'].includes(window) ? 2 : 1)
    results.push({ window, result: 'GREEN', accepted: false, receipt: false })
  }
  db.close()
}
console.log(JSON.stringify({ runtime: process.version, root, results, limitations: ['synthetic isolated spike', 'close rolls back uncommitted transaction; no hard process kill or power-loss claim', 'temporary synthetic files retained at exact root for inspection'] }, null, 2))
