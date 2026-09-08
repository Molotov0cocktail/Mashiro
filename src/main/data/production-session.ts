import { join } from 'node:path'
import { authorizeProductionGovernanceMigration } from './production-governance-migration.js'
import { writePortableGovernance } from './production-governance-portable.js'
import { restoreProductionBackup } from './production-restore.js'
import { governRestoredProductionCopy } from './production-governance-restore.js'
import { createProductionBackup, type ProductionBackupReceipt } from './production-backup.js'
import { SqliteStore } from './sqlite.js'
import {
  ProductionLocationStore,
  inspectProductionDataSet,
  type LocationInspection
} from './production-location.js'
import { acquireProductionLease, type ProductionLease } from './production-lease.js'
import { recoverProductionLocationLock } from './production-location-lock.js'
import { initializeProductionDataSet } from './production-initialize.js'
import { ProductionGovernanceIndex } from './production-governance-index.js'
import {
  registerPreparedProductionGovernance,
  settleProductionGovernance
} from './production-governance-lifecycle.js'

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
  /** Trusted maintenance only; the caller must close every application writer first. */
  backup(directory: string, assertQuiescent: () => void): Promise<ProductionBackupReceipt>
  select(directory: string, assertQuiescent: () => void): Promise<void>
  /** Create a fresh, empty data set and atomically select it. The previous data stays in place. */
  createEmpty(directory: string, assertQuiescent: () => void): Promise<void>
  restore(
    backupDirectory: string,
    destinationDirectory: string,
    expectedReceipt: ProductionBackupReceipt | undefined,
    assertQuiescent: () => void
  ): Promise<void>
  /** Close application writers before releasing the session. */
  release(): Promise<void>
}

/** Trusted native setup/recovery coordinator. No renderer path or automatic data fallback. */
export async function openProductionSession(options: {
  configurationDirectory: string
  forceSelection?: boolean
  choose(state: LocationInspection): Promise<ProductionSelection>
  // Existing-version migration must be preceded by the caller's verified quiescent backup.
  prepareExisting(
    databasePath: string,
    dataPath: string,
    signal: AbortSignal,
    lease: ProductionLease,
    authorizeReplacement: (candidatePath: string) => void
  ): Promise<void>
  onOwnershipLost(error: Error): void
  confirmReady?(
    state: Extract<LocationInspection, { state: 'READY' }>
  ): Promise<'continue' | 'manage' | 'cancel'>
  acknowledgeSelection?(dataSetId: string, lease: ProductionLease): void
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
  let unregisterGovernance: (() => void) | undefined
  try {
    const governance = new ProductionGovernanceIndex(
      options.configurationDirectory,
      configurationLease
    )
    recoverProductionLocationLock(options.configurationDirectory, configurationLease)
    const locations = new ProductionLocationStore(
      options.configurationDirectory,
      configurationLease
    )
    const initial = locations.inspect()
    let forceSelection = options.forceSelection ?? false
    if (initial.state === 'READY' && !forceSelection && options.confirmReady) {
      const choice = await options.confirmReady(initial)
      assertHeld()
      if (choice === 'cancel') return null
      if (choice === 'manage') forceSelection = true
    }
    let dataPath: string, dataSetId: string
    if (initial.state === 'READY' && !forceSelection) {
      dataLease = await acquireProductionLease(initial.locator.dataPath, lost)
      assertHeld()
      const checked = inspectProductionDataSet(dataLease.dataPath, initial.locator.dataSetId)
      if (locations.inspect().fingerprint !== initial.fingerprint)
        throw new Error('LOCATION_CHANGED_DURING_OPEN')
      dataPath = checked.dataPath
      dataSetId = checked.manifest.dataSetId
      settleProductionGovernance(governance, dataSetId, dataPath)
      await options.prepareExisting(
        join(dataPath, 'mashiro.sqlite'),
        dataPath,
        cancellation.signal,
        dataLease,
        (candidate) =>
          authorizeProductionGovernanceMigration(
            governance,
            dataSetId,
            dataPath,
            candidate,
            assertHeld
          )
      )
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
            ? initial.state !== 'UNCONFIGURED'
              ? initial.locator?.dataSetId
              : undefined
            : undefined
        if (selection.action === 'relocate' && !expectedId)
          throw new Error('KNOWN_DATA_SET_ID_REQUIRED')
        const checked = inspectProductionDataSet(dataLease.dataPath, expectedId)
        dataPath = checked.dataPath
        dataSetId = checked.manifest.dataSetId
        settleProductionGovernance(governance, dataSetId, dataPath)
        await options.prepareExisting(
          join(dataPath, 'mashiro.sqlite'),
          dataPath,
          cancellation.signal,
          dataLease,
          (candidate) =>
            authorizeProductionGovernanceMigration(
              governance,
              dataSetId,
              dataPath,
              candidate,
              assertHeld
            )
        )
        assertHeld()
      }
      // A failed preparation never changes the existing pointer.
      unregisterGovernance = registerPreparedProductionGovernance({
        index: governance,
        dataSetId,
        dataDirectory: dataPath,
        assertOwnership: assertHeld,
        onUncertain: () => lost(new Error('GOVERNANCE_STATE_UNCERTAIN'))
      })
      locations.bind(dataPath, initial.fingerprint, dataSetId)
    }
    assertHeld()
    try {
      options.acknowledgeSelection?.(dataSetId, configurationLease)
    } catch {
      console.error('MASHIRO_DATA_SELECTION_ACK_UNAVAILABLE')
    }
    unregisterGovernance ??= registerPreparedProductionGovernance({
      index: governance,
      dataSetId,
      dataDirectory: dataPath,
      assertOwnership: assertHeld,
      onUncertain: () => lost(new Error('GOVERNANCE_STATE_UNCERTAIN'))
    })
    const heldData = dataLease
    const openedFingerprint = locations.inspect().fingerprint
    let selectedLease: ProductionLease | undefined
    let maintenanceInProgress = false
    const assertMaintenance = (assertQuiescent: () => void) => {
      if (released) throw new Error('PRODUCTION_SESSION_RELEASED')
      if (selectedLease) throw new Error('PRODUCTION_SELECTION_ALREADY_PENDING')
      assertHeld()
      assertQuiescent()
      if (locations.inspect().fingerprint !== openedFingerprint)
        throw new Error('LOCATION_CHANGED_DURING_MAINTENANCE')
    }
    const withMaintenance = async <T>(
      assertQuiescent: () => void,
      operation: (assertCurrent: () => void) => Promise<T>
    ): Promise<T> => {
      if (maintenanceInProgress) throw new Error('PRODUCTION_MAINTENANCE_IN_PROGRESS')
      assertMaintenance(assertQuiescent)
      maintenanceInProgress = true
      try {
        return await operation(() => assertMaintenance(assertQuiescent))
      } finally {
        maintenanceInProgress = false
      }
    }
    returned = true
    return Object.freeze({
      dataPath,
      dataSetId,
      databasePath: join(dataPath, 'mashiro.sqlite'),
      credentialDirectory: join(dataPath, 'credentials'),
      async backup(directory: string, assertQuiescent: () => void) {
        return withMaintenance(assertQuiescent, async (assertCurrent) => {
          settleProductionGovernance(governance, dataSetId, dataPath)
          writePortableGovernance(dataPath, governance.known(dataSetId)!)
          return createProductionBackup({
            sourceDirectory: dataPath,
            destinationDirectory: directory,
            sourceLease: heldData,
            signal: cancellation.signal,
            assertQuiescent: assertCurrent
          })
        })
      },
      async restore(
        backupDirectory: string,
        destinationDirectory: string,
        expectedReceipt: ProductionBackupReceipt | undefined,
        assertQuiescent: () => void
      ) {
        return withMaintenance(assertQuiescent, async (assertCurrent) => {
          settleProductionGovernance(governance, dataSetId, dataPath)
          await restoreProductionBackup({
            backupDirectory,
            destinationDirectory,
            expectedReceipt,
            signal: cancellation.signal,
            governCopy: (directory, receipt, check) =>
              governRestoredProductionCopy(governance, receipt.dataSetId, directory, () => {
                check()
                assertCurrent()
              })
          })
        })
      },
      async select(directory: string, assertQuiescent: () => void) {
        return withMaintenance(assertQuiescent, async (assertCurrent) => {
          const target = await acquireProductionLease(directory, lost)
          try {
            const selected = inspectProductionDataSet(target.dataPath)
            settleProductionGovernance(governance, selected.manifest.dataSetId, target.dataPath)
            await options.prepareExisting(
              join(target.dataPath, 'mashiro.sqlite'),
              target.dataPath,
              cancellation.signal,
              target,
              (candidate) =>
                authorizeProductionGovernanceMigration(
                  governance,
                  selected.manifest.dataSetId,
                  target.dataPath,
                  candidate,
                  assertHeld
                )
            )
            assertCurrent()
            const unregisterTarget = registerPreparedProductionGovernance({
              index: governance,
              dataSetId: selected.manifest.dataSetId,
              dataDirectory: target.dataPath,
              assertOwnership: assertHeld,
              onUncertain: () => lost(new Error('GOVERNANCE_STATE_UNCERTAIN'))
            })
            unregisterTarget()
            locations.bind(target.dataPath, openedFingerprint, selected.manifest.dataSetId)
            selectedLease = target
          } finally {
            if (selectedLease !== target) await target.release()
          }
        })
      },
      async createEmpty(directory: string, assertQuiescent: () => void) {
        return withMaintenance(assertQuiescent, async (assertCurrent) => {
          const initialized = await initializeProductionDataSet(
            directory,
            (databasePath) => {
              const store = new SqliteStore(databasePath)
              try {
                if (
                  store.database.prepare('PRAGMA integrity_check').get()?.integrity_check !==
                    'ok' ||
                  store.database.prepare('PRAGMA foreign_key_check').all().length
                )
                  throw new Error('INITIALIZED_SCHEMA_INVALID')
              } finally {
                store.close()
              }
            },
            lost
          )
          const target = initialized.lease
          try {
            assertCurrent()
            const unregisterTarget = registerPreparedProductionGovernance({
              index: governance,
              dataSetId: initialized.manifest.dataSetId,
              dataDirectory: initialized.dataPath,
              assertOwnership: assertHeld,
              onUncertain: () => lost(new Error('GOVERNANCE_STATE_UNCERTAIN'))
            })
            unregisterTarget()
            locations.bind(initialized.dataPath, openedFingerprint, initialized.manifest.dataSetId)
            selectedLease = target
          } finally {
            if (selectedLease !== target) await target.release()
          }
        })
      },
      async release() {
        if (released) return
        if (maintenanceInProgress) throw new Error('PRODUCTION_MAINTENANCE_IN_PROGRESS')
        unregisterGovernance?.()
        released = true
        try {
          await selectedLease?.release()
        } finally {
          try {
            await heldData.release()
          } finally {
            await configurationLease.release()
          }
        }
      }
    })
  } finally {
    if (!returned) {
      unregisterGovernance?.()
      try {
        await dataLease?.release()
      } finally {
        await configurationLease.release()
      }
    }
  }
}
