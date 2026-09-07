import { beforeEach, expect, it, vi } from 'vitest'

type LaunchItem = {
  name: string
  path: string
  args: string[]
  scope: 'user' | 'machine'
  enabled: boolean
}

type QueryOptions = { path: string; args: string[] }
type SetOptions = QueryOptions & { openAtLogin: boolean; enabled?: boolean }

const host = vi.hoisted(() => ({
  packaged: true,
  registry: null as LaunchItem | null,
  get: vi.fn(),
  set: vi.fn<(value: SetOptions) => void>()
}))

vi.mock('electron', () => ({
  app: {
    get isPackaged() {
      return host.packaged
    },
    getLoginItemSettings: (options: QueryOptions) => host.get(options),
    setLoginItemSettings: (value: SetOptions) => host.set(value)
  },
  Notification: class {
    static isSupported() {
      return true
    }
  }
}))

import {
  createWindowsReminderPlatform,
  quoteLoginExecutablePath,
  reminderAppId
} from '../../src/main/reminder/windows-reminder-platform.js'

const unquote = (value: string) =>
  value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value
const sameArgs = (left: string[], right: string[]) =>
  left.length === right.length && left.every((value, index) => value === right[index])
const item = (path = process.execPath, enabled = true, scope: 'user' | 'machine' = 'user') => ({
  name: reminderAppId,
  path,
  args: ['--mashiro-login'],
  scope,
  enabled
})

const installHostBehavior = () => {
  host.get.mockImplementation((options: QueryOptions) => {
    const path = unquote(options.path)
    const samePath =
      host.registry?.path.toLocaleLowerCase('en-US') === path.toLocaleLowerCase('en-US')
    const exact = samePath && sameArgs(host.registry!.args, options.args)
    return {
      openAtLogin: exact,
      executableWillLaunchAtLogin: samePath && host.registry?.enabled === true,
      launchItems: samePath
        ? [
            {
              ...structuredClone(host.registry!),
              args: host.registry!.args.filter((arg) => !arg.startsWith('-'))
            }
          ]
        : []
    }
  })
  host.set.mockImplementation((value) => {
    host.registry = value.openAtLogin
      ? {
          name: reminderAppId,
          path: unquote(value.path),
          args: [...value.args],
          scope: 'user',
          enabled: value.enabled ?? true
        }
      : null
  })
}

beforeEach(() => {
  host.packaged = true
  host.registry = null
  host.get.mockReset()
  host.set.mockReset()
  installHostBehavior()
})

it('quotes a Chinese installation path before Electron parses it as a command line', () => {
  expect(quoteLoginExecutablePath('C:\\合成 场景\\安装 旧版本\\Mashiro.exe')).toBe(
    '"C:\\合成 场景\\安装 旧版本\\Mashiro.exe"'
  )
})

it('reports enabled only when the exact user registration is enabled by Windows', () => {
  const platform = createWindowsReminderPlatform()
  host.registry = item(process.execPath, false)
  expect(platform.getLoginStartup()).toBe(false)

  host.registry = item()
  expect(platform.getLoginStartup()).toBe(true)

  host.registry = item(process.execPath, true, 'machine')
  expect(platform.getLoginStartup()).toBe(false)

  host.registry = item('C:\\old\\Mashiro.exe')
  expect(platform.getLoginStartup()).toBe(false)

  host.registry = { ...item(), args: ['--different-switch'] }
  expect(platform.getLoginStartup()).toBe(false)
  expect(host.get).toHaveBeenLastCalledWith({
    path: quoteLoginExecutablePath(process.execPath),
    args: ['--mashiro-login']
  })
})

it('uses the AppUserModelID registration name and explicitly enables StartupApproved', () => {
  const platform = createWindowsReminderPlatform()
  const mutation = platform.setLoginStartup(true)
  expect(host.set).toHaveBeenLastCalledWith({
    path: quoteLoginExecutablePath(process.execPath),
    args: ['--mashiro-login'],
    openAtLogin: true,
    enabled: true
  })
  expect(platform.getLoginStartup()).toBe(true)
  expect(mutation?.rollbackIfUnchanged()).toBe('UNKNOWN')
  expect(host.registry).toBeNull()
})

it('does not write a compensating registration after an unobservable disable', () => {
  host.registry = item()
  const mutation = createWindowsReminderPlatform().setLoginStartup(false)
  expect(mutation?.rollbackIfUnchanged()).toBe('UNKNOWN')
  expect(host.set).toHaveBeenCalledTimes(1)
  expect(host.registry).toBeNull()
})

it('preserves a concurrent different-path registration hidden after disable', () => {
  host.registry = item()
  const mutation = createWindowsReminderPlatform().setLoginStartup(false)
  host.registry = item('C:\\concurrent\\Mashiro.exe')

  expect(mutation?.rollbackIfUnchanged()).toBe('UNKNOWN')
  expect(host.set).toHaveBeenCalledTimes(1)
  expect(host.registry).toEqual(item('C:\\concurrent\\Mashiro.exe'))
})

it('restores the exact prior system-disabled state with Electron enabled false', () => {
  host.registry = item(process.execPath, false)
  const mutation = createWindowsReminderPlatform().setLoginStartup(true)
  expect(host.registry?.enabled).toBe(true)
  expect(mutation?.rollbackIfUnchanged()).toBe('RESTORED')
  expect(host.set).toHaveBeenLastCalledWith({
    path: quoteLoginExecutablePath(process.execPath),
    args: ['--mashiro-login'],
    openAtLogin: true,
    enabled: false
  })
  expect(host.registry).toEqual(item(process.execPath, false))
})

it('does not overwrite a concurrent Windows startup change during compensation', () => {
  const mutation = createWindowsReminderPlatform().setLoginStartup(true)
  host.registry = item(process.execPath, false)

  expect(mutation?.rollbackIfUnchanged()).toBe('CONCURRENT_CHANGE')
  expect(host.set).toHaveBeenCalledTimes(1)
  expect(host.registry).toEqual(item(process.execPath, false))
})

it('does not claim a hidden different-path registration was restored', () => {
  host.registry = item('C:\\old\\Mashiro.exe')
  const mutation = createWindowsReminderPlatform().setLoginStartup(true)
  expect(mutation?.rollbackIfUnchanged()).toBe('UNKNOWN')
  expect(host.registry).toBeNull()
})

it('does not reconstruct a same-path registration whose switches Electron omits', () => {
  host.registry = { ...item(), args: ['--different-switch'] }
  const mutation = createWindowsReminderPlatform().setLoginStartup(true)
  expect(mutation?.rollbackIfUnchanged()).toBe('UNKNOWN')
  expect(host.registry).toBeNull()
})

it('reports write-after-read and rollback read failures as unknown without a blind write', () => {
  let reads = 0
  const ordinaryGet = host.get.getMockImplementation()!
  host.get.mockImplementation((options: QueryOptions) => {
    reads += 1
    if (reads === 2) throw new Error('synthetic read failure')
    return ordinaryGet(options)
  })
  expect(() => createWindowsReminderPlatform().setLoginStartup(true)).toThrow(
    'synthetic read failure'
  )
  expect(host.set).toHaveBeenCalledTimes(1)

  host.get.mockImplementation(ordinaryGet)
  const mutation = createWindowsReminderPlatform().setLoginStartup(false)
  host.get.mockImplementation(() => {
    throw new Error('synthetic rollback read failure')
  })
  expect(mutation?.rollbackIfUnchanged()).toBe('UNKNOWN')
  expect(host.set).toHaveBeenCalledTimes(2)
})
