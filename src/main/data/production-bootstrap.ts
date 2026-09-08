import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { canonicalProductionDirectory } from './production-location.js'
import { openProductionSession, type ProductionSession } from './production-session.js'
import { chooseProductionData, type ProductionDialogs } from './production-selection.js'
import { prepareProductionData } from './production-prepare.js'
import { restoreProductionAtStartup } from './production-startup-restore.js'
import {
  acknowledgeProductionDataSelection,
  isProductionDataSelectionAcknowledged
} from './production-selection-awareness.js'
import {
  createStartupFailureDiagnostic,
  persistStartupFailureDiagnostic,
  startupFailureDetail
} from './startup-diagnostics.js'

interface RuntimeApp {
  getPath(name: 'appData'): string
  setPath(name: 'userData' | 'sessionData', path: string): void
}

export interface ProductionRuntimePaths {
  configurationDirectory: string
  defaultDataDirectory: string
  backupParentDirectory: string
}

export interface ProductionApplicationDataOptions {
  paths: ProductionRuntimePaths
  dialogs: ProductionDialogs
  onOwnershipLost(error: Error): void
  assertQuiescent(): void
}

class ProductionOwnershipLostError extends Error {
  constructor(readonly original: unknown) {
    super('PRODUCTION_OWNERSHIP_LOST')
  }
}

function childDirectory(parent: string, name: string): string {
  const base = canonicalProductionDirectory(parent)
  const path = join(base, name)
  if (!existsSync(path)) mkdirSync(path)
  return canonicalProductionDirectory(path)
}

/** Chromium/bootstrap state has a stable per-user home; no business dataset is created here. */
export function prepareProductionRuntimePaths(app: RuntimeApp): ProductionRuntimePaths {
  const root = childDirectory(app.getPath('appData'), 'Mashiro')
  const configurationDirectory = childDirectory(root, 'configuration')
  const runtime = childDirectory(root, 'runtime')
  app.setPath('userData', childDirectory(runtime, 'userData'))
  app.setPath('sessionData', childDirectory(runtime, 'sessionData'))
  return {
    configurationDirectory,
    defaultDataDirectory: join(root, 'data'),
    backupParentDirectory: childDirectory(root, 'backups')
  }
}

async function openProductionData(
  options: ProductionApplicationDataOptions,
  forceSelection = false,
  restored?: string
): Promise<ProductionSession | null> {
  let ownershipLost = false
  try {
    return await openProductionSession({
      configurationDirectory: options.paths.configurationDirectory,
      forceSelection,
      choose: async (state) =>
        restored
          ? { action: 'select', directory: restored }
          : chooseProductionData(
              state.state === 'READY'
                ? { ...state, state: 'RECOVERY', reason: 'DATA_UNAVAILABLE' }
                : state,
              options.paths.defaultDataDirectory,
              options.dialogs
            ),
      async prepareExisting(_databasePath, dataPath, signal, lease, authorizeReplacement) {
        await prepareProductionData({
          dataDirectory: dataPath,
          backupParentDirectory: options.paths.backupParentDirectory,
          lease,
          signal,
          assertQuiescent: options.assertQuiescent,
          authorizeReplacement
        })
      },
      async confirmReady(state) {
        if (
          isProductionDataSelectionAcknowledged(
            options.paths.configurationDirectory,
            state.locator.dataSetId
          )
        )
          return 'continue'
        const selected = await options.dialogs.showMessageBox({
          type: 'question',
          title: '已找到现有 Mashiro 数据',
          message: '继续使用现有数据，或打开数据管理？',
          detail:
            '数据位置：' +
            state.locator.dataPath +
            '\n数据集：' +
            state.locator.dataSetId +
            '\n程序安装包不包含这里的助手、历史或记忆。选择全新开始会保留现有数据，并在另一个空文件夹创建新数据集。',
          buttons: ['继续使用现有数据', '数据管理', '退出'],
          cancelId: 2,
          defaultId: 0,
          noLink: true
        })
        return selected.response === 0 ? 'continue' : selected.response === 1 ? 'manage' : 'cancel'
      },
      acknowledgeSelection(dataSetId, lease) {
        acknowledgeProductionDataSelection(options.paths.configurationDirectory, dataSetId, lease)
      },
      onOwnershipLost(error) {
        ownershipLost = true
        options.onOwnershipLost(error)
      }
    })
  } catch (error) {
    if (ownershipLost) throw new ProductionOwnershipLostError(error)
    throw error
  }
}

export async function recoverProductionApplicationData(
  options: ProductionApplicationDataOptions,
  action: 'manage' | 'restore'
): Promise<ProductionSession | null> {
  if (action === 'manage') return openProductionData(options, true)
  const restored = await restoreProductionAtStartup(
    options.dialogs,
    options.paths.configurationDirectory
  )
  return restored ? openProductionData(options, true, restored) : null
}

/** Invoke after app.whenReady(), before AssistantService or ProviderService opens a writer. */
export async function openProductionApplicationData(
  options: ProductionApplicationDataOptions
): Promise<ProductionSession | null> {
  try {
    return await openProductionData(options)
  } catch (error) {
    if (error instanceof ProductionOwnershipLostError) throw error
    const diagnostic = createStartupFailureDiagnostic('SESSION_PREPARE', error, 'NOT_STARTED')
    persistStartupFailureDiagnostic(options.paths.configurationDirectory, diagnostic)
    const selected = await options.dialogs.showMessageBox({
      type: 'error',
      title: '数据启动准备未完成',
      message: '当前数据未能安全打开。',
      detail:
        startupFailureDetail(diagnostic) +
        '\n原数据仍保留。可以退出检查位置，也可以打开数据管理来选择已有数据或新建空数据集，或者从完整备份还原到新空目录；成功前不更改数据指向。',
      buttons: ['退出', '数据管理', '从完整备份还原'],
      cancelId: 0,
      defaultId: 0,
      noLink: true
    })
    if (selected.response === 1) return recoverProductionApplicationData(options, 'manage')
    if (selected.response === 2) return recoverProductionApplicationData(options, 'restore')
    return null
  }
}
