import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync, readdirSync, lstatSync } from 'node:fs'
import { join, resolve, relative, sep } from 'node:path'
import { inspectPackagedRuntime } from './inspect-runtime.mjs'
import { renderOwnedFilesNsis } from './installer-login-cleanup.mjs'

const hash = (value) => createHash('sha256').update(value).digest('hex')

export async function afterPack(context) {
  const root = context.packager.projectDir
  const output = context.appOutDir
  const notices = join(output, 'resources', 'third-party-notices')
  mkdirSync(notices, { recursive: true })
  const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'))
  const entries = []
  const runtime = inspectPackagedRuntime(join(output, 'resources', 'app.asar'))
  const expected = ['react', 'react-dom', 'scheduler', 'zod']
  if (runtime.length !== expected.length || runtime.some((item) => !expected.includes(item.name)))
    throw new Error('PACKAGING_RUNTIME_NOTICE_COVERAGE')
  for (const name of expected) {
    const directory = join(root, 'node_modules', name)
    const metadata = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'))
    if (
      metadata.version !== lock.packages['node_modules/' + name]?.version ||
      runtime.find((item) => item.name === name)?.version !== metadata.version
    )
      throw new Error('PACKAGING_RUNTIME_VERSION_MISMATCH')
    const bytes = readFileSync(join(directory, 'LICENSE'))
    const filename = name + '-LICENSE.txt'
    writeFileSync(join(notices, filename), bytes)
    entries.push({
      component: name,
      version: metadata.version,
      file: filename,
      sha256: hash(bytes)
    })
  }
  // Electron's original LICENSE and Chromium notices are already copied by the packager.
  for (const filename of ['LICENSE.electron.txt', 'LICENSES.chromium.html']) {
    const bytes = readFileSync(join(output, filename))
    entries.push({ component: 'Electron/Chromium', file: '../../' + filename, sha256: hash(bytes) })
  }
  writeFileSync(
    join(notices, 'index.json'),
    JSON.stringify({ scope: 'packaged-runtime', runtime, files: entries }, null, 2) + '\n'
  )
  const files = []
  const directories = []
  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (lstatSync(path).isSymbolicLink()) throw new Error('PACKAGING_UNSAFE_ENTRY')
      const name = relative(output, path).split(sep).join('/')
      if (
        !/^[A-Za-z0-9_. /-]+$/.test(name) ||
        name.split('/').includes('..') ||
        name.split('/')[0].toLowerCase() === 'data'
      )
        throw new Error('PACKAGING_UNSAFE_REMOVAL_PATH')
      if (entry.isDirectory()) {
        directories.push(name)
        walk(path)
      } else if (entry.isFile()) files.push(name)
      else throw new Error('PACKAGING_UNSAFE_ENTRY')
    }
  }
  walk(output)
  // NSIS injects elevate.exe after afterPack; the exact reserved helper was verified in the early spike.
  files.push('resources/elevate.exe', 'resources/mashiro-program-files.json')
  const owned = [...new Set(files)].sort()
  writeFileSync(
    join(output, 'resources', 'mashiro-program-files.json'),
    JSON.stringify({ formatVersion: 1, files: owned }, null, 2) + '\n'
  )
  const generated = resolve(root, '.cache', 'packaging')
  mkdirSync(generated, { recursive: true })
  const productFilename = context.packager.appInfo?.productFilename
  if (typeof productFilename !== 'string' || !/^[A-Za-z0-9 ._-]+$/.test(productFilename))
    throw new Error('PACKAGING_EXECUTABLE_FILENAME_UNAVAILABLE')
  writeFileSync(
    join(generated, 'owned-files.nsh'),
    renderOwnedFilesNsis(owned, directories, { executableFilename: productFilename + '.exe' })
  )
}
