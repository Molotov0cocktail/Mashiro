import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { afterEach, expect, it, vi } from 'vitest'
import type { Server } from 'node:net'
import {
  openProductionSession,
  type ProductionSession
} from '../../src/main/data/production-session.js'
import { acquireProductionLease } from '../../src/main/data/production-lease.js'

const captured = vi.hoisted(() => ({ servers: [] as Server[] }))
vi.mock('node:net', async (original) => {
  const actual = await original<typeof import('node:net')>()
  return {
    ...actual,
    createServer: (...args: Parameters<typeof actual.createServer>) => {
      const server = actual.createServer(...args)
      captured.servers.push(server)
      return server
    }
  }
})
const roots: string[] = []
const sessions: ProductionSession[] = []
afterEach(async () => {
  for (const session of sessions.splice(0)) await session.release()
  captured.servers.length = 0
  for (const root of roots.splice(0)) {
    const actual = realpathSync.native(root)
    if (
      dirname(actual) !== realpathSync.native(tmpdir()) ||
      !basename(actual).startsWith('mashiro-session-review-')
    )
      throw Error('UNOWNED_ROOT')
    rmSync(actual, { recursive: true, force: true })
  }
})
const keep = (session: ProductionSession | null) => {
  if (session) sessions.push(session)
  return session
}
async function fixture() {
  const root = mkdtempSync(join(realpathSync.native(tmpdir()), 'mashiro-session-review-'))
  roots.push(root)
  const config = join(root, 'config'),
    data = join(root, 'data')
  mkdirSync(config)
  mkdirSync(data)
  const first = keep(
    await openProductionSession({
      configurationDirectory: config,
      choose: async () => ({ action: 'create', directory: data }),
      prepareExisting: async () => {},
      onOwnershipLost: vi.fn()
    })
  )!
  await first.release()
  return { root, config, data, locator: join(config, 'location.json'), id: first.dataSetId }
}

it.each(['manifest', 'locator'] as const)(
  'rejects a READY session whose %s changes while existing data is prepared',
  async (target) => {
    const f = await fixture()
    const file = target === 'manifest' ? join(f.data, '.mashiro-dataset.json') : f.locator
    const initial = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
    const changed = JSON.stringify({
      ...initial,
      ...(target === 'manifest' ? { dataSetId: randomUUID() } : { revision: randomUUID() })
    })
    await expect(
      openProductionSession({
        configurationDirectory: f.config,
        choose: async () => ({ action: 'cancel' }),
        prepareExisting: async () => {
          writeFileSync(file, changed)
        },
        onOwnershipLost: vi.fn()
      }).then(keep)
    ).rejects.toThrow()
    expect(readFileSync(file, 'utf8')).toBe(changed)
  }
)

it('preserves locator bytes and releases both leases when preparation rejects', async () => {
  const f = await fixture()
  const initial = readFileSync(f.locator)
  await expect(
    openProductionSession({
      configurationDirectory: f.config,
      choose: async () => ({ action: 'cancel' }),
      prepareExisting: async () => {
        throw Error('BACKUP_VERIFICATION_FAILED')
      },
      onOwnershipLost: vi.fn()
    })
  ).rejects.toThrow('BACKUP_VERIFICATION_FAILED')
  expect(readFileSync(f.locator)).toEqual(initial)
  const config = await acquireProductionLease(f.config, vi.fn())
  const data = await acquireProductionLease(f.data, vi.fn())
  await data.release()
  await config.release()
})

it('holds both real leases during preparation and aborts before return when data ownership is lost', async () => {
  const f = await fixture()
  const initial = readFileSync(f.locator)
  let resume!: () => void
  const waiting = new Promise<void>((resolve) => {
    resume = resolve
  })
  let signal: AbortSignal | undefined
  const lost = vi.fn()
  const result = openProductionSession({
    configurationDirectory: f.config,
    choose: async () => ({ action: 'cancel' }),
    prepareExisting: async (_database, _data, current) => {
      signal = current
      await waiting
    },
    onOwnershipLost: lost
  }).then(keep)
  await vi.waitFor(() => expect(signal).toBeDefined())
  await expect(acquireProductionLease(f.config, vi.fn())).rejects.toThrow('DATA_SET_IN_USE')
  await expect(acquireProductionLease(f.data, vi.fn())).rejects.toThrow('DATA_SET_IN_USE')
  // The successful session's data server precedes the two rejected competing servers.
  captured.servers[captured.servers.length - 3]!.close()
  await vi.waitFor(() => expect(signal?.aborted).toBe(true))
  const assertion = expect(result).rejects.toThrow('PRODUCTION_OWNERSHIP_LOST')
  resume()
  await assertion
  expect(lost).toHaveBeenCalledTimes(1)
  expect(readFileSync(f.locator)).toEqual(initial)
})
