import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import {
  chooseProductionData,
  type ProductionDialogs
} from '../../src/main/data/production-selection.js'

it('wires native default setup to a complete dataset while keeping Chromium state separate', async () => {
  const f = fixture(0)
  const { prepareProductionRuntimePaths, openProductionApplicationData } =
    await import('../../src/main/data/production-bootstrap.js')
  const pathsSet = new Map<string, string>()
  const paths = prepareProductionRuntimePaths({
    getPath() {
      return f.root
    },
    setPath(name, path) {
      pathsSet.set(name, path)
    }
  })
  expect(existsSync(paths.defaultDataDirectory)).toBe(false)
  expect(pathsSet.get('userData')).not.toBe(paths.defaultDataDirectory)
  const session = await openProductionApplicationData({
    paths,
    dialogs: f.dialogs,
    onOwnershipLost() {},
    assertQuiescent() {}
  })
  expect(session).not.toBeNull()
  const identity = session!.dataSetId
  try {
    expect(existsSync(session!.databasePath)).toBe(true)
    expect(session!.dataPath).toBe(paths.defaultDataDirectory)
  } finally {
    await session!.release()
  }
  const noPrompt: ProductionDialogs = {
    async showMessageBox() {
      throw new Error('UNEXPECTED_SETUP')
    },
    async showOpenDialog() {
      throw new Error('UNEXPECTED_SETUP')
    }
  }
  const reopened = await openProductionApplicationData({
    paths,
    dialogs: noPrompt,
    onOwnershipLost() {},
    assertQuiescent() {}
  })
  try {
    expect(reopened!.dataSetId).toBe(identity)
  } finally {
    await reopened?.release()
  }
})

it('bootstrap cancellation creates only runtime state and no business database', async () => {
  const f = fixture(3)
  const { prepareProductionRuntimePaths, openProductionApplicationData } =
    await import('../../src/main/data/production-bootstrap.js')
  const paths = prepareProductionRuntimePaths({
    getPath() {
      return f.root
    },
    setPath() {}
  })
  expect(
    await openProductionApplicationData({
      paths,
      dialogs: f.dialogs,
      onOwnershipLost() {},
      assertQuiescent() {}
    })
  ).toBeNull()
  expect(existsSync(paths.defaultDataDirectory)).toBe(false)
  expect(existsSync(join(paths.configurationDirectory, 'location.json'))).toBe(false)
})

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) {
    if (
      dirname(realpathSync.native(root)) !== realpathSync.native(tmpdir()) ||
      !basename(root).startsWith('mashiro-selection-test-')
    )
      throw new Error('TEST_CLEANUP_SCOPE')
    rmSync(root, { recursive: true, force: true })
  }
})
function fixture(response: number, selected?: string) {
  const root = mkdtempSync(join(realpathSync.native(tmpdir()), 'mashiro-selection-test-'))
  roots.push(root)
  const defaultPath = join(root, '默认 数据')
  const dialogs: ProductionDialogs = {
    showMessageBox: vi.fn(async () => ({ response })),
    showOpenDialog: vi.fn(async () => ({
      canceled: selected === undefined,
      filePaths: selected ? [selected] : []
    }))
  }
  return { root, defaultPath, dialogs }
}

it('does not create a default directory when the user cancels first setup', async () => {
  const f = fixture(3)
  expect(
    await chooseProductionData(
      { state: 'UNCONFIGURED', fingerprint: null },
      f.defaultPath,
      f.dialogs
    )
  ).toEqual({ action: 'cancel' })
  expect(existsSync(f.defaultPath)).toBe(false)
  expect(f.dialogs.showOpenDialog).not.toHaveBeenCalled()
})

it('creates an empty default directory only after the explicit default action', async () => {
  const f = fixture(0)
  expect(
    await chooseProductionData(
      { state: 'UNCONFIGURED', fingerprint: null },
      f.defaultPath,
      f.dialogs
    )
  ).toEqual({ action: 'create', directory: f.defaultPath })
  expect(existsSync(f.defaultPath)).toBe(true)
  expect(existsSync(join(f.defaultPath, 'mashiro.sqlite'))).toBe(false)
})

it('never treats a nonempty unrelated default folder as a fresh data set', async () => {
  const f = fixture(0)
  mkdirSync(f.defaultPath)
  writeFileSync(join(f.defaultPath, 'keep.txt'), 'keep')
  await expect(
    chooseProductionData({ state: 'UNCONFIGURED', fingerprint: null }, f.defaultPath, f.dialogs)
  ).rejects.toThrow()
  expect(readFileSync(join(f.defaultPath, 'keep.txt'), 'utf8')).toBe('keep')
  expect(existsSync(join(f.defaultPath, 'mashiro.sqlite'))).toBe(false)
})

it('cancelling recovery retains the original pointer and performs no fallback creation', async () => {
  const f = fixture(3)
  const locator = {
    formatVersion: 1 as const,
    dataSetId: '8507d20c-5b9e-4b4f-ad2f-2deaf6683ea3',
    dataPath: join(f.root, 'missing'),
    revision: '495a7523-f928-49b3-babe-b1a9e05356cc'
  }
  const before = JSON.stringify(locator)
  expect(
    await chooseProductionData(
      { state: 'RECOVERY', fingerprint: 'existing', reason: 'DATA_UNAVAILABLE', locator },
      f.defaultPath,
      f.dialogs
    )
  ).toEqual({ action: 'cancel' })
  expect(JSON.stringify(locator)).toBe(before)
  expect(existsSync(f.defaultPath)).toBe(false)
})

it('distinguishes explicit relocation of the known dataset from selecting another dataset', async () => {
  const f = fixture(0)
  const selected = join(f.root, '重新定位')
  mkdirSync(selected)
  f.dialogs.showOpenDialog = vi.fn(async () => ({ canceled: false, filePaths: [selected] }))
  const locator = {
    formatVersion: 1 as const,
    dataSetId: '8507d20c-5b9e-4b4f-ad2f-2deaf6686683',
    dataPath: join(f.root, 'old'),
    revision: '495a7523-f928-49b3-babe-b1a9e05356cc'
  }
  expect(
    await chooseProductionData(
      { state: 'RECOVERY', fingerprint: 'existing', reason: 'DATA_UNAVAILABLE', locator },
      f.defaultPath,
      f.dialogs
    )
  ).toEqual({ action: 'relocate', directory: selected })
})
