import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { canonicalProductionDirectory } from './production-location.js'
import { openProductionSession, type ProductionSession } from './production-session.js'
import { chooseProductionData, type ProductionDialogs } from './production-selection.js'
import { prepareProductionData } from './production-prepare.js'
import { restoreProductionAtStartup } from './production-startup-restore.js'

interface RuntimeApp {
  getPath(name: 'appData'): string
  setPath(name: 'userData' | 'sessionData', path: string): void
}

export interface ProductionRuntimePaths {
  configurationDirectory: string
  defaultDataDirectory: string
  backupParentDirectory: string
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

/** Invoke after app.whenReady(), before AssistantService or ProviderService opens a writer. */
export async function openProductionApplicationData(options: {
  paths: ProductionRuntimePaths
  dialogs: ProductionDialogs
  onOwnershipLost(error: Error): void
  assertQuiescent(): void
}): Promise<ProductionSession | null> {
  let ownershipLost = false
  const open = (forceSelection = false, restored?: string) =>
    openProductionSession({
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
      onOwnershipLost(error) {
        ownershipLost = true
        options.onOwnershipLost(error)
      }
    })
  try {
    return await open()
  } catch (error) {
    if (ownershipLost) throw error
    const selected = await options.dialogs.showMessageBox({
      type: 'error',
      title: '数据启动准备未完成',
      message: '当前数据未能安全打开。',
      detail:
        '原数据仍保留。可以退出检查位置，也可以显式重新选择数据或从完整备份还原到新空目录；恢复成功前不更改数据指向。',
      buttons: ['退出', '重新选择数据', '从完整备份还原'],
      cancelId: 0,
      defaultId: 0,
      noLink: true
    })
    if (selected.response === 1) return open(true)
    if (selected.response === 2) {
      const restored = await restoreProductionAtStartup(
        options.dialogs,
        options.paths.configurationDirectory
      )
      if (restored) return open(true, restored)
    }
    return null
  }
}
