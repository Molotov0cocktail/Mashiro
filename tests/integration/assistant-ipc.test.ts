import { describe, expect, it, vi } from 'vitest'
import { assistantChannels } from '../../src/shared/assistant-contract.js'

describe('assistant IPC surface', () => {
  it('freezes exactly six narrow channels', () => {
    expect(Object.values(assistantChannels).sort()).toEqual([
      'assistant:archive',
      'assistant:create',
      'assistant:list',
      'assistant:rename',
      'assistant:set-primary',
      'assistant:switch'
    ])
    expect(vi.isMockFunction(globalThis.fetch)).toBe(false)
  })
})
