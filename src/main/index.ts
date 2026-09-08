import { app, BrowserWindow, dialog, ipcMain, safeStorage, type IpcMainInvokeEvent } from 'electron'
import {
  openProductionApplicationData,
  prepareProductionRuntimePaths,
  recoverProductionApplicationData,
  type ProductionRuntimePaths
} from './data/production-bootstrap.js'
import type { ProductionSession } from './data/production-session.js'
import type { ProductionMaintenance } from './data/production-maintenance.js'
import {
  createStartupFailureDiagnostic,
  persistStartupFailureDiagnostic,
  startupFailureDetail,
  type StartupCleanup,
  type StartupStage
} from './data/startup-diagnostics.js'
import { installProductionMenu } from './app/production-menu.js'
import { initializeWindowsAppIdentity } from './app/windows-app-identity.js'
import { registerStewardIpc, emitStewardChanged } from './ipc/register-steward-ipc.js'
import { registerBackgroundIpc, emitBackgroundChanged } from './ipc/register-background-ipc.js'
import { registerReminderIpc, emitReminderChanged } from './ipc/register-reminder-ipc.js'
import { startReminderRuntime } from './reminder/reminder-runtime.js'
import { ReminderNavigationBroker } from './reminder/reminder-navigation.js'
import { registerItemIpc } from './ipc/register-item-ipc.js'
import { registerRetentionIpc } from './ipc/register-retention-ipc.js'
import { registerMemoryIpc } from './ipc/register-memory-ipc.js'
import { registerTimelineIpc } from './ipc/register-timeline-ipc.js'
import { AssistantService } from './assistant/assistant-service.js'
import { createWindow } from './app/create-window.js'
import { resolveDataRoot, type DataRoot } from './data/data-root.js'
import { registerAssistantIpc } from './ipc/register-assistant-ipc.js'
import { registerProviderIpc } from './ipc/register-provider-ipc.js'
import { ProviderService } from './provider/provider-service.js'
import {
  canUseE2eReminderPlatform,
  createE2eReminderPlatform,
  e2eProviderTransport,
  runE2ePhase
} from './testing/e2e-controller.js'

import { registerDailyIpc, emitDailyChanged } from './ipc/register-daily-ipc.js'
import { registerOperationsIpc, emitOperationsChanged } from './ipc/register-operations-ipc.js'
let productionSession: ProductionSession | undefined
let productionPathsForFailure: ProductionRuntimePaths | undefined
let mainWindow: BrowserWindow | undefined
let startupStage: StartupStage = 'RUNTIME_PATHS'
let startupCleanupInProgress = false
let releasingProduction = false
let productionOwnershipLost = false
let plannedMaintenance: ProductionMaintenance | undefined
let unregisterDailyIpc: (() => void) | undefined
let unregisterOperationsIpc: (() => void) | undefined
let unregisterStewardIpc: (() => void) | undefined
let unregisterBackgroundIpc: (() => void) | undefined
let reminderRuntime: ReturnType<typeof startReminderRuntime> | undefined
let unregisterReminderIpc: (() => void) | undefined
let assistantService: AssistantService | undefined
let providerService: ProviderService | undefined
let unregisterAssistantIpc: (() => void) | undefined
let unregisterProviderIpc: (() => void) | undefined
let unregisterTimelineIpc: (() => void) | undefined
let unregisterMemoryIpc: (() => void) | undefined
let unregisterRetentionIpc: (() => void) | undefined
let unregisterItemIpc: (() => void) | undefined

async function start(): Promise<void> {
  startupStage = 'RUNTIME_PATHS'
  initializeWindowsAppIdentity()
  const productionPaths = app.isPackaged ? prepareProductionRuntimePaths(app) : undefined
  productionPathsForFailure = productionPaths
  let dataRoot: DataRoot | undefined = productionPaths ? undefined : resolveDataRoot(app)
  if (!app.requestSingleInstanceLock()) {
    app.quit()
    return
  }
  await app.whenReady()
  startupStage = 'SESSION_PREPARE'
  if (productionPaths) {
    const session = await openProductionApplicationData({
      paths: productionPaths,
      dialogs: dialog,
      assertQuiescent() {
        if (assistantService || providerService) throw new Error('PRODUCTION_WRITERS_ACTIVE')
      },
      onOwnershipLost() {
        productionOwnershipLost = true
        console.error('MASHIRO_DATA_OWNERSHIP_LOST')
        app.quit()
      }
    })
    if (!session) {
      app.quit()
      return
    }
    productionSession = session
    dataRoot = {
      profile: 'production',
      root: session.dataPath,
      databasePath: session.databasePath,
      credentialDirectory: session.credentialDirectory,
      resultsDirectory: null,
      runId: null,
      phase: null
    }
  }
  if (!dataRoot) throw new Error('MASHIRO_DATA_NOT_READY')
  startupStage = 'ASSISTANT_OPEN'
  assistantService = AssistantService.open(dataRoot.databasePath)
  startupStage = 'PROVIDER_OPEN'
  providerService = ProviderService.open(
    dataRoot.databasePath,
    dataRoot.credentialDirectory,
    safeStorage,
    dataRoot.profile === 'test' ? e2eProviderTransport : undefined
  )
  startupStage = 'IPC_REGISTER'
  unregisterAssistantIpc = registerAssistantIpc(ipcMain, assistantService, () =>
    providerService?.cancelArchivedRequests()
  )
  unregisterProviderIpc = registerProviderIpc(ipcMain, providerService)
  unregisterTimelineIpc = registerTimelineIpc(ipcMain, providerService)
  unregisterMemoryIpc = registerMemoryIpc(ipcMain, providerService.memory)
  unregisterItemIpc = registerItemIpc(ipcMain, providerService.items)
  unregisterRetentionIpc = registerRetentionIpc(
    ipcMain,
    providerService.retention,
    (channel, event) => {
      for (const window of BrowserWindow.getAllWindows()) window.webContents.send(channel, event)
    },
    (event) => {
      const call = event as IpcMainInvokeEvent
      return (
        !!BrowserWindow.fromWebContents(call.sender) && call.senderFrame === call.sender.mainFrame
      )
    }
  )
  const reminderNavigation = new ReminderNavigationBroker(
    () => {
      const result = assistantService?.list({ protocolVersion: 1 })
      return result?.ok
        ? { id: result.data.currentAssistantId, revision: result.data.stateRevision }
        : { id: null, revision: -1 }
    },
    (delivery) =>
      delivery.kind === 'open-reminders' ||
      (!!delivery.itemId &&
        providerService?.items.hasNavigableItem(delivery.assistantId, delivery.itemId) === true)
  )
  unregisterReminderIpc = registerReminderIpc(
    ipcMain,
    providerService.reminders,
    reminderNavigation,
    (event) => {
      const call = event as IpcMainInvokeEvent
      return (
        !!BrowserWindow.fromWebContents(call.sender) && call.senderFrame === call.sender.mainFrame
      )
    }
  )
  unregisterBackgroundIpc = registerBackgroundIpc(ipcMain, providerService.background, (event) => {
    const call = event as IpcMainInvokeEvent
    return (
      !!BrowserWindow.fromWebContents(call.sender) && call.senderFrame === call.sender.mainFrame
    )
  })
  providerService.background.onChanged((event) =>
    emitBackgroundChanged((channel, value) => {
      for (const window of BrowserWindow.getAllWindows()) window.webContents.send(channel, value)
    }, event)
  )
  unregisterStewardIpc = registerStewardIpc(ipcMain, providerService.steward, (event) => {
    const call = event as IpcMainInvokeEvent
    return (
      !!BrowserWindow.fromWebContents(call.sender) && call.senderFrame === call.sender.mainFrame
    )
  })
  providerService.steward.onChanged((event) =>
    emitStewardChanged((channel, value) => {
      for (const window of BrowserWindow.getAllWindows()) window.webContents.send(channel, value)
    }, event)
  )
  const trustedDaily = (event: unknown) => {
    const call = event as IpcMainInvokeEvent
    return (
      !!BrowserWindow.fromWebContents(call.sender) && call.senderFrame === call.sender.mainFrame
    )
  }
  unregisterDailyIpc = registerDailyIpc(ipcMain, providerService.daily, trustedDaily)
  unregisterOperationsIpc = registerOperationsIpc(ipcMain, providerService.operations, trustedDaily)
  providerService.daily.onChanged((event) =>
    emitDailyChanged((channel, value) => {
      for (const window of BrowserWindow.getAllWindows()) window.webContents.send(channel, value)
    }, event)
  )
  providerService.operations.onChanged((event) =>
    emitOperationsChanged((channel, value) => {
      for (const window of BrowserWindow.getAllWindows()) window.webContents.send(channel, value)
    }, event)
  )
  startupStage = 'WINDOW_LOAD'
  startupCleanupInProgress = true
  const window = await createWindow()
  mainWindow = window
  startupCleanupInProgress = false
  if (productionPaths)
    installProductionMenu({
      dataPath: dataRoot.root,
      dataSetId: productionSession!.dataSetId,
      backupParentDirectory: productionPaths.backupParentDirectory,
      begin(plan) {
        if (releasingProduction || plannedMaintenance) return
        plannedMaintenance = plan
        app.quit()
      }
    })
  startupStage = 'REMINDER_START'
  reminderRuntime = startReminderRuntime(
    providerService.reminders,
    window,
    (event) => {
      const delivery = reminderNavigation.publish(event)
      if (!delivery) return
      emitReminderChanged((channel, value) => {
        if (!window.isDestroyed()) window.webContents.send(channel, value)
      }, delivery)
    },
    canUseE2eReminderPlatform(app.isPackaged, dataRoot.profile)
      ? createE2eReminderPlatform()
      : undefined
  )
  if (app.isPackaged && process.argv.includes('--mashiro-login')) window.hide()
  await runE2ePhase(
    window,
    dataRoot,
    dataRoot.profile === 'test' ? reminderRuntime.restoreFromTrayForTest : undefined
  )
}

function unregisterFailedStartupIpc(): boolean {
  let failed = false
  const remove = (current: (() => void) | undefined, clear: () => void) => {
    if (!current) return
    try {
      current()
      clear()
    } catch {
      failed = true
    }
  }
  remove(unregisterDailyIpc, () => (unregisterDailyIpc = undefined))
  remove(unregisterOperationsIpc, () => (unregisterOperationsIpc = undefined))
  remove(unregisterStewardIpc, () => (unregisterStewardIpc = undefined))
  remove(unregisterBackgroundIpc, () => (unregisterBackgroundIpc = undefined))
  remove(unregisterReminderIpc, () => (unregisterReminderIpc = undefined))
  remove(unregisterItemIpc, () => (unregisterItemIpc = undefined))
  remove(unregisterRetentionIpc, () => (unregisterRetentionIpc = undefined))
  remove(unregisterMemoryIpc, () => (unregisterMemoryIpc = undefined))
  remove(unregisterTimelineIpc, () => (unregisterTimelineIpc = undefined))
  remove(unregisterProviderIpc, () => (unregisterProviderIpc = undefined))
  remove(unregisterAssistantIpc, () => (unregisterAssistantIpc = undefined))
  return failed
}

function startupCleanupWasIncomplete(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'startupCleanup' in error &&
    error.startupCleanup === 'FAILED'
  )
}

async function cleanupFailedStartup(startupError: unknown): Promise<StartupCleanup> {
  startupCleanupInProgress = true
  let failed = startupCleanupWasIncomplete(startupError)
  reminderRuntime?.setQuitting(true)
  if (mainWindow)
    try {
      mainWindow.destroy()
      mainWindow = undefined
    } catch {
      failed = true
    }
  if (unregisterFailedStartupIpc()) failed = true
  if (reminderRuntime)
    try {
      reminderRuntime.stop()
      reminderRuntime = undefined
    } catch {
      failed = true
    }
  if (providerService)
    try {
      providerService.close()
      providerService = undefined
    } catch {
      failed = true
    }
  if (assistantService)
    try {
      assistantService.close()
      assistantService = undefined
    } catch {
      failed = true
    }
  if (failed || providerService || assistantService || reminderRuntime) return 'FAILED'
  if (productionSession)
    try {
      await productionSession.release()
      productionSession = undefined
    } catch {
      return 'FAILED'
    }
  return 'COMPLETE'
}

async function handleStartupFailure(error: unknown): Promise<void> {
  const cleanup = await cleanupFailedStartup(error)
  const diagnostic = createStartupFailureDiagnostic(startupStage, error, cleanup)
  const persisted = persistStartupFailureDiagnostic(
    productionPathsForFailure?.configurationDirectory,
    diagnostic
  )
  console.error('MASHIRO_STARTUP_FAILURE', JSON.stringify({ ...diagnostic, persisted }))
  if (!app.isReady()) {
    dialog.showErrorBox('Mashiro 启动未完成', startupFailureDetail(diagnostic))
    process.exitCode = 1
    app.exit(1)
    return
  }
  if (app.isReady()) {
    const canRecover =
      cleanup === 'COMPLETE' && !!productionPathsForFailure && !productionOwnershipLost
    const selected = await dialog.showMessageBox({
      type: 'error',
      title: 'Mashiro 启动未完成',
      message: canRecover
        ? '现有数据未被替换。可以退出，或打开数据管理后在新进程中重试。'
        : '现有数据未被替换，本进程将退出。',
      detail: startupFailureDetail(diagnostic),
      buttons: canRecover ? ['退出', '数据管理', '从完整备份还原'] : ['退出'],
      cancelId: 0,
      defaultId: 0,
      noLink: true
    })
    if (canRecover && (selected.response === 1 || selected.response === 2)) {
      try {
        const session = await recoverProductionApplicationData(
          {
            paths: productionPathsForFailure!,
            dialogs: dialog,
            onOwnershipLost() {
              productionOwnershipLost = true
            },
            assertQuiescent() {
              if (assistantService || providerService || reminderRuntime)
                throw new Error('PRODUCTION_WRITERS_ACTIVE')
            }
          },
          selected.response === 1 ? 'manage' : 'restore'
        )
        if (session) {
          await session.release()
          app.relaunch()
          app.exit(0)
          return
        }
      } catch (recoveryError) {
        const recoveryDiagnostic = createStartupFailureDiagnostic(
          'SESSION_PREPARE',
          recoveryError,
          'NOT_STARTED'
        )
        persistStartupFailureDiagnostic(
          productionPathsForFailure?.configurationDirectory,
          recoveryDiagnostic
        )
        console.error('MASHIRO_STARTUP_RECOVERY_FAILURE', JSON.stringify(recoveryDiagnostic))
        dialog.showErrorBox('数据恢复未完成', startupFailureDetail(recoveryDiagnostic))
      }
    }
  }
  process.exitCode = 1
  app.exit(1)
}

app.on('before-quit', (event) => {
  if (releasingProduction) {
    event.preventDefault()
    return
  }
  reminderRuntime?.setQuitting(true)
  try {
    providerService?.close()
    assistantService?.close()
  } catch {
    event.preventDefault()
    reminderRuntime?.setQuitting(false)
    console.error('MASHIRO_SHUTDOWN_STORAGE_FAILURE')
    if (productionOwnershipLost) app.exit(1)
    else
      dialog.showErrorBox(
        '退出未完成',
        '存储关闭未确认，数据维护尚未开始。请重试退出；原数据和备份保留。'
      )
    return
  }
  reminderRuntime?.stop()
  reminderRuntime = undefined
  unregisterDailyIpc?.()
  unregisterDailyIpc = undefined
  unregisterOperationsIpc?.()
  unregisterOperationsIpc = undefined
  unregisterStewardIpc?.()
  unregisterStewardIpc = undefined
  unregisterBackgroundIpc?.()
  unregisterBackgroundIpc = undefined
  unregisterReminderIpc?.()
  unregisterReminderIpc = undefined
  unregisterItemIpc?.()
  unregisterItemIpc = undefined
  unregisterRetentionIpc?.()
  unregisterRetentionIpc = undefined
  unregisterMemoryIpc?.()
  unregisterMemoryIpc = undefined
  unregisterTimelineIpc?.()
  unregisterTimelineIpc = undefined
  unregisterProviderIpc?.()
  unregisterProviderIpc = undefined
  unregisterAssistantIpc?.()
  unregisterAssistantIpc = undefined
  providerService = undefined
  assistantService = undefined
  if (productionSession) {
    event.preventDefault()
    releasingProduction = true
    const session = productionSession
    productionSession = undefined
    const plan = plannedMaintenance
    plannedMaintenance = undefined
    void (async () => {
      let restart = false
      try {
        if (plan)
          restart = await plan.run(session, () => {
            if (assistantService || providerService) throw new Error('PRODUCTION_WRITERS_ACTIVE')
          })
      } catch {
        dialog.showErrorBox(
          '数据操作未完成',
          '未确认完成的数据操作不会切换当前数据。原数据和已生成的备份保留；请重新启动后检查所选目录。'
        )
      } finally {
        await session.release()
      }
      if (restart) app.relaunch()
      releasingProduction = false
      app.quit()
    })().catch(() => {
      console.error('MASHIRO_DATA_RELEASE_FAILURE')
      app.exit(1)
    })
  }
})

app.on('window-all-closed', () => {
  if (!reminderRuntime && !startupCleanupInProgress) app.quit()
})

void start().catch((error) => {
  void handleStartupFailure(error).catch(() => {
    console.error('MASHIRO_STARTUP_FAILURE_HANDLER_FAILED')
    app.exit(1)
  })
})
