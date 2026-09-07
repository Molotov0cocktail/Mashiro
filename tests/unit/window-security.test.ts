import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const electron = vi.hoisted(() => {
  const listeners = new Map<string, (event: { preventDefault(): void }) => void>()
  const permission = vi.fn()
  const webContents = {
    setWindowOpenHandler: vi.fn(),
    on: vi.fn((name: string, listener: (event: { preventDefault(): void }) => void) => {
      listeners.set(name, listener)
    }),
    session: { setPermissionRequestHandler: permission }
  }
  const window = {
    webContents,
    loadURL: vi.fn().mockResolvedValue(undefined),
    loadFile: vi.fn().mockResolvedValue(undefined),
    show: vi.fn()
  }
  const BrowserWindow = vi.fn(function FakeBrowserWindow(options: unknown) {
    void options
    return window
  })
  return { app: { isPackaged: false }, BrowserWindow, listeners, permission, webContents, window }
})

vi.mock('electron', () => ({ app: electron.app, BrowserWindow: electron.BrowserWindow }))

import { createWindow, secureWebPreferences } from '../../src/main/app/create-window.js'

beforeEach(() => {
  vi.stubEnv('ELECTRON_RENDERER_URL', '')
  electron.app.isPackaged = false
  electron.listeners.clear()
  vi.clearAllMocks()
})

afterEach(() => vi.unstubAllEnvs())

describe('window security boundary', () => {
  it('loads only packaged renderer resources even when a development URL is inherited', async () => {
    electron.app.isPackaged = true
    vi.stubEnv('ELECTRON_RENDERER_URL', 'http://127.0.0.1:5173')
    await createWindow()
    expect(electron.window.loadURL).not.toHaveBeenCalled()
    expect(electron.window.loadFile).toHaveBeenCalledOnce()
  })
  it('keeps the sandboxed window, CSP, navigation, popup, and permission denials', async () => {
    await createWindow()

    expect(secureWebPreferences).toEqual({
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true
    })
    expect(electron.BrowserWindow).toHaveBeenCalledOnce()
    expect(electron.BrowserWindow.mock.calls[0]?.[0]).toMatchObject({
      webPreferences: secureWebPreferences
    })
    const openHandler = electron.webContents.setWindowOpenHandler.mock.calls[0]?.[0]
    expect(openHandler()).toEqual({ action: 'deny' })
    const navigationEvent = { preventDefault: vi.fn() }
    electron.listeners.get('will-navigate')?.(navigationEvent)
    expect(navigationEvent.preventDefault).toHaveBeenCalledOnce()
    const permissionHandler = electron.permission.mock.calls[0]?.[0]
    const permissionCallback = vi.fn()
    permissionHandler(undefined, 'notifications', permissionCallback)
    expect(permissionCallback).toHaveBeenCalledWith(false)
    expect(electron.window.loadFile).toHaveBeenCalledOnce()

    const html = readFileSync(new URL('../../src/renderer/index.html', import.meta.url), 'utf8')
    expect(html).toContain("default-src 'self'")
    expect(html).toContain("script-src 'self'")
    expect(html).toContain("object-src 'none'")
    expect(html).toContain("base-uri 'none'")
    expect(html).toContain("frame-src 'none'")
  })

  it('rejects a non-loopback development renderer URL before navigation', async () => {
    vi.stubEnv('ELECTRON_RENDERER_URL', 'https://example.com')
    await expect(createWindow()).rejects.toThrow('Development renderer URL must be loopback HTTP')
    expect(electron.window.loadURL).not.toHaveBeenCalled()
  })
})
