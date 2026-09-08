import { beforeEach, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  close: vi.fn(),
  constructRepository: vi.fn()
}))

vi.mock('../../src/main/data/sqlite.js', () => ({
  SqliteStore: class {
    close = state.close
  }
}))

vi.mock('../../src/main/assistant/assistant-repository.js', () => ({
  AssistantRepository: class {
    constructor() {
      state.constructRepository()
    }
  },
  DomainError: class extends Error {
    code = 'NOT_FOUND' as const
  }
}))

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
})

it('closes the SQLite store when repository construction rejects startup', async () => {
  state.constructRepository.mockImplementationOnce(() => {
    throw new Error('SYNTHETIC_REPOSITORY_CONSTRUCTION_FAILURE')
  })
  const { AssistantService } = await import('../../src/main/assistant/assistant-service.js')

  expect(() => AssistantService.open('synthetic/mashiro.sqlite')).toThrow(
    'SYNTHETIC_REPOSITORY_CONSTRUCTION_FAILURE'
  )
  expect(state.close).toHaveBeenCalledOnce()
})
