import { readdirSync } from 'node:fs'
import type { ProductionDialogs } from './production-selection.js'
import { canonicalProductionDirectory } from './production-location.js'
import { verifyProductionBackup } from './production-backup.js'
import { restoreProductionBackup } from './production-restore.js'

/** Available even when the current database cannot open. Never overwrites its files or locator. */
export async function restoreProductionAtStartup(
  dialogs: ProductionDialogs
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
      '\n原数据保留原位；备份时间之后的修改和删除不包含在副本中。只有还原和启动准备通过才切换数据指向。受保护凭据需要原Windows用户，其他用户需重新提供。',
    buttons: ['取消', '还原'],
    cancelId: 0,
    defaultId: 0,
    noLink: true
  })
  if (confirmed.response !== 1) return null
  await restoreProductionBackup({
    backupDirectory,
    destinationDirectory,
    signal: new AbortController().signal,
    expectedReceipt: receipt
  })
  return destinationDirectory
}
