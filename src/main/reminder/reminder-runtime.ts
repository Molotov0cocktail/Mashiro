import {
  app,
  Menu,
  nativeImage,
  Notification,
  powerMonitor,
  Tray,
  type BrowserWindow
} from 'electron'
import {
  createWindowsReminderPlatform,
  parseReminderActivation,
  parseReminderGroupActivation
} from './windows-reminder-platform.js'
import type { ReminderPlatform, ReminderService } from './reminder-service.js'
import type { ReminderChanged } from '../../shared/reminder-contract.js'

class ReminderStartupCleanupError extends Error {
  readonly startupCleanup = 'FAILED'

  constructor(
    readonly original: unknown,
    readonly cleanupFailure: unknown
  ) {
    super('REMINDER_STARTUP_CLEANUP_FAILED')
  }
}

export function startReminderRuntime(
  service: ReminderService,
  window: BrowserWindow,
  changed: (event: ReminderChanged) => void,
  platform: ReminderPlatform = createWindowsReminderPlatform()
): { stop(): void; setQuitting(value: boolean): void; restoreFromTrayForTest(): void } {
  let quitting = false
  let tray: Tray | undefined
  let timer: ReturnType<typeof setInterval> | undefined
  let windowListening = false
  let appListening = false
  let powerListening = false
  let activationListening = false
  let stopped = false
  const show = () => {
    if (!window.isDestroyed()) {
      if (window.isMinimized()) window.restore()
      window.show()
      window.focus()
    }
  }
  const close = (event: { preventDefault(): void }) => {
    if (!quitting) {
      event.preventDefault()
      window.hide()
    }
  }
  const safeTick = (recovery = false) => {
    try {
      service.tick(recovery)
    } catch {
      console.error('MASHIRO_REMINDER_STATE_UNAVAILABLE')
    }
  }
  const resume = () => safeTick(true)
  const detachShell = (): unknown => {
    let firstFailure: unknown
    const attempt = (operation: () => void) => {
      try {
        operation()
      } catch (error) {
        firstFailure ??= error
      }
    }
    if (timer) {
      clearInterval(timer)
      timer = undefined
    }
    if (powerListening) {
      attempt(() => powerMonitor.removeListener('resume', resume))
      powerListening = false
    }
    if (appListening) {
      attempt(() => app.removeListener('second-instance', show))
      appListening = false
    }
    if (windowListening) {
      attempt(() => window.removeListener('close', close))
      windowListening = false
    }
    if (activationListening) {
      attempt(() => Notification.handleActivation(() => undefined))
      activationListening = false
    }
    if (tray) {
      const current = tray
      tray = undefined
      attempt(() => current.destroy())
    }
    return firstFailure
  }

  try {
    const pixels = Buffer.alloc(24 * 24 * 4)
    for (let y = 0; y < 24; y++)
      for (let x = 0; x < 24; x++) {
        if ((x - 11.5) ** 2 + (y - 11.5) ** 2 > 132) continue
        const white =
          (x >= 6 && x <= 8 && y >= 6 && y <= 18) ||
          (x >= 15 && x <= 17 && y >= 6 && y <= 18) ||
          (y >= 7 && y <= 12 && Math.abs(x - 11.5) <= y - 6)
        const offset = (y * 24 + x) * 4
        pixels[offset] = white ? 255 : 193
        pixels[offset + 1] = white ? 255 : 105
        pixels[offset + 2] = white ? 255 : 63
        pixels[offset + 3] = 255
      }
    tray = new Tray(nativeImage.createFromBitmap(pixels, { width: 24, height: 24 }))
    tray.setToolTip('Mashiro · 关闭窗口后提醒仍运行')
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: '打开 Mashiro', click: show },
        { label: '退出（退出后不再提醒）', click: () => app.quit() }
      ])
    )
    tray.on('double-click', show)
    window.on('close', close)
    windowListening = true
    app.on('second-instance', show)
    appListening = true
    powerMonitor.on('resume', resume)
    powerListening = true
    service.attach(platform, (event) => {
      if (event.kind !== 'changed') show()
      changed(event)
    })
    service.recover()
    if (process.platform === 'win32') {
      activationListening = true
      Notification.handleActivation((details) => {
        if (details.type === 'click') {
          const groupId = parseReminderGroupActivation(details.arguments)
          if (groupId) service.activateGroup(groupId)
          else service.activateBatch(parseReminderActivation(details.arguments))
        }
      })
    }
    timer = setInterval(safeTick, 1000)
    return {
      setQuitting: (value) => {
        quitting = value
      },
      restoreFromTrayForTest: () => tray?.emit('double-click'),
      stop: () => {
        if (stopped) return
        stopped = true
        const shellFailure = detachShell()
        let serviceFailure: unknown
        try {
          service.close()
        } catch (error) {
          serviceFailure = error
        }
        if (serviceFailure) throw serviceFailure
        if (shellFailure) throw shellFailure
      }
    }
  } catch (error) {
    stopped = true
    const cleanupFailure = detachShell()
    if (cleanupFailure) throw new ReminderStartupCleanupError(error, cleanupFailure)
    throw error
  }
}
