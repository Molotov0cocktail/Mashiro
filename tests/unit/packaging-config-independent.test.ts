import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createPackage } from '@electron/asar'
import { afterEach, expect, it } from 'vitest'
// @ts-expect-error Build configuration is JavaScript and intentionally has no declaration file.
import config from '../../electron-builder.config.mjs'
// @ts-expect-error Build hook is JavaScript and intentionally has no declaration file.
import { afterPack } from '../../build/after-pack.mjs'

const roots: string[] = []
const versions = {
  react: '19.2.8',
  'react-dom': '19.2.8',
  scheduler: '0.27.0',
  zod: '4.5.4'
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

async function fixture(extraRuntime?: string) {
  const root = mkdtempSync(join(realpathSync.native(tmpdir()), 'mashiro-packaging-review-'))
  roots.push(root)
  const project = join(root, 'project')
  const source = join(root, 'asar-source')
  const output = join(root, 'output')
  const resources = join(output, 'resources')
  mkdirSync(resources, { recursive: true })
  const packages: Record<string, { version: string }> = {}
  for (const [name, version] of Object.entries(versions)) {
    const installed = join(project, 'node_modules', name)
    const archived = join(source, 'node_modules', name)
    mkdirSync(installed, { recursive: true })
    mkdirSync(archived, { recursive: true })
    writeFileSync(join(installed, 'package.json'), JSON.stringify({ name, version }))
    writeFileSync(join(installed, 'LICENSE'), 'original license for ' + name)
    writeFileSync(join(archived, 'package.json'), JSON.stringify({ name, version }))
    packages['node_modules/' + name] = { version }
  }
  if (extraRuntime) {
    const directory = join(source, 'node_modules', extraRuntime)
    mkdirSync(directory, { recursive: true })
    writeFileSync(
      join(directory, 'package.json'),
      JSON.stringify({ name: extraRuntime, version: '1.0.0' })
    )
  }
  writeFileSync(join(project, 'package-lock.json'), JSON.stringify({ packages }))
  writeFileSync(join(output, 'LICENSE.electron.txt'), 'electron license')
  writeFileSync(join(output, 'LICENSES.chromium.html'), 'chromium notices')
  await createPackage(source, join(resources, 'app.asar'))
  return { project, output }
}

it('locks distribution settings and generates an exact nonrecursive uninstall allowlist', async () => {
  expect(config).toMatchObject({
    asar: true,
    npmRebuild: false,
    forceCodeSigning: false,
    publish: null,
    nsis: {
      oneClick: false,
      perMachine: false,
      allowElevation: false,
      allowToChangeInstallationDirectory: true,
      deleteAppDataOnUninstall: false
    }
  })
  const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))
  expect(packageJson.devDependencies['electron-builder']).toBe('26.15.3')
  expect(packageJson.scripts['pack:windows']).toContain('--publish never')
  expect(packageJson.scripts['dist:windows']).toContain('--publish never')

  const f = await fixture()
  await afterPack({ packager: { projectDir: f.project }, appOutDir: f.output })
  const manifest = JSON.parse(
    readFileSync(join(f.output, 'resources', 'mashiro-program-files.json'), 'utf8')
  )
  expect(manifest.files).toContain('resources/elevate.exe')
  expect(manifest.files).toContain('resources/mashiro-program-files.json')
  expect(manifest.files.some((path: string) => path.split('/')[0]!.toLowerCase() === 'data')).toBe(
    false
  )
  expect(new Set(manifest.files).size).toBe(manifest.files.length)

  const macro = readFileSync(join(f.project, '.cache', 'packaging', 'owned-files.nsh'), 'utf8')
  const deletePrefix = '  Delete "$' + 'INSTDIR' + String.fromCharCode(92)
  const deleted = macro
    .split(String.fromCharCode(10))
    .filter((line) => line.startsWith(deletePrefix))
    .map((line) => line.slice(deletePrefix.length, -1).replaceAll(String.fromCharCode(92), '/'))
    .filter((path) => path !== '$' + '{UNINSTALL_FILENAME}')
  expect(deleted.sort()).toEqual([...manifest.files].sort())
  expect(macro).not.toContain('RMDir /r')
  expect(macro).toContain('Abort "Mashiro program file is busy; data has been preserved."')

  const notices = JSON.parse(
    readFileSync(join(f.output, 'resources', 'third-party-notices', 'index.json'), 'utf8')
  )
  expect(notices.runtime).toEqual(
    Object.entries(versions).map(([name, version]) => ({ name, version }))
  )
  for (const entry of notices.files) {
    const noticePath = join(f.output, 'resources', 'third-party-notices', entry.file)
    expect(createHash('sha256').update(readFileSync(noticePath)).digest('hex')).toBe(entry.sha256)
  }
})

it('blocks an unreviewed package found in the actual ASAR inventory', async () => {
  const f = await fixture('unexpected-runtime')
  await expect(
    afterPack({ packager: { projectDir: f.project }, appOutDir: f.output })
  ).rejects.toThrow('PACKAGING_RUNTIME_NOTICE_COVERAGE')
})

it('refuses to turn a top-level data directory into uninstall-owned content', async () => {
  const f = await fixture()
  mkdirSync(join(f.output, 'data'))
  await expect(
    afterPack({ packager: { projectDir: f.project }, appOutDir: f.output })
  ).rejects.toThrow('PACKAGING_UNSAFE_REMOVAL_PATH')
})
