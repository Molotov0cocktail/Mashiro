import { app, ipcMain } from 'electron'
import { AssistantService } from './assistant/assistant-service.js'
import { createWindow } from './app/create-window.js'
import { resolveDataRoot } from './data/data-root.js'
import { registerAssistantIpc } from './ipc/register-assistant-ipc.js'
import { runE2ePhase } from './testing/e2e-controller.js'

let service: AssistantService | undefined
let unregisterIpc: (() => void) | undefined

async function start(): Promise<void> {
  const dataRoot = resolveDataRoot(app)
  await app.whenReady()
  service = AssistantService.open(dataRoot.databasePath)
  unregisterIpc = registerAssistantIpc(ipcMain, service)
  const window = await createWindow()
  await runE2ePhase(window, dataRoot)
}

app.on('before-quit', () => {
  unregisterIpc?.()
  unregisterIpc = undefined
  service?.close()
  service = undefined
})

app.on('window-all-closed', () => app.quit())

void start().catch(() => {
  console.error('MASHIRO_STARTUP_FAILURE')
  process.exitCode = 1
  app.exit(1)
})
