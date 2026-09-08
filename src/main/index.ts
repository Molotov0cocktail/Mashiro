import { app, BrowserWindow, dialog, ipcMain, safeStorage, type IpcMainInvokeEvent } from 'electron'
import {
  openProductionApplicationData,
  prepareProductionRuntimePaths
} from './data/production-bootstrap.js'
import type { ProductionSession } from './data/production-session.js'
import type { ProductionMaintenance } from './data/production-maintenance.js'
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
  initializeWindowsAppIdentity()
  const productionPaths = app.isPackaged ? prepareProductionRuntimePaths(app) : undefined
  let dataRoot: DataRoot | undefined = productionPaths ? undefined : resolveDataRoot(app)
  if (!app.requestSingleInstanceLock()) {
    app.quit()
    return
  }
  await app.whenReady()
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
  assistantService = AssistantService.open(dataRoot.databasePath)
  providerService = ProviderService.open(
    dataRoot.databasePath,
    dataRoot.credentialDirectory,
    safeStorage,
    dataRoot.profile === 'test' ? e2eProviderTransport : undefined
  )
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
  const window = await createWindow()
  if (productionPaths)
    installProductionMenu({
      dataPath: dataRoot.root,
      backupParentDirectory: productionPaths.backupParentDirectory,
      begin(plan) {
        if (releasingProduction || plannedMaintenance) return
        plannedMaintenance = plan
        app.quit()
      }
    })
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
  if (!reminderRuntime) app.quit()
})

void start().catch(() => {
  if (app.isReady())
    dialog.showErrorBox(
      'Mashiro 无法启动',
      '数据位置、完整性或启动条件不满足。现有数据不会被替换为空数据。请检查数据目录和备份后重试。'
    )
  console.error('MASHIRO_STARTUP_FAILURE')
  process.exitCode = 1
  app.exit(1)
})
