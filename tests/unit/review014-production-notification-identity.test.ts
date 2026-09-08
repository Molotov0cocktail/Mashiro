import { beforeEach, expect, it, vi } from 'vitest'
const host = vi.hoisted(() => ({
  packaged: false,
  supported: vi.fn(() => true),
  constructed: vi.fn(),
  shown: vi.fn()
}))
vi.mock('electron', () => ({
  app: {
    get isPackaged() {
      return host.packaged
    }
  },
  Notification: class {
    static isSupported = host.supported
    constructor(options: unknown) {
      host.constructed(options)
    }
    on() {
      return this
    }
    show() {
      host.shown()
    }
    close() {}
  }
}))
import { createWindowsReminderPlatform } from '../../src/main/reminder/windows-reminder-platform.js'
beforeEach(() => {
  host.packaged = false
  vi.clearAllMocks()
})
it('development capability checks must not initialize Electron native notification presenter', () => {
  const platform = createWindowsReminderPlatform()
  expect(platform.notificationSupported()).toBe(false)
  expect(host.supported).not.toHaveBeenCalled()
})
it('development direct show cannot escape capability guard and publish a real system notification', () => {
  const platform = createWindowsReminderPlatform()
  try {
    platform.show(
      { identities: [{ id: '01234567-89ab-4def-8123-456789abcdef', version: 1 }], count: 1 },
      vi.fn()
    )
  } catch {
    // An explicit unavailable rejection is allowed; native construction is not.
  }
  expect(host.constructed).not.toHaveBeenCalled()
  expect(host.shown).not.toHaveBeenCalled()
})

it.skipIf(process.platform !== 'win32')(
  'packaged capability and real platform show still reach Electron with bounded reminder identity',
  () => {
    host.packaged = true
    const platform = createWindowsReminderPlatform()
    expect(platform.notificationSupported()).toBe(true)
    expect(host.supported).toHaveBeenCalledOnce()
    const groupId = 'a'.repeat(64)
    platform.show({ identities: [], count: 1, groupId }, vi.fn())
    expect(host.constructed).toHaveBeenCalledWith(
      expect.objectContaining({
        groupId: 'reminders',
        toastXml: expect.stringContaining('mashiro-reminder-group:' + groupId)
      })
    )
    expect(host.shown).toHaveBeenCalledOnce()
  }
)
