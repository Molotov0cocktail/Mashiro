import { app, Notification } from 'electron'
import { createHash } from 'node:crypto'
import type { ReminderPlatform } from './reminder-service.js'
import {
  loginStartupArgument,
  productionAppUserModelId
} from '../../shared/windows-app-identity.mjs'

export const reminderAppId = productionAppUserModelId
export const quoteLoginExecutablePath = (path: string) => `"${path}"`
type LoginItem = ReturnType<typeof app.getLoginItemSettings>['launchItems'][number]
type LoginSnapshot = {
  openAtLogin: boolean
  executableWillLaunchAtLogin: boolean
  item: Pick<LoginItem, 'name' | 'path' | 'args' | 'scope' | 'enabled'> | null
}

const sameLoginSnapshot = (left: LoginSnapshot, right: LoginSnapshot) =>
  JSON.stringify(left) === JSON.stringify(right)
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
export function parseReminderGroupActivation(argumentsText: string): string | null {
  const match = /^mashiro-reminder-group:([a-f0-9]{64})$/.exec(argumentsText)
  return match?.[1] ?? null
}
export function createWindowsReminderPlatform(): ReminderPlatform {
  const supported = () => process.platform === 'win32' && app.isPackaged
  const settings = () => ({
    path: quoteLoginExecutablePath(process.execPath),
    args: [loginStartupArgument]
  })
  const snapshot = (): LoginSnapshot => {
    const current = app.getLoginItemSettings(settings())
    const item = current.launchItems.find(
      (candidate) => candidate.name === reminderAppId && candidate.scope === 'user'
    )
    return {
      openAtLogin: current.openAtLogin,
      executableWillLaunchAtLogin: current.executableWillLaunchAtLogin,
      item: item
        ? {
            name: item.name,
            path: item.path,
            args: [...item.args],
            scope: item.scope,
            enabled: item.enabled
          }
        : null
    }
  }
  return {
    notificationSupported: () => supported() && Notification.isSupported(),
    loginStartupSupported: supported,
    getLoginStartup: () => {
      if (!supported()) return false
      const current = snapshot()
      return (
        current.openAtLogin &&
        current.executableWillLaunchAtLogin &&
        current.item?.path.toLocaleLowerCase('en-US') ===
          process.execPath.toLocaleLowerCase('en-US') &&
        current.item.enabled
      )
    },
    setLoginStartup: (value) => {
      if (!supported()) throw new Error('Login startup unavailable in development')
      const before = snapshot()
      app.setLoginItemSettings({ ...settings(), openAtLogin: value, enabled: value })
      const after = snapshot()
      return {
        rollbackIfUnchanged: () => {
          try {
            const current = snapshot()
            if (!sameLoginSnapshot(current, after)) return 'CONCURRENT_CHANGE'
            if (sameLoginSnapshot(before, after)) return 'UNCHANGED'
            // A successful disable and a concurrent move to another path are identical
            // through this API. Never write a compensating registration without the exact
            // entry created by this operation still being observable.
            if (!after.openAtLogin || !after.item) return 'UNKNOWN'
            if (before.openAtLogin && before.item) {
              app.setLoginItemSettings({
                ...settings(),
                openAtLogin: true,
                enabled: before.item.enabled
              })
              return sameLoginSnapshot(snapshot(), before) ? 'RESTORED' : 'UNKNOWN'
            }
            // Electron omits command-line switches from launchItems.args and only enumerates
            // entries at the queried path. Remove this call's exact entry, but do not claim
            // an earlier different-path or different-arguments registration was restored.
            app.setLoginItemSettings({ ...settings(), openAtLogin: false, enabled: false })
            snapshot()
            return 'UNKNOWN'
          } catch {
            return 'UNKNOWN'
          }
        }
      }
    },
    show: (input, event) => {
      if (!supported()) throw new Error('Native notifications unavailable in development')
      if (input.groupId !== undefined && !/^[a-f0-9]{64}$/.test(input.groupId))
        throw new Error('Invalid notification group')
      const activation = input.groupId
        ? 'mashiro-reminder-group:' + input.groupId
        : 'mashiro-reminders:' + input.identities.map((i) => i.id + ':' + i.version).join(',')
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
