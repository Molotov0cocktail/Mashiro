import { beforeEach, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => {
  const handlers = new Map<string, (event: { preventDefault(): void }) => void>()
  const order: string[] = []
  const changed = { onChanged: vi.fn() }
  const provider = {
    close: vi.fn(() => {
      order.push('provider')
    }),
    background: changed,
    steward: changed,
    daily: changed,
    operations: changed,
    reminders: {},
    items: {},
    memory: {},
    retention: {}
  }
  const assistant = {
    close: vi.fn(() => {
      order.push('assistant')
    })
  }
  const session = {
    dataPath: 'synthetic-data',
    databasePath: 'synthetic-data/mashiro.sqlite',
    credentialDirectory: 'synthetic-data/credentials',
    dataSetId: 'synthetic-id',
    release: vi.fn(async () => {
      order.push('session')
    })
  }
  const recoverySession = {
    release: vi.fn(async () => {
      order.push('recovery-session')
    })
  }
  const window = {
    destroy: vi.fn(() => order.push('window')),
    hide: vi.fn(),
    isDestroyed: vi.fn(() => false),
    webContents: { send: vi.fn() }
  }
  const app = {
    isPackaged: true,
    isReady: vi.fn(() => false),
    requestSingleInstanceLock: () => true,
    whenReady: vi.fn(async () => {}),
    on: vi.fn((name: string, handler: (event: { preventDefault(): void }) => void) =>
      handlers.set(name, handler)
    ),
    quit: vi.fn(),
    exit: vi.fn(),
    relaunch: vi.fn()
  }
  return {
    app,
    assistant,
    createDiagnostic: vi.fn((stage: string, _error: unknown, cleanup: string) => ({
      formatVersion: 1,
      correlationId: '00000000-0000-4000-8000-000000000019',
      observedAt: '2026-09-08T00:00:00.000Z',
      stage,
      code: 'UNEXPECTED',
      cleanup
    })),
    dialogResponse: 0,
    handlers,
    order,
    persistDiagnostic: vi.fn((directory: unknown, value: unknown) => {
      void directory
      void value
      return true
    }),
    provider,
    recoverySession,
    recover: vi.fn((options: unknown, action: unknown): Promise<unknown> => {
      void options
      void action
      return Promise.resolve(null)
    }),
    session,
    showErrorBox: vi.fn(),
    showMessageBox: vi.fn(),
    startRuntime: vi.fn(),
    unregister: vi.fn(() => order.push('ipc')),
    window
  }
})

vi.mock('electron', () => ({
  app: state.app,
  dialog: {
    showErrorBox: state.showErrorBox,
    showMessageBox: (...args: unknown[]) => {
      state.showMessageBox(...args)
      return Promise.resolve({ response: state.dialogResponse })
    }
  },
  ipcMain: {},
  safeStorage: {},
  BrowserWindow: {
    fromWebContents: vi.fn(),
    getAllWindows: () => []
  }
}))

vi.mock('../../src/main/data/production-bootstrap.js', () => ({
  prepareProductionRuntimePaths: () => {
    throw Object.assign(new Error('opaque'), { code: 'EACCES' })
  },
  openProductionApplicationData: async () => state.session,
  recoverProductionApplicationData: (options: unknown, action: unknown) =>
    state.recover(options, action)
}))

vi.mock('../../src/main/data/startup-diagnostics.js', () => ({
  createStartupFailureDiagnostic: (stage: string, error: unknown, cleanup: string) =>
    state.createDiagnostic(stage, error, cleanup),
  persistStartupFailureDiagnostic: (directory: unknown, value: unknown) =>
    state.persistDiagnostic(directory, value),
  startupFailureDetail: () => 'SAFE_DETAIL'
}))

vi.mock('../../src/main/data/data-root.js', () => ({ resolveDataRoot: vi.fn() }))
vi.mock('../../src/main/assistant/assistant-service.js', () => ({
  AssistantService: { open: () => state.assistant }
}))
vi.mock('../../src/main/provider/provider-service.js', () => ({
  ProviderService: { open: () => state.provider }
}))
vi.mock('../../src/main/app/create-window.js', () => ({ createWindow: async () => state.window }))
vi.mock('../../src/main/app/production-menu.js', () => ({ installProductionMenu: vi.fn() }))
vi.mock('../../src/main/app/windows-app-identity.js', () => ({
  initializeWindowsAppIdentity: vi.fn()
}))
vi.mock('../../src/main/reminder/reminder-runtime.js', () => ({
  startReminderRuntime: (...args: unknown[]) => state.startRuntime(...args)
}))
vi.mock('../../src/main/testing/e2e-controller.js', () => ({
  canUseE2eReminderPlatform: () => false,
  createE2eReminderPlatform: vi.fn(),
  e2eProviderTransport: vi.fn(),
  runE2ePhase: vi.fn()
}))

vi.mock('../../src/main/ipc/register-assistant-ipc.js', () => ({
  registerAssistantIpc: () => state.unregister
}))
vi.mock('../../src/main/ipc/register-background-ipc.js', () => ({
  emitBackgroundChanged: vi.fn(),
  registerBackgroundIpc: () => state.unregister
}))
vi.mock('../../src/main/ipc/register-daily-ipc.js', () => ({
  emitDailyChanged: vi.fn(),
  registerDailyIpc: () => state.unregister
}))
vi.mock('../../src/main/ipc/register-item-ipc.js', () => ({
  registerItemIpc: () => state.unregister
}))
vi.mock('../../src/main/ipc/register-memory-ipc.js', () => ({
  registerMemoryIpc: () => state.unregister
}))
vi.mock('../../src/main/ipc/register-operations-ipc.js', () => ({
  emitOperationsChanged: vi.fn(),
  registerOperationsIpc: () => state.unregister
}))
vi.mock('../../src/main/ipc/register-provider-ipc.js', () => ({
  registerProviderIpc: () => state.unregister
}))
vi.mock('../../src/main/ipc/register-reminder-ipc.js', () => ({
  emitReminderChanged: vi.fn(),
  registerReminderIpc: () => state.unregister
}))
vi.mock('../../src/main/ipc/register-retention-ipc.js', () => ({
  registerRetentionIpc: () => state.unregister
}))
vi.mock('../../src/main/ipc/register-steward-ipc.js', () => ({
  emitStewardChanged: vi.fn(),
  registerStewardIpc: () => state.unregister
}))
vi.mock('../../src/main/ipc/register-timeline-ipc.js', () => ({
  registerTimelineIpc: () => state.unregister
}))

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  state.handlers.clear()
  state.order.length = 0
  state.dialogResponse = 0
  state.provider.close.mockImplementation(() => {
    state.order.push('provider')
  })
  state.assistant.close.mockImplementation(() => {
    state.order.push('assistant')
  })
  state.session.release.mockImplementation(async () => {
    state.order.push('session')
  })
  state.recoverySession.release.mockImplementation(async () => {
    state.order.push('recovery-session')
  })
  state.recover.mockResolvedValue(null)
  state.startRuntime.mockImplementation(() => {
    throw new Error('SYNTHETIC_REMINDER_START')
  })
})

async function bootUntilExit(): Promise<void> {
  await import('../../src/main/index.js')
  await vi.waitFor(() => expect(state.app.exit).toHaveBeenCalled())
}

it('shows a safe user-visible diagnostic even when runtime paths fail before app readiness', async () => {
  state.app.whenReady.mockImplementation(async () => {
    state.app.isReady.mockReturnValue(true)
  })
  await bootUntilExit()
  expect(state.createDiagnostic).toHaveBeenCalledWith(
    'RUNTIME_PATHS',
    expect.any(Error),
    'COMPLETE'
  )
  expect(
    state.showMessageBox.mock.calls.length + state.showErrorBox.mock.calls.length
  ).toBeGreaterThan(0)
  expect(state.recover).not.toHaveBeenCalled()
})
