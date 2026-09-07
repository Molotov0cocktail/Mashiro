import { randomUUID } from 'node:crypto'
import { expect, it, vi } from 'vitest'
import { stewardFixture } from './steward-fixture.js'

it.each(['correct', 'delete', 'withdraw'] as const)(
  'advances a branch token for a dependency %s and keeps it stable after reopening',
  (action) => {
    const f = stewardFixture()
    const dependency = f.remember('来源资料')
    const member = f.remember('分支资料')
    const branch = f.service.organization.ensure('真实分支')
    f.service.organization.link(
      branch,
      { type: 'memory', id: member.objectId, version: 1, assistantId: f.assistantId },
      'member',
      [{ type: 'memory', id: dependency.objectId, version: 1, assistantId: f.assistantId }]
    )
    const version = f.snapshot().branches[0]!.version
    f.remember('完全无关的新资料')
    expect(f.snapshot().branches[0]!.version).toBe(version)
    const changed = f.memory.mutate({
      ...f.base,
      commandId: randomUUID(),
      mutation:
        action === 'correct'
          ? {
              action,
              targetId: dependency.objectId,
              expectedVersion: 1,
              kind: 'user',
              scope: 'global',
              title: '来源纠正',
              markdown: '来源已由用户纠正',
              nature: 'user-statement',
              event: null
            }
          : { action, targetId: dependency.objectId, expectedVersion: 1 }
    })
    expect(changed.ok).toBe(true)
    if (changed.ok && changed.data.state === 'PENDING_CONFIRMATION')
      expect(
        f.memory.confirm({ ...f.base, confirmationId: changed.data.confirmationId, accept: true })
      ).toMatchObject({ ok: true, data: { state: 'SUCCEEDED' } })
    expect(
      f.service.branch({ ...f.base, id: branch.id, expectedVersion: version, cursor: 100 })
    ).toMatchObject({ ok: false, error: { code: 'STALE_WRITE' } })
    const updated = f.snapshot().branches[0]!.version
    expect(updated).toBeGreaterThan(version)
    expect(f.reopen().query(f.base)).toMatchObject({
      ok: true,
      data: { branches: [{ version: updated }] }
    })
  }
)

it('observes persisted original recycling and permission changes and emits a refreshed token', async () => {
  const f = stewardFixture()
  const source = f.round()
  const member = f.remember()
  const branch = f.service.organization.ensure('原文来源')
  f.service.organization.link(
    branch,
    { type: 'memory', id: member.objectId, version: 1, assistantId: f.assistantId },
    'member',
    [{ type: 'round', id: source, version: 1, assistantId: f.assistantId }]
  )
  const initial = f.snapshot().branches[0]!.version
  const listener = vi.fn()
  f.service.onChanged(listener)
  // Persisted recovery seam: identical to a completed original-trash receipt, without deleting files.
  f.store.database
    .prepare('INSERT INTO retention_original_trash VALUES(?,?,?,?)')
    .run(source, f.assistantId, '[]', 1)
  await vi.waitFor(() => expect(listener).toHaveBeenCalled(), { timeout: 2500 })
  expect(f.service.branch({ ...f.base, id: branch.id, expectedVersion: initial })).toMatchObject({
    ok: false,
    error: { code: 'STALE_WRITE' }
  })
  const recycled = f.snapshot().branches[0]!.version
  f.store.database
    .prepare(
      "UPDATE memory_permissions SET version=version+1,read_allowed=0 WHERE assistant_id=? AND scope='global'"
    )
    .run(f.assistantId)
  expect(f.service.branch({ ...f.base, id: branch.id, expectedVersion: recycled })).toMatchObject({
    ok: false,
    error: { code: 'STALE_WRITE' }
  })
})
