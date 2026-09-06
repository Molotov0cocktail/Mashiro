import { app, BrowserWindow, ipcMain, safeStorage, type IpcMainInvokeEvent } from 'electron'
import { registerRetentionIpc } from './ipc/register-retention-ipc.js'
import { registerMemoryIpc } from './ipc/register-memory-ipc.js'
import { registerTimelineIpc } from './ipc/register-timeline-ipc.js'
import { AssistantService } from './assistant/assistant-service.js'
import { createWindow } from './app/create-window.js'
import { resolveDataRoot } from './data/data-root.js'
import { registerAssistantIpc } from './ipc/register-assistant-ipc.js'
import { registerProviderIpc } from './ipc/register-provider-ipc.js'
import { ProviderService } from './provider/provider-service.js'
import { e2eProviderTransport, runE2ePhase } from './testing/e2e-controller.js'

let assistantService: AssistantService | undefined
let providerService: ProviderService | undefined
let unregisterAssistantIpc: (() => void) | undefined
let unregisterProviderIpc: (() => void) | undefined
let unregisterTimelineIpc: (() => void) | undefined
let unregisterMemoryIpc: (() => void) | undefined
let unregisterRetentionIpc: (() => void) | undefined

async function start(): Promise<void> {
  const dataRoot = resolveDataRoot(app)
  await app.whenReady()
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
  const window = await createWindow()
  await runE2ePhase(window, dataRoot)
}

app.on('before-quit', (event) => {
  try {
    providerService?.close()
  } catch {
    event.preventDefault()
    console.error('MASHIRO_SHUTDOWN_STORAGE_FAILURE')
    return
  }
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
  assistantService?.close()
  assistantService = undefined
})

app.on('window-all-closed', () => app.quit())

void start().catch(() => {
  console.error('MASHIRO_STARTUP_FAILURE')
  process.exitCode = 1
  app.exit(1)
})
