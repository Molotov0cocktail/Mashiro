import { join } from 'node:path'
import { SqliteStore } from './sqlite.js'
import {
  ProductionLocationStore,
  inspectProductionDataSet,
  type LocationInspection
} from './production-location.js'
import { acquireProductionLease, type ProductionLease } from './production-lease.js'
import { recoverProductionLocationLock } from './production-location-lock.js'
import { initializeProductionDataSet } from './production-initialize.js'

export type ProductionSelection =
  | { action: 'cancel' }
  | { action: 'create'; directory: string }
  | { action: 'select'; directory: string }
  | { action: 'relocate'; directory: string }

export interface ProductionSession {
  dataPath: string
  dataSetId: string
  databasePath: string
  credentialDirectory: string
  /** Close application writers before releasing the session. */
  release(): Promise<void>
}

/** Trusted native setup/recovery coordinator. No renderer path or automatic data fallback. */
export async function openProductionSession(options: {
  configurationDirectory: string
  choose(state: LocationInspection): Promise<ProductionSelection>
  // Existing-version migration must be preceded by the caller's verified quiescent backup.
  prepareExisting(databasePath: string, dataPath: string, signal: AbortSignal): Promise<void>
  onOwnershipLost(error: Error): void
}): Promise<ProductionSession | null> {
  const cancellation = new AbortController()
  const lost = (error: Error) => {
    cancellation.abort()
    options.onOwnershipLost(error)
  }
  const assertHeld = () => {
    if (cancellation.signal.aborted) throw new Error('PRODUCTION_OWNERSHIP_LOST')
  }
  const configurationLease = await acquireProductionLease(options.configurationDirectory, lost)
  let dataLease: ProductionLease | undefined
  let returned = false
  let released = false
  try {
    recoverProductionLocationLock(options.configurationDirectory, configurationLease)
    const locations = new ProductionLocationStore(
      options.configurationDirectory,
      configurationLease
    )
    const initial = locations.inspect()
    let dataPath: string, dataSetId: string
    if (initial.state === 'READY') {
      dataLease = await acquireProductionLease(initial.locator.dataPath, lost)
      assertHeld()
      const checked = inspectProductionDataSet(dataLease.dataPath, initial.locator.dataSetId)
      if (locations.inspect().fingerprint !== initial.fingerprint)
        throw new Error('LOCATION_CHANGED_DURING_OPEN')
      dataPath = checked.dataPath
      dataSetId = checked.manifest.dataSetId
      await options.prepareExisting(join(dataPath, 'mashiro.sqlite'), dataPath, cancellation.signal)
      assertHeld()
      inspectProductionDataSet(dataPath, dataSetId)
      if (locations.inspect().fingerprint !== initial.fingerprint)
        throw new Error('LOCATION_CHANGED_DURING_PREPARATION')
    } else {
      const selection = await options.choose(initial)
      assertHeld()
      if (selection.action === 'cancel') return null
      if (locations.inspect().fingerprint !== initial.fingerprint)
        throw new Error('LOCATION_CHANGED_DURING_SELECTION')
      if (selection.action === 'create') {
        const initialized = await initializeProductionDataSet(
          selection.directory,
          (path) => {
            const store = new SqliteStore(path)
            try {
              if (
                store.database.prepare('PRAGMA integrity_check').get()?.integrity_check !== 'ok' ||
                store.database.prepare('PRAGMA foreign_key_check').all().length
              )
                throw new Error('INITIALIZED_SCHEMA_INVALID')
            } finally {
              store.close()
            }
          },
          lost
        )
        dataLease = initialized.lease
        dataPath = initialized.dataPath
        dataSetId = initialized.manifest.dataSetId
      } else {
        dataLease = await acquireProductionLease(selection.directory, lost)
        assertHeld()
        const expectedId =
          selection.action === 'relocate'
            ? initial.state === 'RECOVERY'
              ? initial.locator?.dataSetId
              : undefined
            : undefined
        if (selection.action === 'relocate' && !expectedId)
          throw new Error('KNOWN_DATA_SET_ID_REQUIRED')
        const checked = inspectProductionDataSet(dataLease.dataPath, expectedId)
        dataPath = checked.dataPath
        dataSetId = checked.manifest.dataSetId
        await options.prepareExisting(
          join(dataPath, 'mashiro.sqlite'),
          dataPath,
          cancellation.signal
        )
        assertHeld()
      }
      // A failed preparation never changes the existing pointer.
      locations.bind(dataPath, initial.fingerprint, dataSetId)
    }
    assertHeld()
    const heldData = dataLease
    returned = true
    return Object.freeze({
      dataPath,
      dataSetId,
      databasePath: join(dataPath, 'mashiro.sqlite'),
      credentialDirectory: join(dataPath, 'credentials'),
      async release() {
        if (released) return
        released = true
        try {
          await heldData.release()
        } finally {
          await configurationLease.release()
        }
      }
    })
  } finally {
    if (!returned) {
      try {
        await dataLease?.release()
      } finally {
        await configurationLease.release()
      }
    }
  }
}
