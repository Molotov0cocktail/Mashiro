import { readdirSync } from 'node:fs'
import { acquireProductionLease, assertProductionLease } from './production-lease.js'
import { ProductionGovernanceIndex } from './production-governance-index.js'
import { governRestoredProductionCopy } from './production-governance-restore.js'
import type { ProductionDialogs } from './production-selection.js'
import { canonicalProductionDirectory } from './production-location.js'
import { verifyProductionBackup } from './production-backup.js'
import { restoreProductionBackup } from './production-restore.js'

/** Available even when the current database cannot open. Never overwrites its files or locator. */
export async function restoreProductionAtStartup(
  dialogs: ProductionDialogs,
  configurationDirectory?: string
): Promise<string | null> {
  const source = await dialogs.showOpenDialog({
    title: '选择包含 backup.json 的完整备份',
    properties: ['openDirectory']
  })
  if (source.canceled || source.filePaths.length !== 1) return null
  const backupDirectory = canonicalProductionDirectory(source.filePaths[0]!)
  const receipt = verifyProductionBackup(backupDirectory)
  const selected = await dialogs.showOpenDialog({
    title: '选择新的空还原目录',
    properties: ['openDirectory', 'createDirectory']
  })
  if (selected.canceled || selected.filePaths.length !== 1) return null
  const destinationDirectory = canonicalProductionDirectory(selected.filePaths[0]!)
  if (readdirSync(destinationDirectory).length) throw new Error('RESTORE_DESTINATION_NOT_EMPTY')
  const confirmed = await dialogs.showMessageBox({
    type: 'warning',
    title: '确认还原完整备份',
    message: '还原到新位置并尝试启动？',
    detail:
      '备份时间：' +
      receipt.createdAt +
      '\n原数据保留原位；副本应用本机已知的后来删除、纠正和撤权，缺失的后来正文不会用旧版本替代。连接及自动后台工作暂停，请检查后重新启用。只有还原和启动准备通过才切换数据指向。受保护凭据需要原Windows用户，其他用户需重新提供。',
    buttons: ['取消', '还原'],
    cancelId: 0,
    defaultId: 0,
    noLink: true
  })
  if (confirmed.response !== 1) return null
  const lease = configurationDirectory
    ? await acquireProductionLease(configurationDirectory, () => {})
    : undefined
  try {
    const index = lease ? new ProductionGovernanceIndex(configurationDirectory!, lease) : undefined
    await restoreProductionBackup({
      backupDirectory,
      destinationDirectory,
      signal: new AbortController().signal,
      expectedReceipt: receipt,
      governCopy: index
        ? (directory, snapshot, check) =>
            governRestoredProductionCopy(index, snapshot.dataSetId, directory, () => {
              check()
              assertProductionLease(lease!, configurationDirectory!)
            })
        : undefined
    })
  } finally {
    await lease?.release()
  }
  return destinationDirectory
}
