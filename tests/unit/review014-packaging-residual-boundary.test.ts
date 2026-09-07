import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
// @ts-expect-error The production build hook is JavaScript.
import { afterPack } from '../../build/after-pack.mjs'

const base = realpathSync.native(tmpdir())
const roots: string[] = []
const links: string[] = []
afterEach(() => {
  for (const link of links.splice(0)) unlinkSync(link)
  for (const root of roots.splice(0)) {
    if (dirname(root) !== base || realpathSync.native(root) !== root)
      throw Error('unsafe fixture root')
    rmSync(root, { recursive: true, force: true })
  }
})
function fixture() {
  const root = mkdtempSync(join(base, 'mashiro-review014-residual-'))
  roots.push(root)
  const output = join(root, 'output')
  mkdirSync(join(output, 'resources'), { recursive: true })
  writeFileSync(join(output, 'version'), '44.1.1')
  return {
    root,
    output,
    run: (appOutDir = output) =>
      afterPack({
        packager: { projectDir: root, appInfo: { productFilename: 'Mashiro' } },
        appOutDir
      })
  }
}
it('rejects a junction at the output root and preserves its target bytes', async () => {
  const f = fixture()
  writeFileSync(join(f.output, 'resources', 'default_app.asar'), 'keep-target')
  const link = join(f.root, 'output-alias')
  symlinkSync(f.output, link, 'junction')
  links.push(link)
  await expect(f.run(link)).rejects.toThrow('PACKAGING_UNSAFE_OUTPUT_ROOT')
  expect(readFileSync(join(f.output, 'resources', 'default_app.asar'), 'utf8')).toBe('keep-target')
  expect(readFileSync(join(f.output, 'version'), 'utf8')).toBe('44.1.1')
})
it('rejects a junction at the fixed residual entry without following it', async () => {
  const f = fixture()
  const target = join(f.root, 'foreign-target')
  mkdirSync(target)
  writeFileSync(join(target, 'keep.txt'), 'foreign')
  const link = join(f.output, 'resources', 'default_app.asar')
  symlinkSync(target, link, 'junction')
  links.push(link)
  await expect(f.run()).rejects.toThrow('PACKAGING_UNSAFE_RESIDUAL_ENTRY')
  expect(readFileSync(join(target, 'keep.txt'), 'utf8')).toBe('foreign')
  expect(readFileSync(join(f.output, 'version'), 'utf8')).toBe('44.1.1')
})
it('rejects an ordinary directory named as the residual instead of deleting recursively', async () => {
  const f = fixture()
  const target = join(f.output, 'resources', 'default_app.asar')
  mkdirSync(target)
  writeFileSync(join(target, 'keep.txt'), 'ordinary directory')
  await expect(f.run()).rejects.toThrow('PACKAGING_UNSAFE_RESIDUAL_ENTRY')
  expect(readFileSync(join(target, 'keep.txt'), 'utf8')).toBe('ordinary directory')
  expect(readFileSync(join(f.output, 'version'), 'utf8')).toBe('44.1.1')
})
