import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { dirname } from 'node:path'
import type { MessageBoxOptions, OpenDialogOptions } from 'electron'
import {
  canonicalProductionDirectory,
  inspectProductionDataSet,
  type LocationInspection
} from './production-location.js'
import type { ProductionSelection } from './production-session.js'

export interface ProductionDialogs {
  showMessageBox(options: MessageBoxOptions): Promise<{ response: number }>
  showOpenDialog(options: OpenDialogOptions): Promise<{ canceled: boolean; filePaths: string[] }>
}

/** Native trusted selection; neither arbitrary paths nor filesystem authority cross renderer IPC. */
export async function chooseProductionData(
  state: LocationInspection,
  defaultDataDirectory: string,
  dialogs: ProductionDialogs
): Promise<ProductionSelection> {
  if (state.state === 'READY') throw new Error('DATA_SELECTION_NOT_REQUIRED')
  const recovering = state.state === 'RECOVERY'
  const known = recovering && state.locator !== null
  const actions = recovering
    ? known
      ? (['relocate', 'select', 'create', 'cancel'] as const)
      : (['select', 'create', 'cancel'] as const)
    : (['default', 'select', 'create', 'cancel'] as const)
  const labels = {
    default: '使用默认数据位置',
    relocate: '重新定位原数据',
    select: '选择已有数据集',
    create: '新建空数据集',
    cancel: '退出'
  }
  const result = await dialogs.showMessageBox({
    type: recovering ? 'warning' : 'question',
    title: recovering ? '恢复 Mashiro 数据位置' : '设置 Mashiro 数据位置',
    message: recovering
      ? '当前数据位置无法使用，请选择恢复方式。'
      : '选择用于保存助手、历史、记忆和事项的位置。',
    detail: recovering
      ? '原数据指向会保留，恢复成功前不会切换或创建替代数据。' +
        (known
          ? '\n原位置：' + state.locator!.dataPath + '\n数据集：' + state.locator!.dataSetId
          : '')
      : '默认位置：' +
        defaultDataDirectory +
        '\n程序位置和数据位置独立。自定义位置可包含中文、空格，或选择可写的安装目录 data。',
    buttons: actions.map((action) => labels[action]),
    cancelId: actions.length - 1,
    defaultId: recovering ? actions.length - 1 : 0,
    noLink: true
  })
  const action = actions[result.response]
  if (!action || action === 'cancel') return { action: 'cancel' }
  if (action === 'default') {
    // This creation follows the explicit native choice; no startup fallback creates an empty copy.
    canonicalProductionDirectory(dirname(defaultDataDirectory))
    if (!existsSync(defaultDataDirectory)) mkdirSync(defaultDataDirectory)
    const directory = canonicalProductionDirectory(defaultDataDirectory)
    if (readdirSync(directory).length === 0) return { action: 'create', directory }
    inspectProductionDataSet(directory)
    return { action: 'select', directory }
  }
  const selection = await dialogs.showOpenDialog({
    title:
      action === 'create'
        ? '选择空的数据文件夹'
        : action === 'relocate'
          ? '选择原数据集所在文件夹'
          : '选择已有 Mashiro 数据集',
    buttonLabel: '选择数据位置',
    properties: ['openDirectory', 'createDirectory'],
    defaultPath: recovering && known ? state.locator!.dataPath : defaultDataDirectory
  })
  if (selection.canceled || selection.filePaths.length !== 1) return { action: 'cancel' }
  const directory = canonicalProductionDirectory(selection.filePaths[0]!)
  if (action === 'create') {
    const confirmed = await dialogs.showMessageBox({
      type: 'warning',
      title: '新建空数据集',
      message: '在所选空文件夹创建全新的 Mashiro 数据？',
      detail:
        '不会复制当前助手、历史、记忆、事项、连接、凭据或运行设置。原数据及其指向在新数据准备成功前保持不变。',
      buttons: ['取消', '创建并使用'],
      cancelId: 0,
      defaultId: 0,
      noLink: true
    })
    if (confirmed.response !== 1) return { action: 'cancel' }
  }
  return { action, directory }
}
