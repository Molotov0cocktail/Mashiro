import { readFileSync, writeFileSync, mkdirSync, realpathSync, existsSync } from 'node:fs'
import { dirname, join, resolve, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import process from 'node:process'

// Internal Q10 preflight. No runtime credential/data access and no release upload.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'))
const output = resolve(process.argv[2] ?? '')
const temporaryRoot = realpathSync(tmpdir())
if (process.argv.length !== 3 || !output.startsWith(temporaryRoot + sep))
  throw new Error('Provide one new isolated output directory under the system temporary root')
if (realpathSync(dirname(output)) !== temporaryRoot || !output.split(sep).at(-1).startsWith('mashiro-notices-'))
  throw new Error('Output must be a direct, newly named mashiro-notices- child')
if (existsSync(output)) throw new Error('Output already exists; previous evidence will not be replaced')

const components = ['react', 'react-dom', 'scheduler', 'zod', 'electron']
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const entries = []
const packages = []
mkdirSync(output)
for (const name of components) {
  const directory = join(root, 'node_modules', name)
  const metadata = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'))
  if (metadata.version !== lock.packages['node_modules/' + name]?.version)
    throw new Error('Installed version differs from lockfile for ' + name)
  packages.push({ name, version: metadata.version, declaredLicense: metadata.license })
  const sources = name === 'electron'
    ? [['dist/LICENSE', 'electron-LICENSE.txt'], ['dist/LICENSES.chromium.html', 'electron-LICENSES.chromium.html']]
    : [['LICENSE', name + '-LICENSE.txt']]
  for (const [source, target] of sources) {
    const bytes = readFileSync(join(directory, source))
    const destination = join(output, target)
    writeFileSync(destination, bytes, { flag: 'wx' })
    if (sha256(readFileSync(destination)) !== sha256(bytes)) throw new Error('Notice copy mismatch')
    entries.push({ component: name, version: metadata.version, source: relative(root, join(directory, source)).split(sep).join('/'), file: target, bytes: bytes.length, sha256: sha256(bytes) })
  }
}
const index = '# Third-party notices preparation\n\n'
  + 'This internal preparation copies original notices for the current known runtime components. It is not the final packaged-component inventory, a project license grant, or an installer acceptance result.\n\n'
  + entries.map(entry => '- ' + entry.component + ' ' + entry.version + ': [' + entry.file + '](' + entry.file + ')').join('\n') + '\n'
writeFileSync(join(output, 'THIRD_PARTY_NOTICES.md'), index, { flag: 'wx' })
const manifest = {
  scope: 'preflight-known-current-runtime-only', finalArtifactVerified: false,
  lockfileSha256: sha256(readFileSync(join(root, 'package-lock.json'))), packages, files: entries
}
const json = JSON.stringify(manifest, null, 2) + '\n'
writeFileSync(join(output, 'notices-manifest.json'), json, { flag: 'wx' })
process.stdout.write(JSON.stringify({ outcome: 'COPIED_AND_HASH_VERIFIED', output, files: entries.length, bytes: entries.reduce((sum, item) => sum + item.bytes, 0), manifestSha256: sha256(json), finalArtifactVerified: false }) + '\n')
