import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'

export const secureWebPreferences = {
  contextIsolation: true,
  sandbox: true,
  nodeIntegration: false,
  webSecurity: true
} as const

function validatedDevelopmentUrl(value: string): string {
  const url = new URL(value)
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname)) {
    throw new Error('Development renderer URL must be loopback HTTP')
  }
  return url.href
}

export async function createWindow(): Promise<BrowserWindow> {
  const window = new BrowserWindow({
    width: 960,
    height: 680,
    minWidth: 720,
    minHeight: 520,
    show: false,
    webPreferences: {
      ...secureWebPreferences,
      preload: join(__dirname, '../preload/index.cjs')
    }
  })

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => event.preventDefault())
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) =>
    callback(false)
  )

  const developmentUrl = app.isPackaged ? undefined : process.env.ELECTRON_RENDERER_URL
  if (developmentUrl) await window.loadURL(validatedDevelopmentUrl(developmentUrl))
  else await window.loadFile(join(__dirname, '../renderer/index.html'))
  window.show()
  return window
}
