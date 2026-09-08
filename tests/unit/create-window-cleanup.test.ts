import { expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  loadFailure: new Error('SYNTHETIC_RENDERER_LOAD_FAILURE'),
  destroyFailure: new Error('SYNTHETIC_WINDOW_DESTROY_FAILURE'),
  show: vi.fn()
}))

vi.mock('electron', () => ({
  app: { isPackaged: true },
  BrowserWindow: class {
    webContents = {
      setWindowOpenHandler: vi.fn(),
      on: vi.fn(),
      session: { setPermissionRequestHandler: vi.fn() }
    }
    destroy = vi.fn(() => {
      throw state.destroyFailure
    })
    isDestroyed = () => false
    show = state.show
    loadFile = vi.fn(async () => {
      throw state.loadFailure
    })
  }
}))

it('marks cleanup as failed and retains the renderer error if partial-window destruction fails', async () => {
  const { createWindow } = await import('../../src/main/app/create-window.js')

  await expect(createWindow()).rejects.toMatchObject({
    message: 'WINDOW_LOAD_CLEANUP_FAILED',
    original: state.loadFailure,
    startupCleanup: 'FAILED'
  })
  expect(state.show).not.toHaveBeenCalled()
})
