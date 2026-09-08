import { mkdirSync, readdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { canonicalProductionDirectory, inspectProductionDataSet } from './production-location.js'
import { verifyProductionBackup, type ProductionBackupReceipt } from './production-backup.js'
import type { ProductionSession } from './production-session.js'
import type { ProductionDialogs } from './production-selection.js'

export type ProductionMaintenanceKind = 'backup' | 'create' | 'select' | 'relocate' | 'restore'
export interface ProductionMaintenance {
  run(session: ProductionSession, assertQuiescent: () => void): Promise<boolean>
}

/** Native, explicit planning happens before closing writers. Cancellation changes nothing. */
export async function prepareProductionMaintenance(options: {
  kind: ProductionMaintenanceKind
  dialogs: ProductionDialogs
  backupParentDirectory: string
}): Promise<ProductionMaintenance | null> {
  const { dialogs, kind } = options
  const pick = async (title: string, empty: boolean) => {
    const selected = await dialogs.showOpenDialog({
      title,
      properties: ['openDirectory', 'createDirectory']
    })
    if (selected.canceled || selected.filePaths.length !== 1) return null
    const directory = canonicalProductionDirectory(selected.filePaths[0]!)
    if (empty && readdirSync(directory).length)
      throw new Error('MAINTENANCE_EMPTY_DIRECTORY_REQUIRED')
    return directory
  }
  let backup: string | null = null
  let approvedReceipt: ProductionBackupReceipt | undefined
  let detail = ''
  if (kind === 'restore') {
    backup = await pick('选择包含 backup.json 的完整备份文件夹', false)
    if (!backup) return null
    const receipt = verifyProductionBackup(backup)
    approvedReceipt = receipt
    detail =
      '备份时间：' +
      receipt.createdAt +
      '\n恢复副本会应用本机已知的后来删除、纠正和撤权；无法取回的后来正文不会恢复旧版本。连接及自动后台工作将暂停，请检查后重新启用。当前数据仍保留原位，不会覆盖。受保护凭据仅限原Windows用户，其他用户需重新提供。'
  }
  const directory = await pick(
    kind === 'backup'
      ? '选择空的备份文件夹'
      : kind === 'create'
        ? '选择用于新建空数据集的空文件夹'
        : kind === 'select'
          ? '选择已有 Mashiro 数据集'
          : '选择新的空数据文件夹',
    kind !== 'select'
  )
  if (!directory) return null
  if (kind === 'select') inspectProductionDataSet(directory)
  const confirmed = await dialogs.showMessageBox({
    type: kind === 'restore' || kind === 'select' ? 'warning' : 'question',
    title: '数据与备份',
    message:
      kind === 'backup'
        ? '停止当前工作，完成完整备份后退出？'
        : '停止当前工作，完成数据操作后重启？',
    detail:
      detail ||
      (kind === 'create'
        ? '将创建全新的空数据集并切换。不会复制当前助手、历史、记忆、事项、连接、凭据或运行设置；当前数据完整保留在原位置。'
        : kind === 'relocate'
          ? '先生成完整备份，再复制并校验新位置；成功后切换，原位置的数据仍保留。'
          : kind === 'select'
            ? '重启后将使用所选数据集。当前数据保留在原位置。'
            : '完整备份包含历史、记忆正文、治理状态和受保护凭据；程序将退出以保证复制期间没有写入。'),
    buttons: ['取消', '继续'],
    cancelId: 0,
    defaultId: 0,
    noLink: true
  })
  if (confirmed.response !== 1) return null
  return {
    async run(session, assertQuiescent) {
      assertQuiescent()
      if (kind === 'backup') {
        await session.backup(directory, assertQuiescent)
        await dialogs.showMessageBox({
          type: 'info',
          title: '完整备份已完成',
          message: '备份已校验，程序即将退出。',
          detail: directory,
          buttons: ['确定']
        })
        return false
      }
      if (kind === 'relocate') {
        const parent = canonicalProductionDirectory(options.backupParentDirectory)
        backup = join(parent, 'mashiro-before-relocation-' + randomUUID())
        mkdirSync(backup)
        approvedReceipt = await session.backup(backup, assertQuiescent)
      }
      if (kind === 'create') {
        await session.createEmpty(directory, assertQuiescent)
        return true
      }
      if (backup) await session.restore(backup, directory, approvedReceipt, assertQuiescent)
      assertQuiescent()
      await session.select(directory, assertQuiescent)
      return true
    }
  }
}
