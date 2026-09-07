import {
  constants,
  copyFileSync,
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readdirSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { dirname, isAbsolute, join, relative } from 'node:path'
import { setImmediate } from 'node:timers/promises'
import {
  assertProductionFilesMatchBackup,
  verifyProductionBackup,
  type ProductionBackupReceipt
} from './production-backup.js'
import { acquireProductionLease, assertProductionLease } from './production-lease.js'
import { canonicalProductionDirectory, inspectProductionDataSet } from './production-location.js'

/** Explicit restoration makes a separate dataset. It never overwrites or selects the current one. */
export async function restoreProductionBackup(options: {
  backupDirectory: string
  destinationDirectory: string
  signal: AbortSignal
  expectedReceipt?: ProductionBackupReceipt
}): Promise<ProductionBackupReceipt> {
  const approvedReceipt = options.expectedReceipt ? JSON.stringify(options.expectedReceipt) : null
  const source = canonicalProductionDirectory(options.backupDirectory)
  const destination = canonicalProductionDirectory(options.destinationDirectory)
  const overlaps = (a: string, b: string) => {
    const path = relative(a, b)
    return path === '' || (!path.startsWith('..') && !isAbsolute(path))
  }
  if (overlaps(source, destination) || overlaps(destination, source))
    throw new Error('RESTORE_PATH_OVERLAP')
  let lost = false
  const sourceLease = await acquireProductionLease(source, () => {
    lost = true
  })
  try {
    const targetLease = await acquireProductionLease(destination, () => {
      lost = true
    })
    try {
      const assertCurrent = () => {
        if (options.signal.aborted || lost) throw new Error('RESTORE_CANCELLED')
        assertProductionLease(sourceLease, source)
        assertProductionLease(targetLease, destination)
      }
      assertCurrent()
      if (readdirSync(destination).length) throw new Error('RESTORE_DESTINATION_NOT_EMPTY')
      const receipt = verifyProductionBackup(source)
      if (approvedReceipt !== null && JSON.stringify(receipt) !== approvedReceipt)
        throw new Error('RESTORE_APPROVED_SNAPSHOT_CHANGED')
      const marker = join(destination, '.mashiro-snapshot.json')
      const descriptor = openSync(marker, 'wx', 0o600)
      try {
        writeFileSync(
          descriptor,
          JSON.stringify({
            formatVersion: 1,
            backupId: receipt.backupId,
            dataSetId: receipt.dataSetId
          })
        )
        fsyncSync(descriptor)
      } finally {
        closeSync(descriptor)
      }
      for (const file of receipt.files) {
        assertCurrent()
        const target = join(destination, file.path)
        mkdirSync(dirname(target), { recursive: true })
        canonicalProductionDirectory(dirname(target))
        copyFileSync(join(source, 'payload', file.path), target, constants.COPYFILE_EXCL)
        const fd = openSync(target, 'r+')
        try {
          fsyncSync(fd)
        } finally {
          closeSync(fd)
        }
        await setImmediate()
      }
      assertCurrent()
      if (JSON.stringify(verifyProductionBackup(source)) !== JSON.stringify(receipt))
        throw new Error('RESTORE_SNAPSHOT_CHANGED')
      assertProductionFilesMatchBackup(destination, receipt)
      // A partial or failed copy retains the marker and cannot be opened as a dataset.
      unlinkSync(marker)
      inspectProductionDataSet(destination, receipt.dataSetId)
      return receipt
    } finally {
      await targetLease.release()
    }
  } finally {
    await sourceLease.release()
  }
}
