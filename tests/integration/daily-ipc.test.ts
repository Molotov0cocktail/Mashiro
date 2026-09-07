import { expect, it, vi } from 'vitest'
import { dailyFixture } from './daily-fixture.js'
import { registerDailyIpc } from '../../src/main/ipc/register-daily-ipc.js'
import { dailyChannels } from '../../src/shared/daily-channels.js'

it('rejects untrusted senders before service invocation and rejects surplus renderer authority', () => {
  const f = dailyFixture(),
    handlers = new Map<string, (event: unknown, input: unknown) => unknown>()
  const spy = vi.spyOn(f.service, 'configure')
  const remove = vi.fn()
  const unregister = registerDailyIpc(
    { handle: (name, handler) => handlers.set(name, handler), removeHandler: remove },
    f.service,
    (event) => event === 'trusted'
  )
  expect(handlers.get(dailyChannels.configure)!('iframe', {})).toMatchObject({
    ok: false,
    error: { code: 'PERMISSION_DENIED' }
  })
  expect(spy).not.toHaveBeenCalled()
  expect(
    handlers.get(dailyChannels.configure)!('trusted', {
      ...f.base,
      feature: 'daily-brief',
      expectedVersion: 0,
      settings: f.settings,
      grantSelectedRecipient: true,
      sql: 'SELECT private'
    })
  ).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } })
  expect(f.query('configurations').configurations.every((row) => row.version === 0)).toBe(true)
  unregister()
  expect(remove).toHaveBeenCalledTimes(8)
})

it('provides complete source pagination and rejects an old continuation after source correction', async () => {
  const f = dailyFixture()
  const first = f.remember('来源零')
  for (let index = 1; index < 53; index++) f.remember('合成来源' + index)
  f.configure()
  f.run()
  await vi.waitFor(() => expect(f.query().jobs[0]?.state).toBe('COMPLETED'))
  const report = f.query('reports').reports[0]!
  const args = {
    ...f.base,
    id: report.id,
    expectedVersion: report.version,
    governanceVersion: report.governanceVersion
  }
  expect(f.service.inspect(args)).toMatchObject({ ok: true, data: { nextCursor: 50 } })
  const last = f.service.inspect({ ...args, cursor: 50 })
  expect(last).toMatchObject({ ok: true, data: { nextCursor: null } })
  expect(last.ok && last.data.providedSources).toHaveLength(3)
  expect(
    f.memory.mutate({
      ...f.base,
      commandId: crypto.randomUUID(),
      mutation: {
        action: 'correct',
        targetId: first.objectId,
        expectedVersion: 1,
        kind: 'user',
        scope: 'global',
        title: '用户纠正',
        markdown: '新正文',
        nature: 'user-statement',
        event: null
      }
    }).ok
  ).toBe(true)
  expect(f.service.inspect({ ...args, cursor: 50 })).toMatchObject({
    ok: false,
    error: { code: 'STALE_WRITE' }
  })
})
