import { mkdirSync, mkdtempSync, realpathSync, rmSync, renameSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, expect, it, vi } from 'vitest'
import {
  openProductionSession,
  type ProductionSession
} from '../../src/main/data/production-session.js'
import { prepareProductionMaintenance } from '../../src/main/data/production-maintenance.js'
import { restoreProductionAtStartup } from '../../src/main/data/production-startup-restore.js'
import { inspectProductionDataSet } from '../../src/main/data/production-location.js'
const roots: string[] = [],
  sessions: ProductionSession[] = []
afterEach(async () => {
  for (const session of sessions.splice(0)) await session.release()
  for (const root of roots.splice(0)) {
    const actual = realpathSync.native(root)
    if (
      dirname(actual) !== realpathSync.native(tmpdir()) ||
      !basename(actual).startsWith('mashiro-consent-review-')
    )
      throw Error('SCOPE')
    rmSync(actual, { recursive: true, force: true })
  }
})
it.each(['startup', 'maintenance'] as const)(
  'never restores another complete snapshot substituted after the user was shown the approved snapshot identity (%s)',
  async (entry) => {
    const root = mkdtempSync(join(realpathSync.native(tmpdir()), 'mashiro-consent-review-'))
    roots.push(root)
    const make = async (name: string) => {
      const config = join(root, name + '-config'),
        data = join(root, name + '-data'),
        backup = join(root, name + '-backup')
      for (const path of [config, data, backup]) mkdirSync(path)
      const session = await openProductionSession({
        configurationDirectory: config,
        choose: async () => ({ action: 'create', directory: data }),
        prepareExisting: async () => {},
        onOwnershipLost: vi.fn()
      })
      if (!session) throw Error('SESSION')
      sessions.push(session)
      const receipt = await session.backup(backup, () => {})
      return { session, backup, receipt }
    }
    const approved = await make('approved'),
      other = await make('other'),
      destination = join(root, 'restore'),
      old = join(root, 'approved-original')
    mkdirSync(destination)
    expect(approved.receipt.dataSetId).not.toBe(other.receipt.dataSetId)
    const dialogs = {
      showOpenDialog: vi
        .fn()
        .mockResolvedValueOnce({ canceled: false, filePaths: [approved.backup] })
        .mockResolvedValueOnce({ canceled: false, filePaths: [destination] }),
      showMessageBox: vi.fn(async (options: { detail?: string }) => {
        expect(options.detail).toContain(approved.receipt.createdAt)
        for (const path of [approved.backup, other.backup, old])
          if (dirname(path) !== root) throw Error('SCOPE')
        renameSync(approved.backup, old)
        renameSync(other.backup, approved.backup)
        return { response: 1 }
      })
    }
    const restore =
      entry === 'startup'
        ? restoreProductionAtStartup(dialogs)
        : prepareProductionMaintenance({
            kind: 'restore',
            dialogs,
            backupParentDirectory: root
          }).then(async (plan) => {
            if (!plan) return null
            await plan.run(approved.session, () => {})
            return destination
          })
    const result = await restore.then(
      (path) => ({
        accepted: true,
        id: path ? inspectProductionDataSet(path).manifest.dataSetId : null
      }),
      () => ({ accepted: false, id: null })
    )
    expect(result).toEqual({ accepted: false, id: null })
  }
)
