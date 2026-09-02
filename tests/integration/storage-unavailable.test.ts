import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { AssistantService } from '../../src/main/assistant/assistant-service.js'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('storage unavailable behavior', () => {
  it('fails closed when the database parent does not exist', () => {
    const root = mkdtempSync(join(tmpdir(), 'mashiro-f1-unavailable-'))
    roots.push(root)
    const missingParent = join(root, 'missing')
    expect(() => AssistantService.open(join(missingParent, 'mashiro.sqlite'))).toThrow()
    expect(existsSync(missingParent)).toBe(false)
  })
})
