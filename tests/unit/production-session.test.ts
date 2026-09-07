import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  existsSync,
  renameSync
} from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, expect, it, vi } from 'vitest'
import {
  openProductionSession,
  type ProductionSession
} from '../../src/main/data/production-session.js'
import { ProductionLocationStore } from '../../src/main/data/production-location.js'
import { SqliteStore } from '../../src/main/data/sqlite.js'

const roots: string[] = []
const sessions: ProductionSession[] = []
afterEach(async () => {
  await Promise.all(sessions.splice(0).map((session) => session.release()))
  for (const root of roots.splice(0)) {
    const actual = realpathSync.native(root)
    if (
      dirname(actual) !== realpathSync.native(tmpdir()) ||
      !basename(actual).startsWith('mashiro-session-')
    )
      throw Error('UNOWNED_TEST_ROOT')
    rmSync(actual, { recursive: true, force: true })
  }
})
const fixture = () => {
  const root = mkdtempSync(join(realpathSync.native(tmpdir()), 'mashiro-session-'))
  roots.push(root)
  const config = join(root, '配置 Settings'),
    data = join(root, '安装 Mashiro', 'data')
  mkdirSync(config)
  mkdirSync(data, { recursive: true })
  return { root, config, data, locator: join(config, 'location.json') }
}
const keep = (session: ProductionSession | null) => {
  if (!session) throw Error('SESSION_REQUIRED')
  sessions.push(session)
  return session
}
it('creates a full actual schema only after explicit selection and reopens the same dataset without asking again', async () => {
  const f = fixture()
  const prepare = vi.fn(async (path: string) => {
    const store = new SqliteStore(path)
    store.close()
  })
  const first = keep(
    await openProductionSession({
      configurationDirectory: f.config,
      choose: async (state) => {
        expect(state.state).toBe('UNCONFIGURED')
        return { action: 'create', directory: f.data }
      },
      prepareExisting: prepare,
      onOwnershipLost: vi.fn()
    })
  )
  expect(prepare).not.toHaveBeenCalled()
  const store = new SqliteStore(first.databasePath)
  expect(store.database.prepare('PRAGMA integrity_check').get()?.integrity_check).toBe('ok')
  expect(
    store.database
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='steward_slots'")
      .get()
  ).toBeTruthy()
  store.close()
  const before = readFileSync(f.locator)
  await first.release()
  const choose = vi.fn(async () => ({ action: 'cancel' as const }))
  const reopened = keep(
    await openProductionSession({
      configurationDirectory: f.config,
      choose,
      prepareExisting: prepare,
      onOwnershipLost: vi.fn()
    })
  )
  expect(reopened.dataSetId).toBe(first.dataSetId)
  expect(reopened.databasePath).toBe(first.databasePath)
  expect(prepare).toHaveBeenCalledTimes(1)
  expect(choose).not.toHaveBeenCalled()
  expect(readFileSync(f.locator)).toEqual(before)
})
it('cancelled first use creates no database or locator and releases its configuration lease', async () => {
  const f = fixture()
  const options = {
    configurationDirectory: f.config,
    choose: async () => ({ action: 'cancel' as const }),
    prepareExisting: vi.fn(async () => {}),
    onOwnershipLost: vi.fn()
  }
  expect(await openProductionSession(options)).toBeNull()
  expect(await openProductionSession(options)).toBeNull()
  expect(existsSync(f.locator)).toBe(false)
  expect(existsSync(join(f.data, 'mashiro.sqlite'))).toBe(false)
  expect(options.prepareExisting).not.toHaveBeenCalled()
})
it('cancelled recovery preserves a disappeared dataset pointer and never recreates the old path', async () => {
  const f = fixture()
  const first = keep(
    await openProductionSession({
      configurationDirectory: f.config,
      choose: async () => ({ action: 'create', directory: f.data }),
      prepareExisting: async () => {},
      onOwnershipLost: vi.fn()
    })
  )
  await first.release()
  const before = readFileSync(f.locator)
  renameSync(f.data, join(f.root, 'moved'))
  const prepare = vi.fn(async () => {})
  expect(
    await openProductionSession({
      configurationDirectory: f.config,
      choose: async (state) => {
        expect(state.state).toBe('RECOVERY')
        return { action: 'cancel' }
      },
      prepareExisting: prepare,
      onOwnershipLost: vi.fn()
    })
  ).toBeNull()
  expect(readFileSync(f.locator)).toEqual(before)
  expect(existsSync(f.data)).toBe(false)
  expect(prepare).not.toHaveBeenCalled()
})
it('a different program configuration cannot open the same dataset while an existing session owns it', async () => {
  const f = fixture()
  keep(
    await openProductionSession({
      configurationDirectory: f.config,
      choose: async () => ({ action: 'create', directory: f.data }),
      prepareExisting: async () => {},
      onOwnershipLost: vi.fn()
    })
  )
  const other = join(f.root, 'other config')
  mkdirSync(other)
  const prepare = vi.fn(async () => {})
  await expect(
    openProductionSession({
      configurationDirectory: other,
      choose: async () => ({ action: 'select', directory: f.data }),
      prepareExisting: prepare,
      onOwnershipLost: vi.fn()
    })
  ).rejects.toThrow('DATA_SET_IN_USE')
  expect(prepare).not.toHaveBeenCalled()
  expect(new ProductionLocationStore(other).inspect().state).toBe('UNCONFIGURED')
})
