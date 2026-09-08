import { beforeEach, expect, it, vi } from 'vitest'
const host = vi.hoisted(() => ({
  packaged: false,
  startup: false,
  startupEnabled: false,
  set: vi.fn(),
  options: [] as unknown[],
  callbacks: new Map<string, () => void>()
}))
vi.mock('electron', () => ({
  app: {
    get isPackaged() {
      return host.packaged
    },
    getLoginItemSettings: () => ({
      openAtLogin: host.startup,
      executableWillLaunchAtLogin: host.startup && host.startupEnabled,
      launchItems: host.startup
        ? [
            {
              name: 'io.github.molotov0cocktail.mashiro',
              path: process.execPath,
              args: ['--mashiro-login'],
              scope: 'user',
              enabled: host.startupEnabled
            }
          ]
        : []
    }),
    setLoginItemSettings: (value: { openAtLogin: boolean; enabled?: boolean }) => {
      host.set(value)
      host.startup = value.openAtLogin
      host.startupEnabled = value.openAtLogin
    }
  },
  Notification: class {
    static isSupported() {
      return true
    }
    constructor(value: unknown) {
      host.options.push(value)
    }
    on(name: string, fn: () => void) {
      host.callbacks.set(name, fn)
      return this
    }
    show() {
      host.callbacks.get('show')?.()
    }
    close() {}
  }
}))
import {
  createWindowsReminderPlatform,
  parseReminderActivation
} from '../../src/main/reminder/windows-reminder-platform.js'
import { reminderChannels, reminderNavigationChannels } from '../../src/shared/reminder-channels.js'
import { registerReminderIpc } from '../../src/main/ipc/register-reminder-ipc.js'
import type { ReminderService } from '../../src/main/reminder/reminder-service.js'
import type { ReminderNavigationBroker } from '../../src/main/reminder/reminder-navigation.js'
beforeEach(() => {
  host.packaged = false
  host.startup = false
  host.startupEnabled = false
  host.set.mockClear()
  host.options = []
  host.callbacks.clear()
})
it('accepts only bounded reminder activation identities and rejects paths, scripts and oversized inputs', () => {
  const id = '01234567-89ab-4def-8123-456789abcdef'
  expect(parseReminderActivation('mashiro-reminders:' + id + ':1')).toEqual([{ id, version: 1 }])
  for (const bad of [
    'file:///private',
    'mashiro-reminders:' + id + ':0',
    'mashiro-reminders:' + id + ':1<script>',
    'mashiro-reminders:' + id + ':1,' + 'x'.repeat(6000)
  ])
    expect(parseReminderActivation(bad)).toEqual([])
})
it('development never registers login startup; packaged settings target this executable with exact args', () => {
  const platform = createWindowsReminderPlatform()
  expect(platform.loginStartupSupported()).toBe(false)
  expect(() => platform.setLoginStartup(true)).toThrow()
  expect(host.set).not.toHaveBeenCalled()
  host.packaged = true
  platform.setLoginStartup(true)
  expect(host.set).toHaveBeenCalledWith({
    path: `"${process.execPath}"`,
    args: ['--mashiro-login'],
    openAtLogin: true,
    enabled: true
  })
  expect(platform.getLoginStartup()).toBe(true)
  platform.setLoginStartup(false)
  expect(platform.getLoginStartup()).toBe(false)
})
it('native notification carries only stable identities and generic text; event observation remains separate', () => {
  host.packaged = true
  const platform = createWindowsReminderPlatform()
  const events: string[] = []
  platform.show(
    { identities: [{ id: '01234567-89ab-4def-8123-456789abcdef', version: 2 }], count: 1 },
    (event) => events.push(event)
  )
  expect(events).toEqual(['show'])
  expect(host.options[0]).toMatchObject({
    title: 'Mashiro 提醒',
    body: '一项已保存的提醒到时。点击查看当前事项。'
  })
  expect(JSON.stringify(host.options[0])).toContain(
    'mashiro-reminders:01234567-89ab-4def-8123-456789abcdef:2'
  )
})
it('reminder IPC rejects subframe/untrusted callers before service access and validates outbound results', () => {
  const handlers = new Map<string, (event: unknown, input: unknown) => unknown>()
  const query = vi.fn(() => ({ ok: true, data: { arbitraryPath: 'private' } }))
  const service = { query } as unknown as ReminderService
  const pendingNavigation = vi.fn(() => ({ ok: true as const, data: null }))
  const navigation = {
    pendingNavigation,
    ackNavigation: vi.fn()
  } as unknown as ReminderNavigationBroker
  const remove = vi.fn()
  const unregister = registerReminderIpc(
    {
      handle: (name, fn) => {
        handlers.set(name, fn)
      },
      removeHandler: remove
    },
    service,
    navigation,
    (event) => event === 'trusted'
  )
  expect(handlers.get(reminderChannels.query)!('untrusted', {})).toMatchObject({
    ok: false,
    error: { code: 'PERMISSION_DENIED' }
  })
  expect(query).not.toHaveBeenCalled()
  expect(handlers.get(reminderChannels.query)!('trusted', {})).toMatchObject({
    ok: false,
    error: { code: 'STORAGE_UNAVAILABLE' }
  })
  expect(handlers.get(reminderNavigationChannels.pending)!('untrusted', {})).toMatchObject({
    ok: false,
    error: { code: 'PERMISSION_DENIED' }
  })
  expect(pendingNavigation).not.toHaveBeenCalled()
  expect(
    handlers.get(reminderNavigationChannels.pending)!('trusted', {
      protocolVersion: 1,
      assistantId: '01234567-89ab-4def-8123-456789abcdef',
      assistantRevision: 1
    })
  ).toEqual({ ok: true, data: null })
  unregister()
  expect(remove).toHaveBeenCalledTimes(
    Object.keys(reminderChannels).length + Object.keys(reminderNavigationChannels).length
  )
})
