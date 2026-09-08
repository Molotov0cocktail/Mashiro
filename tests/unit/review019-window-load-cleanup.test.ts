import { beforeEach, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  setup: vi.fn(),
  destroy: vi.fn(),
  show: vi.fn(),
  failure: new Error('SYNTHETIC_RENDERER_LOAD_FAILURE')
}))

vi.mock('electron', () => ({
  app: { isPackaged: true },
  BrowserWindow: class {
    webContents = {
      setWindowOpenHandler: state.setup,
      on: vi.fn(),
      session: { setPermissionRequestHandler: vi.fn() }
    }
    destroy = state.destroy
    isDestroyed = () => false
    show = state.show
    loadFile = vi.fn(async () => {
      throw state.failure
    })
  }
}))

it('destroys an allocated window when renderer loading rejects before returning its handle', async () => {
  const { createWindow } = await import('../../src/main/app/create-window.js')
  await expect(createWindow()).rejects.toBe(state.failure)
  expect(state.show).not.toHaveBeenCalled()
  expect(state.destroy).toHaveBeenCalledOnce()
})

beforeEach(() => {
  state.setup.mockReset()
  state.destroy.mockReset()
  state.show.mockClear()
})

it('destroys an allocated window if installing its security handlers fails', async () => {
  state.setup.mockImplementationOnce(() => {
    throw state.failure
  })
  const { createWindow } = await import('../../src/main/app/create-window.js')
  await expect(createWindow()).rejects.toBe(state.failure)
  expect(state.destroy).toHaveBeenCalledOnce()
  expect(state.show).not.toHaveBeenCalled()
})

it('marks failed destruction as incomplete cleanup rather than safe recovery', async () => {
  state.destroy.mockImplementationOnce(() => {
    throw new Error('SYNTHETIC_DESTROY_FAILED')
  })
  const { createWindow } = await import('../../src/main/app/create-window.js')
  await expect(createWindow()).rejects.toMatchObject({ startupCleanup: 'FAILED' })
})
