import { app, Notification } from 'electron'
import { createHash } from 'node:crypto'
import type { ReminderPlatform } from './reminder-service.js'

export const reminderAppId = 'Mashiro.Desktop'
export function parseReminderActivation(argumentsText: string): { id: string; version: number }[] {
  if (argumentsText.length > 6000 || !argumentsText.startsWith('mashiro-reminders:')) return []
  const values = argumentsText.slice('mashiro-reminders:'.length).split(',')
  if (!values.length || values.length > 100) return []
  const result: { id: string; version: number }[] = []
  for (const value of values) {
    const match =
      /^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}):([1-9][0-9]{0,8})$/i.exec(
        value
      )
    if (!match) return []
    result.push({ id: match[1]!, version: Number(match[2]) })
  }
  return result
}
export function createWindowsReminderPlatform(): ReminderPlatform {
  const supported = () => process.platform === 'win32' && app.isPackaged
  const settings = () => ({ path: process.execPath, args: ['--mashiro-login'] })
  return {
    notificationSupported: () => Notification.isSupported(),
    loginStartupSupported: supported,
    getLoginStartup: () => supported() && app.getLoginItemSettings(settings()).openAtLogin,
    setLoginStartup: (value) => {
      if (!supported()) throw new Error('Login startup unavailable in development')
      app.setLoginItemSettings({ ...settings(), openAtLogin: value, name: 'Mashiro' })
    },
    show: (input, event) => {
      const activation =
        'mashiro-reminders:' + input.identities.map((i) => i.id + ':' + i.version).join(',')
      const body =
        input.count === 1
          ? '一项已保存的提醒到时。点击查看当前事项。'
          : input.count + '项已保存的提醒到时。点击查看提醒列表。'
      const notification = new Notification({
        id: createHash('sha256').update(activation).digest('hex').slice(0, 16),
        groupId: 'reminders',
        title: 'Mashiro 提醒',
        body,
        toastXml:
          '<toast launch="' +
          activation +
          '"><visual><binding template="ToastGeneric"><text>Mashiro 提醒</text><text>' +
          body +
          '</text></binding></visual></toast>'
      })
      notification.on('show', () => event('show'))
      notification.on('failed', () => event('failed'))
      notification.on('click', () => event('click'))
      notification.show()
      return { close: () => notification.close() }
    }
  }
}
