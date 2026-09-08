import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { BrowserWindow } from 'electron'
import type { ReminderPlatform, ReminderService } from '../../src/main/reminder/reminder-service.js'

const state = vi.hoisted(() => {
  const appListeners = new Map<string, (...args: unknown[]) => void>()
  const powerListeners = new Map<string, (...args: unknown[]) => void>()
  const trays: Array<{
    destroy: ReturnType<typeof vi.fn>
    emit: ReturnType<typeof vi.fn>
    on: ReturnType<typeof vi.fn>
    setContextMenu: ReturnType<typeof vi.fn>
    setToolTip: ReturnType<typeof vi.fn>
  }> = []
  return {
    appListeners,
    powerListeners,
    trays,
    handleActivation: vi.fn(),
    removeApp: vi.fn((name: string) => appListeners.delete(name)),
    removePower: vi.fn((name: string) => powerListeners.delete(name))
  }
})

vi.mock('electron', () => ({
  app: {
    on: vi.fn((name: string, handler: (...args: unknown[]) => void) =>
      state.appListeners.set(name, handler)
    ),
    removeListener: state.removeApp,
    quit: vi.fn()
  },
  Menu: { buildFromTemplate: vi.fn((value: unknown) => value) },
  nativeImage: { createFromBitmap: vi.fn(() => ({})) },
  Notification: { handleActivation: state.handleActivation },
  powerMonitor: {
    on: vi.fn((name: string, handler: (...args: unknown[]) => void) =>
      state.powerListeners.set(name, handler)
    ),
    removeListener: state.removePower
  },
  Tray: class {
    destroy = vi.fn()
    emit = vi.fn()
    on = vi.fn()
    setContextMenu = vi.fn()
    setToolTip = vi.fn()
    constructor() {
      state.trays.push(this)
    }
  }
}))

function fixture() {
  const windowListeners = new Map<string, (...args: unknown[]) => void>()
  const window = {
    focus: vi.fn(),
    hide: vi.fn(),
    isDestroyed: vi.fn(() => false),
    isMinimized: vi.fn(() => false),
    on: vi.fn((name: string, handler: (...args: unknown[]) => void) =>
      windowListeners.set(name, handler)
    ),
    removeListener: vi.fn((name: string) => windowListeners.delete(name)),
    restore: vi.fn(),
    show: vi.fn()
  }
  const service = {
    activateBatch: vi.fn(),
    activateGroup: vi.fn(),
    attach: vi.fn(),
    close: vi.fn(),
    recover: vi.fn(),
    tick: vi.fn()
  }
  return {
    platform: {} as ReminderPlatform,
    service: service as unknown as ReminderService,
    serviceSpies: service,
    window: window as unknown as BrowserWindow,
    windowSpies: window
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  state.appListeners.clear()
  state.powerListeners.clear()
  state.trays.length = 0
  state.handleActivation.mockReset()
  state.removeApp.mockClear()
  state.removePower.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
})

it('reports incomplete startup rollback when a tray cannot be destroyed', async () => {
  const { startReminderRuntime } = await import('../../src/main/reminder/reminder-runtime.js')
  const f = fixture()
  f.serviceSpies.recover.mockImplementationOnce(() => {
    state.trays[0]!.destroy.mockImplementationOnce(() => {
      throw new Error('SYNTHETIC_TRAY_BUSY')
    })
    throw new Error('SYNTHETIC_RECOVERY_FAILED')
  })
  let failure: unknown
  try {
    startReminderRuntime(f.service, f.window, vi.fn(), f.platform)
  } catch (error) {
    failure = error
  }
  expect(state.trays[0]!.destroy).toHaveBeenCalledOnce()
  expect(failure).toMatchObject({ startupCleanup: 'FAILED' })
})
