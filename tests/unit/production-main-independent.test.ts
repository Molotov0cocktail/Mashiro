import { beforeEach, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => {
  const handlers = new Map<string, (event: { preventDefault(): void }) => void>()
  const changed = { onChanged: vi.fn() }
  const provider = {
    close: vi.fn(),
    background: changed,
    steward: changed,
    daily: changed,
    operations: changed,
    reminders: {},
    items: {},
    memory: {},
    retention: {}
  }
  const assistant = { close: vi.fn() }
  const session = {
    dataPath: 'synthetic-data',
    databasePath: 'synthetic-data/mashiro.sqlite',
    credentialDirectory: 'synthetic-data/credentials',
    dataSetId: 'synthetic-id',
    release: vi.fn(async () => {})
  }
  const app = {
    isPackaged: true,
    isReady: () => true,
    setAppUserModelId: vi.fn(),
    requestSingleInstanceLock: () => true,
    whenReady: vi.fn(async () => {}),
    on: (name: string, handler: (event: { preventDefault(): void }) => void) =>
      handlers.set(name, handler),
    quit: vi.fn(),
    exit: vi.fn(),
    relaunch: vi.fn()
  }
  return {
    handlers,
    provider,
    assistant,
    session,
    app,
    lost: undefined as undefined | ((error: Error) => void),
    openProvider: vi.fn((...args: unknown[]) => {
      void args
      return provider
    }),
    openAssistant: vi.fn(() => assistant),
    resolveDevelopment: vi.fn(),
    unregister: vi.fn(),
    runtime: { setQuitting: vi.fn(), stop: vi.fn(), restoreFromTrayForTest: vi.fn() },
    startRuntime: vi.fn(),
    runtimePlatform: undefined as unknown,
    menu: vi.fn()
  }
})
vi.mock('electron', () => ({
  app: state.app,
  dialog: { showErrorBox: vi.fn() },
  ipcMain: {},
  safeStorage: {},
  BrowserWindow: { getAllWindows: () => [] }
}))
vi.mock('../../src/main/data/production-bootstrap.js', () => ({
  prepareProductionRuntimePaths: () => ({ backupParentDirectory: 'synthetic-backup' }),
  openProductionApplicationData: async (options: { onOwnershipLost(error: Error): void }) => {
    state.lost = options.onOwnershipLost
    return state.session
  }
}))
vi.mock('../../src/main/data/data-root.js', () => ({ resolveDataRoot: state.resolveDevelopment }))
vi.mock('../../src/main/assistant/assistant-service.js', () => ({
  AssistantService: { open: state.openAssistant }
}))
vi.mock('../../src/main/provider/provider-service.js', () => ({
  ProviderService: { open: state.openProvider }
}))
vi.mock('../../src/main/app/create-window.js', () => ({
  createWindow: async () => ({ hide: vi.fn() })
}))
vi.mock('../../src/main/app/production-menu.js', () => ({ installProductionMenu: state.menu }))
vi.mock('../../src/main/reminder/reminder-runtime.js', () => ({
  startReminderRuntime: (...args: unknown[]) => {
    state.runtimePlatform = args[3]
    state.startRuntime()
    return state.runtime
  }
}))
vi.mock('../../src/main/testing/e2e-controller.js', () => ({
  canUseE2eReminderPlatform: vi.fn(() => false),
  createE2eReminderPlatform: vi.fn(),
  runE2ePhase: vi.fn(),
  e2eProviderTransport: vi.fn()
}))
vi.mock('../../src/main/ipc/register-assistant-ipc.js', () => ({
  registerAssistantIpc: () => state.unregister
}))
vi.mock('../../src/main/ipc/register-provider-ipc.js', () => ({
  registerProviderIpc: () => state.unregister
}))
vi.mock('../../src/main/ipc/register-timeline-ipc.js', () => ({
  registerTimelineIpc: () => state.unregister
}))
vi.mock('../../src/main/ipc/register-memory-ipc.js', () => ({
  registerMemoryIpc: () => state.unregister
}))
vi.mock('../../src/main/ipc/register-item-ipc.js', () => ({
  registerItemIpc: () => state.unregister
}))
vi.mock('../../src/main/ipc/register-retention-ipc.js', () => ({
  registerRetentionIpc: () => state.unregister
}))
vi.mock('../../src/main/ipc/register-reminder-ipc.js', () => ({
  registerReminderIpc: () => state.unregister,
  emitReminderChanged: vi.fn()
}))
vi.mock('../../src/main/ipc/register-background-ipc.js', () => ({
  registerBackgroundIpc: () => state.unregister,
  emitBackgroundChanged: vi.fn()
}))
vi.mock('../../src/main/ipc/register-steward-ipc.js', () => ({
  registerStewardIpc: () => state.unregister,
  emitStewardChanged: vi.fn()
}))
vi.mock('../../src/main/ipc/register-daily-ipc.js', () => ({
  registerDailyIpc: () => state.unregister,
  emitDailyChanged: vi.fn()
}))
vi.mock('../../src/main/ipc/register-operations-ipc.js', () => ({
  registerOperationsIpc: () => state.unregister,
  emitOperationsChanged: vi.fn()
}))
beforeEach(async () => {
  vi.resetModules()
  vi.clearAllMocks()
  state.handlers.clear()
  state.assistant.close.mockReset()
  state.provider.close.mockReset()
  state.session.release.mockResolvedValue(undefined)
  await import('../../src/main/index.js')
  await vi.waitFor(() => expect(state.startRuntime).toHaveBeenCalledOnce())
})

it('packaged main chooses production paths and closes both writers before releasing its ownership, preventing a second quit while release is pending', async () => {
  expect(state.app.setAppUserModelId).toHaveBeenCalledOnce()
  expect(state.app.setAppUserModelId).toHaveBeenCalledWith('io.github.molotov0cocktail.mashiro')
  expect(state.app.setAppUserModelId.mock.invocationCallOrder[0]!).toBeLessThan(
    state.app.whenReady.mock.invocationCallOrder[0]!
  )
  expect(state.app.setAppUserModelId.mock.invocationCallOrder[0]!).toBeLessThan(
    state.startRuntime.mock.invocationCallOrder[0]!
  )
  expect(state.runtimePlatform).toBeUndefined()
  expect(state.resolveDevelopment).not.toHaveBeenCalled()
  expect(state.openProvider.mock.calls[0]?.[3]).toBeUndefined()
  let finish!: () => void
  state.session.release.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve
      })
  )
  const first = { preventDefault: vi.fn() }
  state.handlers.get('before-quit')!(first)
  expect(first.preventDefault).toHaveBeenCalledOnce()
  expect(state.provider.close.mock.invocationCallOrder[0]!).toBeLessThan(
    state.assistant.close.mock.invocationCallOrder[0]!
  )
  expect(state.assistant.close.mock.invocationCallOrder[0]!).toBeLessThan(
    state.session.release.mock.invocationCallOrder[0]!
  )
  const second = { preventDefault: vi.fn() }
  state.handlers.get('before-quit')!(second)
  expect(second.preventDefault).toHaveBeenCalledOnce()
  expect(state.session.release).toHaveBeenCalledOnce()
  finish()
  await vi.waitFor(() => expect(state.app.quit).toHaveBeenCalledOnce())
})

it('forces exit after ownership loss even when the assistant storage close throws', () => {
  state.assistant.close.mockImplementationOnce(() => {
    throw Error('synthetic assistant close failure')
  })
  state.lost!(Error('synthetic ownership loss'))
  const event = { preventDefault: vi.fn() }
  expect(() => state.handlers.get('before-quit')!(event)).not.toThrow()
  expect(state.app.exit).toHaveBeenCalledWith(1)
})
