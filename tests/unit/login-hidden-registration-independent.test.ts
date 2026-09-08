import { expect, it, vi } from 'vitest'

const host = vi.hoisted(() => ({
  registration: null as null | { path: string; args: string[]; enabled: boolean },
  set: vi.fn()
}))
vi.mock('electron', () => ({
  app: {
    isPackaged: true,
    getLoginItemSettings: () => {
      const row = host.registration
      const visible = row?.path === process.execPath
      return {
        openAtLogin: visible && row?.args.join(' ') === '--mashiro-login',
        executableWillLaunchAtLogin: visible && row?.enabled === true,
        launchItems: visible
          ? [
              {
                name: 'io.github.molotov0cocktail.mashiro',
                path: row.path,
                args: [],
                scope: 'user',
                enabled: row.enabled
              }
            ]
          : []
      }
    },
    setLoginItemSettings: (input: {
      path: string
      args: string[]
      openAtLogin: boolean
      enabled: boolean
    }) => {
      host.set(input)
      host.registration = input.openAtLogin
        ? { path: input.path.replace(/^"|"$/g, ''), args: [...input.args], enabled: input.enabled }
        : null
    }
  },
  Notification: class {
    static isSupported() {
      return true
    }
  }
}))

import { createWindowsReminderPlatform } from '../../src/main/reminder/windows-reminder-platform.js'

it('does not overwrite a concurrent different-path registration hidden by Electron after disabling startup', () => {
  host.set.mockClear()
  host.registration = { path: process.execPath, args: ['--mashiro-login'], enabled: true }
  const mutation = createWindowsReminderPlatform().setLoginStartup(false)
  const external = {
    path: 'D:\\Synthetic Other Mashiro\\Mashiro.exe',
    args: ['--different'],
    enabled: true
  }
  host.registration = external
  expect(mutation?.rollbackIfUnchanged()).toBe('UNKNOWN')
  expect(host.set).toHaveBeenCalledTimes(1)
  expect(host.registration).toEqual(external)
})
