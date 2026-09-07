import process from 'node:process'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, relative } from 'node:path'
import { createHash } from 'node:crypto'

const root = 'D:/Mashiro'
const git = args => execFileSync('D:/Git/Git/cmd/git.exe', ['-c', 'safe.directory=D:/Mashiro', ...args], { cwd: root, encoding: 'utf8', windowsHide: true })
const output = process.argv[2]
if (!output || !/^steward-013-scan-[a-z0-9-]+\.json$/.test(output)) throw Error('EXACT_NEW_REPORT_NAME_REQUIRED')
const files = [...new Set([
  ...git(['diff', '--name-only', '-z']).split('\0'),
  ...git(['ls-files', '--others', '--exclude-standard', '-z']).split('\0')
].filter(Boolean))].sort()
const secretFindings = [], residuals = [], generated = []
const hashes = []
for (const file of files) {
  const path = resolve(root, file)
  if (relative(root, path).startsWith('..')) throw Error('SCOPE_ESCAPE')
  if (!existsSync(path)) continue
  if (/\.(?:bak|tmp|swp)$|controlled-.*backup/i.test(file)) residuals.push(file)
  if (/\.(?:sqlite|sqlite-wal|sqlite-shm|exe|dll|asar|map)$/.test(file)) generated.push(file)
  const bytes = readFileSync(path)
  hashes.push({ path: file, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') })
  if (!/\.(?:ts|tsx|js|mjs|cjs|json|md|txt|ps1|yml|yaml)$/.test(file)) continue
  const text = bytes.toString('utf8')
  const patterns = [/[a-f0-9]{32}\.[A-Za-z0-9]{16,}/g, /\bsk-[A-Za-z0-9_-]{24,}\b/g, /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g]
  patterns.forEach((pattern, index) => {
    for (const match of text.matchAll(pattern)) secretFindings.push({ path: file, pattern: index, line: text.slice(0, match.index).split('\n').length })
  })
}
let diffCheck = 0
try { git(['diff', '--check']) } catch { diffCheck = 1 }
const report = { recordedAt: new Date().toISOString(), scannedFiles: hashes.length, secretFindings, residuals, generated, diffCheck, hashes }
writeFileSync(resolve(root, '.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT', output), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' })
process.stdout.write(JSON.stringify({ scannedFiles: hashes.length, secretFindings, residuals, generated, diffCheck }) + '\n')
if (secretFindings.length || residuals.length || generated.length || diffCheck) process.exitCode = 1
