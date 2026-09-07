import process from 'node:process'
import { setTimeout, clearTimeout } from 'node:timers'
import { createServer } from 'node:net'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { fileURLToPath, URL } from 'node:url'
import { writeFileSync } from 'node:fs'
import assert from 'node:assert/strict'

// Synthetic, local-only qualification. No dataset or application registration is touched.
const script = fileURLToPath(import.meta.url)
if (process.argv[2] === 'hold') {
  const endpoint = process.argv[3]
  if (!endpoint?.startsWith('\\\\.\\pipe\\mashiro-lock-qualification-'))
    throw new Error('Unexpected synthetic endpoint')
  const server = createServer((socket) => socket.destroy())
  server.once('error', (error) => {
    process.send?.({ state: 'error', code: error.code })
    server.close()
    process.disconnect?.()
  })
  server.listen(endpoint, () => process.send?.({ state: 'acquired', pid: process.pid }))
} else {
  const endpoint = '\\\\.\\pipe\\mashiro-lock-qualification-' + randomUUID()
  const children = []
  const acquire = () => {
    const child = spawn(process.execPath, [script, 'hold', endpoint], {
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe', 'ipc']
    })
    children.push(child)
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Lock observation timeout')), 5000)
      child.once('error', (error) => {
        clearTimeout(timer)
        reject(error)
      })
      child.once('message', (message) => {
        clearTimeout(timer)
        resolve({ child, message })
      })
    })
  }
  const stop = async (child) => {
    if (child.exitCode !== null || child.signalCode !== null) return
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Owned child exit timeout')), 5000)
      child.once('exit', () => {
        clearTimeout(timer)
        resolve()
      })
      child.kill()
    })
  }
  try {
    assert.equal(process.platform, 'win32')
    const first = await acquire()
    assert.equal(first.message.state, 'acquired')
    const second = await acquire()
    assert.deepEqual(second.message, { state: 'error', code: 'EADDRINUSE' })
    await stop(first.child)
    const afterCrash = await acquire()
    assert.equal(afterCrash.message.state, 'acquired')
    assert.notEqual(afterCrash.message.pid, first.message.pid)
    const result = {
      state: 'SUPPORTED',
      platform: process.platform,
      node: process.versions.node,
      firstPid: first.message.pid,
      contender: second.message,
      afterTerminatedOwnerPid: afterCrash.message.pid,
      localNamedPipeOnly: true,
      realDataAccess: false,
      productionIntegration: false
    }
    writeFileSync(new URL('./delivery-014-lock-spike-result.json', import.meta.url),
      JSON.stringify(result, null, 2) + '\n', { flag: 'wx' })
    process.stdout.write(JSON.stringify(result) + '\n')
  } finally {
    await Promise.all(children.map(stop))
  }
}
