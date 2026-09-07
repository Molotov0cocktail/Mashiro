import { randomUUID } from 'node:crypto'
import { expect, it, vi } from 'vitest'
import type { TransportResult } from '../../src/main/provider/chat-completions-transport.js'
import { stewardFixture, plan } from './steward-fixture.js'

it('records a real conflict without overwriting either side and annotates ordinary retrieval', async () => {
  const f = stewardFixture({
    send: async () => ({
      status: 'completed',
      text: JSON.stringify({
        slots: [
          plan({ action: 'conflict', targetHandle: 'target0', sourceHandles: ['entry', 'target0'] })
        ]
      }),
      usage: null
    })
  })
  const target = f.remember('用户喜欢合成红色。')
  f.store.database
    .prepare("UPDATE memory_pending SET state='completed' WHERE object_id=?")
    .run(target.objectId)
  f.remember('用户喜欢合成蓝色。')
  f.configure()
  await vi.waitFor(() => expect(f.snapshot().jobs[0]?.state).toBe('COMPLETED'))
  const conflict = f.snapshot().conflicts[0]!
  expect(conflict.state).toBe('OPEN')
  expect(conflict.left.id).toBe(target.objectId)
  expect(f.memory.acceptedBackgroundMemory(f.assistantId, target.objectId, 1).markdown).toBe(
    '用户喜欢合成红色。'
  )
  const results = f.memory.search(
    {
      assistantId: f.assistantId,
      requestId: randomUUID(),
      fingerprint: 'a'.repeat(64),
      assertCurrent: () => {},
      sources: []
    },
    '合成',
    10
  )
  expect(results.filter((r) => r.unresolvedConflictIds?.includes(conflict.id))).toHaveLength(2)
  expect(results.some((r) => r.markdown.includes('未决冲突'))).toBe(true)
  expect(
    f.service.resolveConflict({
      ...f.base,
      commandId: randomUUID(),
      conflictId: conflict.id,
      expectedVersion: 1,
      resolutionMemoryId: target.objectId,
      resolutionMemoryVersion: 1
    }).ok
  ).toBe(false)
  const corrected = f.memory.mutate({
    ...f.base,
    commandId: randomUUID(),
    mutation: {
      action: 'correct',
      targetId: target.objectId,
      expectedVersion: 1,
      kind: 'user',
      scope: 'global',
      title: '明确纠正',
      markdown: '用户明确现在喜欢绿色。',
      nature: 'user-statement',
      event: null
    }
  })
  expect(corrected.ok).toBe(true)
  // The old opposite summary depended on the old target and may no longer be used as a fact.
  const resolved = f.service.resolveConflict({
    ...f.base,
    commandId: randomUUID(),
    conflictId: conflict.id,
    expectedVersion: 1,
    resolutionMemoryId: target.objectId,
    resolutionMemoryVersion: 2
  })
  expect(resolved.ok).toBe(true)
  expect(
    f.store.database
      .prepare(
        "SELECT json_extract(record_json,'$.state') AS state FROM memory_conflicts WHERE id=?"
      )
      .get(conflict.id)!.state
  ).toBe('RESOLVED')
})
it('equivalence creates a source-preserving organization receipt and no duplicate Markdown', async () => {
  const f = stewardFixture({
    send: async () => ({
      status: 'completed',
      text: JSON.stringify({
        slots: [
          plan({
            action: 'equivalent',
            targetHandle: 'target0',
            sourceHandles: ['entry', 'target0']
          })
        ]
      }),
      usage: null
    })
  })
  const target = f.remember('用户喜欢合成蓝色。')
  f.store.database
    .prepare("UPDATE memory_pending SET state='completed' WHERE object_id=?")
    .run(target.objectId)
  const entry = f.remember('合成蓝色是用户喜欢的颜色。')
  f.configure()
  await vi.waitFor(() => expect(f.snapshot().jobs[0]?.state).toBe('COMPLETED'))
  expect(f.store.database.prepare('SELECT count(*) AS n FROM memory_objects').get()!.n).toBe(2)
  expect(f.snapshot().jobs[0]!.slots[0]).toMatchObject({
    action: 'equivalent',
    memoryId: target.objectId,
    state: 'COMPLETED'
  })
  expect(f.memory.acceptedBackgroundMemory(f.assistantId, entry.objectId, 1).markdown).toContain(
    '合成蓝色'
  )
})
it.each(['permission', 'endpoint', 'withdrawal'])(
  'blocks a delayed result after %s governance changes',
  async (change) => {
    let resolve!: (result: TransportResult) => void
    const f = stewardFixture({
        send: () =>
          new Promise((r) => {
            resolve = r
          })
      }),
      receipt = f.remember()
    f.configure()
    await vi.waitFor(() => expect(f.send).toHaveBeenCalledTimes(1))
    if (change === 'permission')
      f.store.database
        .prepare('UPDATE memory_permissions SET read_allowed=0,version=version+1')
        .run()
    if (change === 'endpoint') f.changeEndpoint()
    if (change === 'withdrawal')
      f.store.database
        .prepare("INSERT INTO memory_suppressions VALUES('memory',?,1,'withdrawal',?)")
        .run(receipt.objectId, receipt.objectId)
    resolve({ status: 'completed', text: JSON.stringify({ slots: [plan()] }), usage: null })
    await vi.waitFor(() =>
      expect(['STALE', 'PERMISSION_BLOCKED']).toContain(f.snapshot().jobs[0]?.state)
    )
    expect(f.store.database.prepare('SELECT count(*) AS n FROM memory_objects').get()!.n).toBe(1)
  }
)
it('revocation followed by regrant cannot reuse a previously frozen candidate', async () => {
  let resolve!: (result: TransportResult) => void
  const f = stewardFixture({
    send: () =>
      new Promise((r) => {
        resolve = r
      })
  })
  f.remember()
  f.configure()
  await vi.waitFor(() => expect(f.send).toHaveBeenCalledTimes(1))
  f.store.database.prepare('UPDATE memory_permissions SET read_allowed=0,version=version+1').run()
  f.store.database.prepare('UPDATE memory_permissions SET read_allowed=1,version=version+1').run()
  resolve({ status: 'completed', text: JSON.stringify({ slots: [plan()] }), usage: null })
  await vi.waitFor(() => expect(f.snapshot().jobs[0]?.state).toBe('STALE'))
  expect(f.snapshot().branches).toHaveLength(0)
})
it('new unsupported numbers remain inference and cannot bypass the inference write gate', async () => {
  const f = stewardFixture({
    send: async () => ({
      status: 'completed',
      text: JSON.stringify({ slots: [plan({ markdown: '用户每周购买蓝色物品999次。' })] }),
      usage: null
    })
  })
  f.remember()
  f.configure({ allowInferences: false })
  await vi.waitFor(() => expect(f.snapshot().jobs[0]?.state).toBe('PERMISSION_BLOCKED'))
  expect(f.store.database.prepare('SELECT count(*) AS n FROM memory_objects').get()!.n).toBe(1)
})
it('a partial job cannot replay remaining slots after the user corrects a frozen target', async () => {
  let fail = true
  const f = stewardFixture({
    send: async () => ({
      status: 'completed',
      text: JSON.stringify({ slots: [plan(), plan({ title: '第二项' })] }),
      usage: null
    }),
    fault: (phase) => {
      if (phase === 'slot-committed' && fail) {
        fail = false
        throw Error('partial')
      }
    }
  })
  const target = f.remember('合成目标')
  f.store.database
    .prepare("UPDATE memory_pending SET state='completed' WHERE object_id=?")
    .run(target.objectId)
  f.remember()
  f.configure()
  await vi.waitFor(() => expect(f.snapshot().jobs[0]?.state).toBe('PARTIAL'))
  f.memory.mutate({
    ...f.base,
    commandId: randomUUID(),
    mutation: {
      action: 'correct',
      targetId: target.objectId,
      expectedVersion: 1,
      kind: 'user',
      scope: 'global',
      title: '纠正目标',
      markdown: '新目标',
      nature: 'user-statement',
      event: null
    }
  })
  const job = f.snapshot().jobs.find((j) => j.state === 'PARTIAL')!
  f.service.control({
    ...f.base,
    jobId: job.id,
    expectedVersion: job.version,
    commandId: randomUUID(),
    action: 'retry'
  })
  await vi.waitFor(() =>
    expect(f.snapshot().jobs.find((j) => j.id === job.id)?.state).toBe('PARTIAL')
  )
  expect(
    f
      .snapshot()
      .jobs.find((j) => j.id === job.id)!
      .slots.filter((s) => s.state === 'COMPLETED')
  ).toHaveLength(1)
})
it('shared candidate dependency prevents premature original recycling until actual organization', async () => {
  const f = stewardFixture(),
    id = f.round()
  f.discovery()
  await vi.waitFor(() => expect(f.snapshot().pending).toHaveLength(1))
  expect(f.service.inspectOriginal(f.assistantId, [id]).blockers).toHaveLength(1)
  f.configure()
  await vi.waitFor(() =>
    expect(f.snapshot().jobs.some((j) => j.role === 'steward' && j.state === 'COMPLETED')).toBe(
      true
    )
  )
  expect(f.service.inspectOriginal(f.assistantId, [id]).blockers).toHaveLength(0)
})
