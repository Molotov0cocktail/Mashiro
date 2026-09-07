import { randomUUID } from 'node:crypto'
import { expect, it, vi } from 'vitest'
import { stewardFixture, plan } from './steward-fixture.js'

it('returns a resolved conflict and its actual correction through the public API after refresh and reopen', async () => {
  const f = stewardFixture({
    send: async () => ({
      status: 'completed',
      usage: null,
      text: JSON.stringify({
        slots: [
          plan({
            action: 'conflict',
            targetHandle: 'target0',
            sourceHandles: ['entry', 'target0']
          })
        ]
      })
    })
  })
  const target = f.remember('用户喜欢合成红色。')
  f.store.database
    .prepare("UPDATE memory_pending SET state='completed' WHERE object_id=?")
    .run(target.objectId)
  f.remember('用户喜欢合成蓝色。')
  f.configure()
  await vi.waitFor(() => expect(f.snapshot().conflicts).toHaveLength(1))
  const conflict = f.snapshot().conflicts[0]!
  const correction = f.memory.mutate({
    ...f.base,
    commandId: randomUUID(),
    mutation: {
      action: 'correct',
      targetId: target.objectId,
      expectedVersion: 1,
      kind: 'user',
      scope: 'global',
      title: '用户明确纠正',
      markdown: '用户明确现在喜欢绿色。',
      nature: 'user-statement',
      event: null
    }
  })
  expect(correction.ok).toBe(true)
  const resolved = f.service.resolveConflict({
    ...f.base,
    commandId: randomUUID(),
    conflictId: conflict.id,
    expectedVersion: conflict.version,
    resolutionMemoryId: target.objectId,
    resolutionMemoryVersion: 2
  })
  expect(resolved).toMatchObject({
    ok: true,
    data: {
      conflicts: [
        { id: conflict.id, state: 'RESOLVED', resolution: { id: target.objectId, version: 2 } }
      ]
    }
  })
  expect(f.snapshot().conflicts[0]).toMatchObject({
    state: 'RESOLVED',
    resolution: { id: target.objectId, version: 2 }
  })
  expect(f.reopen().query(f.base)).toMatchObject({
    ok: true,
    data: { conflicts: [{ state: 'RESOLVED' }] }
  })
})
