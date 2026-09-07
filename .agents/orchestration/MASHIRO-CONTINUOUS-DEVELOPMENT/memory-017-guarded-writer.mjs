import { readFileSync, writeFileSync, renameSync, unlinkSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex').toUpperCase()
const root = 'D:/Mashiro/'
const plan = JSON.parse(readFileSync(process.argv[2], 'utf8'))
for (const edit of plan) {
  const path = resolve(root, edit.path)
  if (!path.replaceAll('\\', '/').startsWith(root) || edit.path.includes('..')) throw Error('ALLOWLIST')
  const before = readFileSync(path)
  if (digest(before) !== edit.hash) throw Error('PREIMAGE ' + edit.path)
  const newline = before.includes(Buffer.from('\r\n')) ? '\r\n' : '\n'
  let after = before.toString('utf8').replaceAll('\r\n', '\n')
  for (const [oldValue, newValue] of edit.replacements) {
    if (after.split(oldValue).length !== 2) throw Error('MATCH ' + edit.path)
    after = after.replace(oldValue, newValue)
  }
  const bytes = Buffer.from(after.replaceAll('\n', newline))
  const temp = path + '.017-tmp', backup = path + '.017-backup'
  if (existsSync(temp) || existsSync(backup)) throw Error('RESIDUAL')
  writeFileSync(backup, before, { flag: 'wx' })
  writeFileSync(temp, bytes, { flag: 'wx' })
  try {
    if (digest(readFileSync(path)) !== edit.hash) throw Error('RACE')
    renameSync(temp, path)
    if (digest(readFileSync(path)) !== digest(bytes)) throw Error('POSTIMAGE')
    console.log(JSON.stringify({ path: edit.path, before: edit.hash, after: digest(bytes) }))
    unlinkSync(backup)
  } catch (error) {
    renameSync(backup, path)
    if (existsSync(temp)) unlinkSync(temp)
    throw error
  }
}
