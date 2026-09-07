import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { stewardFixture } from './steward-fixture.js'

it('invalidates a branch export token when an accepted member is corrected between pages', () => {
  const f = stewardFixture()
  const receipt = f.remember('USER_ORIGINAL_BRANCH_BODY')
  const branch = f.service.organization.ensure('用户资料')
  f.service.organization.link(
    branch,
    { type: 'memory', id: receipt.objectId, version: 1, assistantId: f.assistantId },
    'member',
    []
  )
  const current = f.snapshot().branches[0]!
  expect(
    f.service.branch({ ...f.base, id: current.id, expectedVersion: current.version })
  ).toMatchObject({
    ok: true,
    data: { markdown: expect.stringContaining('USER_ORIGINAL_BRANCH_BODY') }
  })
  expect(
    f.memory.mutate({
      ...f.base,
      commandId: randomUUID(),
      mutation: {
        action: 'correct',
        targetId: receipt.objectId,
        expectedVersion: 1,
        kind: 'user',
        scope: 'global',
        title: '纠正后的用户资料',
        markdown: 'USER_CORRECTED_BRANCH_BODY',
        nature: 'user-statement',
        event: null
      }
    }).ok
  ).toBe(true)
  expect(
    f.service.branch({ ...f.base, id: current.id, expectedVersion: current.version, cursor: 100 })
  ).toMatchObject({
    ok: false,
    error: { code: 'STALE_WRITE' }
  })
  expect(f.snapshot().branches[0]!.version).toBeGreaterThan(current.version)
})
