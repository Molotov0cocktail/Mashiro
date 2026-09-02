import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveDataRoot } from '../../src/main/data/data-root.js'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function app() {
  return {
    isPackaged: false,
    getPath: () => tmpdir(),
    setPath: () => undefined
  }
}

describe('trusted data-root selection', () => {
  it('rejects relative and marker-mismatched E2E roots before creating runtime data', () => {
    expect(() =>
      resolveDataRoot(app(), {
        MASHIRO_E2E: '1',
        MASHIRO_E2E_ROOT: '..\\escape',
        MASHIRO_E2E_RUN_ID: '00000000-0000-4000-8000-000000000000',
        MASHIRO_E2E_PHASE: 'seed'
      })
    ).toThrow('Invalid trusted E2E root metadata')

    const root = mkdtempSync(join(tmpdir(), 'mashiro-f1-e2e-'))
    roots.push(root)
    writeFileSync(
      join(root, '.mashiro-f1-e2e.json'),
      JSON.stringify({ protocolVersion: 1, runId: '11111111-1111-4111-8111-111111111111' })
    )
    expect(() =>
      resolveDataRoot(app(), {
        MASHIRO_E2E: '1',
        MASHIRO_E2E_ROOT: root,
        MASHIRO_E2E_RUN_ID: '00000000-0000-4000-8000-000000000000',
        MASHIRO_E2E_PHASE: 'verify'
      })
    ).toThrow('E2E ownership marker mismatch')
    expect(() => resolveDataRoot({ ...app(), isPackaged: true })).toThrow(
      'Packaged data location is outside the F1 qualification scope'
    )
  })
})
