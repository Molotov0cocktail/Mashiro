import { app, ipcMain, safeStorage } from 'electron'
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
  unregisterAssistantIpc = registerAssistantIpc(ipcMain, assistantService)
  unregisterProviderIpc = registerProviderIpc(ipcMain, providerService)
  const window = await createWindow()
  await runE2ePhase(window, dataRoot)
}

app.on('before-quit', () => {
  unregisterProviderIpc?.()
  unregisterProviderIpc = undefined
  unregisterAssistantIpc?.()
  unregisterAssistantIpc = undefined
  providerService?.close()
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
