import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, expect, it } from 'vitest'
import {
  allowlistedStartupFailureCode,
  createStartupFailureDiagnostic,
  persistStartupFailureDiagnostic,
  startupFailureDetail
} from '../../src/main/data/startup-diagnostics.js'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) {
    const actual = realpathSync.native(root)
    if (
      dirname(actual) !== realpathSync.native(tmpdir()) ||
      !basename(actual).startsWith('mashiro-startup-diagnostic-')
    )
      throw new Error('TEST_CLEANUP_SCOPE')
    rmSync(actual, { recursive: true, force: true })
  }
})

function fixture(): string {
  const root = mkdtempSync(join(realpathSync.native(tmpdir()), 'mashiro-startup-diagnostic-'))
  roots.push(root)
  return root
}

it('maps only stable internal or system codes and never persists a raw path or stack', () => {
  const raw = new Error('C:/Users/someone/private/mashiro.sqlite failed')
  raw.stack = 'SECRET_STACK'
  expect(
    allowlistedStartupFailureCode(Object.assign(new Error('ignored'), { code: 'EACCES' }))
  ).toBe('ACCESS_DENIED')
  expect(allowlistedStartupFailureCode(new Error('DATA_SET_IN_USE'))).toBe('DATA_IN_USE')
  expect(allowlistedStartupFailureCode(raw)).toBe('UNEXPECTED')

  const diagnostic = createStartupFailureDiagnostic('ASSISTANT_OPEN', raw, 'COMPLETE')
  expect(Object.keys(diagnostic).sort()).toEqual([
    'cleanup',
    'code',
    'correlationId',
    'formatVersion',
    'observedAt',
    'stage'
  ])
  const serialized = JSON.stringify(diagnostic)
  expect(serialized).not.toContain('someone')
  expect(serialized).not.toContain('SECRET_STACK')
  expect(startupFailureDetail(diagnostic)).not.toContain('someone')
})

it('writes one bounded sanitized receipt and refuses an unsafe existing target', () => {
  const root = fixture()
  const diagnostic = createStartupFailureDiagnostic(
    'REMINDER_START',
    new Error('D:/private/value'),
    'FAILED'
  )
  expect(persistStartupFailureDiagnostic(root, diagnostic)).toBe(true)
  const stored = JSON.parse(readFileSync(join(root, 'startup-failure.json'), 'utf8'))
  expect(stored).toEqual(diagnostic)
  expect(JSON.stringify(stored)).not.toContain('private')

  const blocked = fixture()
  mkdirSync(join(blocked, 'startup-failure.json'))
  expect(persistStartupFailureDiagnostic(blocked, diagnostic)).toBe(false)
})
