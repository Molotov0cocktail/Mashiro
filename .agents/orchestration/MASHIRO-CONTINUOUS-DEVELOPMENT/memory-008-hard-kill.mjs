/* global console, process, setTimeout, clearTimeout */
import { buildSync } from 'esbuild'
import { mkdtempSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fork, spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'
const root = mkdtempSync(join(tmpdir(), 'mashiro-memory-hard-kill-'))
const childPath = join(root, 'child.cjs')
buildSync({ entryPoints: ['.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/memory-008-hard-kill-child.ts'], outfile: childPath, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent' })
const results = []
for (const phase of ['intent', 'file-temp', 'file-ready', 'before-commit', 'after-commit']) {
  const directory = join(root, phase); mkdirSync(directory)
  const child = fork(childPath, [directory, phase], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'], windowsHide: true })
  const pid = child.pid
  let errors = ''
  child.stderr.on('data', bytes => { errors += bytes.toString() })
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { child.kill('SIGKILL'); reject(Error('phase timeout')) }, 15000)
    child.once('error', reject)
    child.once('exit', () => { clearTimeout(timeout); reject(Error('exited before phase: ' + errors)) })
    child.once('message', message => {
      assert.equal(message.phase, phase)
      child.removeAllListeners('exit')
      child.once('exit', () => { clearTimeout(timeout); resolve() })
      assert.equal(child.kill('SIGKILL'), true)
    })
  })
  const inspection = spawnSync(process.execPath, [childPath, directory, 'inspect'], { encoding: 'utf8', windowsHide: true, timeout: 15000 })
  assert.equal(inspection.status, 0, inspection.stderr)
  const evidence = JSON.parse(inspection.stdout)
  assert.equal(evidence.objects, phase === 'after-commit' ? 1 : 0)
  assert.equal(evidence.integrity, true)
  assert.deepEqual(evidence.states, [{ state: phase === 'after-commit' ? 'SUCCEEDED' : 'NOT_APPLIED' }])
  results.push({ phase, pid, terminated: true, ...evidence })
}
console.log(JSON.stringify({ root, node: process.version, result: 'SUPPORTED', results, limits: 'Actual child-process hard termination on Windows; not electrical power-loss or full Electron qualification. Synthetic temporary artifacts retained at exact root.' }, null, 2))
