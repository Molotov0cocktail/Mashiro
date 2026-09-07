import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { SqliteStore } from '../../src/main/data/sqlite.js'
import {
  ReminderService,
  type ReminderLoginStartupMutation,
  type ReminderPlatform
} from '../../src/main/reminder/reminder-service.js'

const cleanup: (() => void)[] = []
afterEach(() => {
  for (const fn of cleanup.splice(0).reverse()) fn()
})

type SystemState = 'off' | 'owned-on' | 'concurrent-off'
type CompensationResult = ReturnType<ReminderLoginStartupMutation['rollbackIfUnchanged']>

function fixture(beforeCommit?: (setState: (value: SystemState) => void) => void) {
  const root = mkdtempSync(join(tmpdir(), 'mashiro-reminder-login-'))
  cleanup.push(() => rmSync(root, { recursive: true, force: true }))
  const store = new SqliteStore(join(root, 'state.sqlite'))
  cleanup.push(() => store.close())
  let systemState: SystemState = 'off'
  let rollbackCalls = 0
  let rollbackResult: CompensationResult | null = null
  let failAfterSet = false
  const service = new ReminderService(
    store,
    () => new Date('2030-01-01T00:00:00Z'),
    (phase) => {
      if (phase === 'before-login-config-commit') beforeCommit?.((value) => (systemState = value))
    }
  )
  cleanup.push(() => service.close())
  const platform: ReminderPlatform = {
    notificationSupported: () => true,
    loginStartupSupported: () => true,
    getLoginStartup: () => systemState === 'owned-on',
    setLoginStartup: (value): ReminderLoginStartupMutation => {
      const before = systemState
      systemState = value ? 'owned-on' : 'off'
      if (failAfterSet) throw new Error('synthetic post-write read failure')
      const after = systemState
      return {
        rollbackIfUnchanged: () => {
          rollbackCalls += 1
          if (rollbackResult) return rollbackResult
          if (systemState !== after) return 'CONCURRENT_CHANGE'
          systemState = before
          return 'RESTORED'
        }
      }
    },
    show: () => ({ close() {} })
  }
  service.attach(platform, () => undefined)
  const configure = () =>
    service.configure({
      protocolVersion: 1,
      expectedVersion: 0,
      policy: { mode: 'EXPLICIT', catchUpMinutes: 1440, merge: true },
      loginStartup: true
    })
  return {
    service,
    configure,
    systemState: () => systemState,
    setRollbackResult: (value: CompensationResult) => {
      rollbackResult = value
    },
    setFailAfterSet: () => {
      failAfterSet = true
    },
    rollbackCalls: () => rollbackCalls
  }
}

const unknownFailure = {
  ok: false,
  error: { code: 'STORAGE_UNAVAILABLE', message: '提醒结果未确认，请核查原操作' }
}

it('restores its unchanged external registration when SQL persistence fails before commit', () => {
  const f = fixture(() => {
    throw new Error('synthetic SQL failure')
  })
  expect(f.configure()).toMatchObject(unknownFailure)
  expect(f.systemState()).toBe('off')
  expect(f.rollbackCalls()).toBe(1)
  expect(f.service.runtime({ protocolVersion: 1 })).toMatchObject({
    ok: true,
    data: { version: 0, loginStartup: false }
  })
})

it('preserves a concurrent Windows change and reports the configure result as unknown', () => {
  const f = fixture((setState) => {
    setState('concurrent-off')
    throw new Error('synthetic SQL failure')
  })
  expect(f.configure()).toMatchObject(unknownFailure)
  expect(f.systemState()).toBe('concurrent-off')
  expect(f.rollbackCalls()).toBe(1)
})

it('reports an unverified post-write platform failure without a blind rollback', () => {
  const f = fixture()
  f.setFailAfterSet()
  expect(f.configure()).toMatchObject(unknownFailure)
  expect(f.systemState()).toBe('owned-on')
  expect(f.rollbackCalls()).toBe(0)
  expect(f.service.runtime({ protocolVersion: 1 })).toMatchObject({
    ok: true,
    data: { version: 0, loginStartup: true }
  })
})

it('keeps the external result and reports unknown when compensation cannot be verified', () => {
  const f = fixture(() => {
    throw new Error('synthetic SQL failure')
  })
  f.setRollbackResult('UNKNOWN')
  expect(f.configure()).toMatchObject(unknownFailure)
  expect(f.systemState()).toBe('owned-on')
  expect(f.rollbackCalls()).toBe(1)
  expect(f.service.runtime({ protocolVersion: 1 })).toMatchObject({
    ok: true,
    data: { version: 0, loginStartup: true }
  })
})

it('commits settings after the effective external state is confirmed', () => {
  const f = fixture()
  expect(f.configure()).toMatchObject({
    ok: true,
    data: { version: 1, loginStartup: true }
  })
  expect(f.systemState()).toBe('owned-on')
  expect(f.rollbackCalls()).toBe(0)
})
