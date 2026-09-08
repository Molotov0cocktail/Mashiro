// @vitest-environment jsdom
import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { MemoryPanel } from '../../src/renderer/src/features/memory/MemoryPanel'
import { memoryApi008Defaults } from './memory-api-fixture'

afterEach(cleanup)

it('opens and focuses the permission controls after an explicit configuration deep link', async () => {
  render(
    <MemoryPanel
      assistantId="00000000-0000-4000-8000-000000000001"
      assistantName="Alpha"
      api={memoryApi008Defaults()}
      onLocateRound={vi.fn()}
      configurationFocusNonce={1}
    />
  )
  await waitFor(() => {
    const target = document.getElementById('memory-permissions')!
    expect(target).not.toBeNull()
    expect(target).toHaveAttribute('open')
    expect(target.contains(document.activeElement)).toBe(true)
  })
})
