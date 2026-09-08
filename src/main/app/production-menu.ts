import { app, dialog, Menu } from 'electron'
import {
  prepareProductionMaintenance,
  type ProductionMaintenance,
  type ProductionMaintenanceKind
} from '../data/production-maintenance.js'

export function installProductionMenu(options: {
  dataPath: string
  dataSetId: string
  backupParentDirectory: string
  begin(plan: ProductionMaintenance): void
}): void {
  let planning = false
  const maintenance = async (kind: ProductionMaintenanceKind) => {
    if (planning) return
    planning = true
    try {
      const plan = await prepareProductionMaintenance({
        kind,
        dialogs: dialog,
        backupParentDirectory: options.backupParentDirectory
      })
      if (plan) {
        options.begin(plan)
        return
      }
    } catch {
      dialog.showErrorBox(
        '数据操作未开始',
        '所选位置或备份不满足要求。请选择完整可校验的备份或合适的空目录；当前数据指向保持不变。'
      )
    }
    planning = false
  }
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: '数据与备份',
        submenu: [
          {
            label: '查看当前数据位置',
            click: () => {
              void dialog.showMessageBox({
                title: '当前数据位置',
                message: options.dataPath,
                detail:
                  '数据集：' +
                  options.dataSetId +
                  '\\n卸载程序会保留业务数据。完整备份包含治理状态和受保护凭据；跨Windows用户需要重新提供凭据。',
                buttons: ['确定']
              })
            }
          },
          {
            label: '完整备份并退出…',
            click: () => {
              void maintenance('backup')
            }
          },
          {
            label: '复制到新数据位置并重启…',
            click: () => {
              void maintenance('relocate')
            }
          },
          {
            label: '新建空数据集并重启…',
            click: () => {
              void maintenance('create')
            }
          },
          {
            label: '选择已有数据集并重启…',
            click: () => {
              void maintenance('select')
            }
          },
          {
            label: '从完整备份还原并重启…',
            click: () => {
              void maintenance('restore')
            }
          },
          { type: 'separator' },
          { label: '退出 Mashiro', click: () => app.quit() }
        ]
      },
      {
        label: '编辑',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'selectAll' }
        ]
      }
    ])
  )
}
