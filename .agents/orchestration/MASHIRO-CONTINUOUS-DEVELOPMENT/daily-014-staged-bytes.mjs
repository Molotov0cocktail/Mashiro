import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import process from 'node:process'

const root = 'D:/Mashiro'
const git = args => execFileSync('D:/Git/Git/cmd/git.exe', ['-c', 'safe.directory=D:/Mashiro', ...args], { cwd: root, windowsHide: true, maxBuffer: 32 * 1024 * 1024 })
const output = resolve(root, '.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/daily-014-staged-bytes-01.json')
if (existsSync(output)) throw Error('REPORT_EXISTS')
const paths = git(['diff', '--cached', '--name-only', '-z']).toString().split('\0').filter(Boolean)
const files = [], mismatches = [], normalizedDocs = []
for (const path of paths) {
  const blob = git(['show', ':' + path])
  const working = readFileSync(resolve(root, path))
  if (!blob.equals(working)) {
    if (path.startsWith('doc/') && path.endsWith('.md') && blob.equals(Buffer.from(working.toString('utf8').replace(/\r\n/g, '\n')))) normalizedDocs.push(path)
    else mismatches.push(path)
  }
  files.push({ path, bytes: blob.length, sha256: createHash('sha256').update(blob).digest('hex') })
}
const report = { scope: 'staged candidate before this evidence file; source and raw evidence exact bytes; text policy may normalize documented Markdown only', base: git(['rev-parse', 'HEAD']).toString().trim(), stagedPaths: paths.length, mismatches, normalizedDocs, files }
writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' })
process.stdout.write(JSON.stringify({ stagedPaths: paths.length, mismatches, normalizedDocs }) + '\n')
if (mismatches.length) process.exitCode = 1
