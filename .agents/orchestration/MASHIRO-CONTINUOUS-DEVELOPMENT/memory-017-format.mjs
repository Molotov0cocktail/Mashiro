import { readFileSync, writeFileSync, renameSync, unlinkSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { format, resolveConfig } from 'prettier'
const paths = [
  'src/shared/memory-round-contract.ts', 'src/shared/memory-contract.ts', 'src/shared/memory-channels.ts',
  'src/main/memory/memory-round-schema.ts', 'src/main/memory/memory-round-evidence.ts', 'src/main/memory/memory-round-query.ts',
  'src/main/memory/memory-service.ts', 'src/main/provider/provider-service.ts',
  'src/main/ipc/register-memory-ipc.ts', 'src/preload/index.ts',
  'tests/integration/memory-round.test.ts', 'tests/integration/memory-round-provider.test.ts', 'tests/unit/memory-round-ipc.test.ts'
]
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex').toUpperCase()
const results = []
for (const relative of paths) {
  const path = resolve('D:/Mashiro', relative)
  const before = readFileSync(path), preimage = hash(before)
  const after = Buffer.from(await format(before.toString('utf8'), { ...await resolveConfig(path), filepath: path }))
  const temp = path + '.017-tmp', backup = path + '.017-backup'
  if (existsSync(temp) || existsSync(backup)) throw Error('RESIDUAL')
  if (hash(readFileSync(path)) !== preimage) throw Error('PREIMAGE_CHANGED')
  writeFileSync(backup, before, { flag: 'wx' })
  writeFileSync(temp, after, { flag: 'wx' })
  try {
    if (hash(readFileSync(path)) !== preimage) throw Error('PREIMAGE_CHANGED')
    renameSync(temp, path)
    if (hash(readFileSync(path)) !== hash(after)) throw Error('POSTIMAGE')
    unlinkSync(backup)
  } catch (error) {
    renameSync(backup, path)
    if (existsSync(temp)) unlinkSync(temp)
    throw error
  }
  results.push({ path: relative, preimage, sha256: hash(after) })
}
console.log(JSON.stringify(results, null, 2))
