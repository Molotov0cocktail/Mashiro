import { expect, it, vi } from 'vitest'
import {
  canUseE2eReminderPlatform,
  createE2eReminderPlatform
} from '../../src/main/testing/e2e-reminder.js'

it('allows the synthetic platform only for a marker-validated nonpackaged test profile', () => {
  expect(canUseE2eReminderPlatform(false, 'test')).toBe(true)
  expect(canUseE2eReminderPlatform(true, 'test')).toBe(false)
  expect(canUseE2eReminderPlatform(false, 'development')).toBe(false)
  expect(canUseE2eReminderPlatform(false, 'production')).toBe(false)
})
it('observes synthetic test delivery without exposing login integration or constructing a native presenter', async () => {
  const platform = createE2eReminderPlatform()
  const observed = vi.fn()
  expect(platform.notificationSupported()).toBe(true)
  expect(platform.loginStartupSupported()).toBe(false)
  expect(platform.getLoginStartup()).toBe(false)
  expect(() => platform.setLoginStartup(true)).toThrow('E2E_REMINDER_LOGIN_UNAVAILABLE')

  const handle = platform.show(
    { identities: [{ id: '01234567-89ab-4def-8123-456789abcdef', version: 1 }], count: 1 },
    observed
  )
  await vi.waitFor(() => expect(observed).toHaveBeenCalledWith('show'))
  handle.close()
})
