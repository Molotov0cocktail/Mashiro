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
  parseReminderGroupActivation,
  reminderAppId
} from './windows-reminder-platform.js'
import type { ReminderService } from './reminder-service.js'
import type { ReminderChanged } from '../../shared/reminder-contract.js'

export function startReminderRuntime(
  service: ReminderService,
  window: BrowserWindow,
  changed: (event: ReminderChanged) => void
): { stop(): void; setQuitting(value: boolean): void; restoreFromTrayForTest(): void } {
  app.setAppUserModelId(reminderAppId)
  let quitting = false
  const show = () => {
    if (!window.isDestroyed()) {
      if (window.isMinimized()) window.restore()
      window.show()
      window.focus()
    }
  }
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
  const tray = new Tray(nativeImage.createFromBitmap(pixels, { width: 24, height: 24 }))
  tray.setToolTip('Mashiro · 关闭窗口后提醒仍运行')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '打开 Mashiro', click: show },
      { label: '退出（退出后不再提醒）', click: () => app.quit() }
    ])
  )
  tray.on('double-click', show)
  const close = (event: { preventDefault(): void }) => {
    if (!quitting) {
      event.preventDefault()
      window.hide()
    }
  }
  window.on('close', close)
  app.on('second-instance', show)
  const safeTick = (recovery = false) => {
    try {
      service.tick(recovery)
    } catch {
      console.error('MASHIRO_REMINDER_STATE_UNAVAILABLE')
    }
  }
  const resume = () => safeTick(true)
  powerMonitor.on('resume', resume)
  service.attach(createWindowsReminderPlatform(), (event) => {
    if (event.kind !== 'changed') show()
    changed(event)
  })
  service.recover()
  if (process.platform === 'win32')
    Notification.handleActivation((details) => {
      if (details.type === 'click') {
        const groupId = parseReminderGroupActivation(details.arguments)
        if (groupId) service.activateGroup(groupId)
        else service.activateBatch(parseReminderActivation(details.arguments))
      }
    })
  const timer = setInterval(safeTick, 1000)
  return {
    setQuitting: (value) => {
      quitting = value
    },
    restoreFromTrayForTest: () => tray.emit('double-click'),
    stop: () => {
      clearInterval(timer)
      powerMonitor.removeListener('resume', resume)
      app.removeListener('second-instance', show)
      window.removeListener('close', close)
      if (process.platform === 'win32') Notification.handleActivation(() => undefined)
      service.close()
      tray.destroy()
    }
  }
}
