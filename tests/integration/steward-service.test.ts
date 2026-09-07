import { randomUUID } from 'node:crypto'
import { expect, it, vi } from 'vitest'
import {
  stewardBranchResultSchema,
  stewardPendingResultSchema
} from '../../src/shared/steward-contract.js'
import type { TransportResult } from '../../src/main/provider/chat-completions-transport.js'
import { stewardFixture, plan } from './steward-fixture.js'

it('discovers shared candidates from ordinary dialogue without manual global writes, then accepts real branch Markdown', async () => {
  const f = stewardFixture()
  f.round()
  expect(f.discovery().ok).toBe(true)
  await vi.waitFor(() => expect(f.snapshot().pending).toHaveLength(1))
  expect(f.store.database.prepare('SELECT count(*) AS n FROM memory_objects').get()!.n).toBe(0)
  expect(f.snapshot().pending[0]).toMatchObject({
    entryKind: 'shared-candidate',
    state: 'pending',
    available: true
  })
  expect(f.configure().ok).toBe(true)
  await vi.waitFor(() =>
    expect(f.snapshot().jobs.some((j) => j.role === 'steward' && j.state === 'COMPLETED')).toBe(
      true
    )
  )
  expect(f.send).toHaveBeenCalledTimes(2)
  const branch = f.snapshot().branches[0]!
  const detail = stewardBranchResultSchema.parse(
    f.service.branch({ ...f.base, id: branch.id, expectedVersion: branch.version })
  )
  expect(detail).toMatchObject({
    ok: true,
    data: {
      members: [{ markdown: '用户喜欢合成蓝色。', nature: 'faithful-summary' }],
      markdown: expect.stringContaining('用户喜欢合成蓝色。'),
      nextCursor: null
    }
  })
  expect(f.store.database.prepare('SELECT count(*) AS n FROM memory_pending').get()!.n).toBe(1)
  expect(f.changed).not.toHaveBeenCalled()
  const reopened = f.reopen()
  await new Promise((r) => setTimeout(r, 80))
  expect(f.send).toHaveBeenCalledTimes(2)
  expect(
    reopened.branch({ ...f.base, id: branch.id, expectedVersion: branch.version })
  ).toMatchObject({ ok: true, data: { members: [{ markdown: '用户喜欢合成蓝色。' }] } })
})
it('does not dispatch before configuration and excludes saved temporary rounds', async () => {
  const f = stewardFixture()
  f.round(randomUUID())
  await new Promise((r) => setTimeout(r, 70))
  expect(f.send).not.toHaveBeenCalled()
  f.discovery()
  await new Promise((r) => setTimeout(r, 70))
  expect(f.send).not.toHaveBeenCalled()
  expect(f.snapshot().pending).toHaveLength(0)
})
it('preserves immediate explicit memory writes with all background features disabled', () => {
  const f = stewardFixture()
  const receipt = f.remember()
  expect(receipt.state).toBe('SUCCEEDED')
  expect(f.send).not.toHaveBeenCalled()
})
it.each(['read_allowed', 'write_allowed'])(
  'blocks dispatch when global %s is denied',
  async (column) => {
    const f = stewardFixture()
    f.remember()
    f.store.database.prepare('UPDATE memory_permissions SET ' + column + '=0').run()
    f.configure()
    await vi.waitFor(() => expect(f.snapshot().jobs[0]?.state).toBe('PERMISSION_BLOCKED'))
    expect(f.send).not.toHaveBeenCalled()
  }
)
it('blocks actual recipient revocation without inheriting ordinary chat binding', async () => {
  const f = stewardFixture()
  f.remember()
  f.configure()
  f.store.database.prepare("UPDATE memory_recipients SET allowed=0 WHERE scope='global'").run()
  await vi.waitFor(() => expect(f.snapshot().jobs[0]?.state).toBe('PERMISSION_BLOCKED'))
  expect(f.send).not.toHaveBeenCalled()
})
it('keeps independent steward budgets persistent across configuration changes and restart', async () => {
  const f = stewardFixture()
  f.remember()
  f.remember('第二条合成偏好')
  f.configure({ budget: { ...f.stewardSettings.budget, calls: 1 } })
  await vi.waitFor(() =>
    expect(f.snapshot().jobs.some((j) => j.state === 'BUDGET_PAUSED')).toBe(true)
  )
  expect(f.send).toHaveBeenCalledTimes(1)
  expect(f.snapshot().usage.calls).toBe(1)
  f.configure({ budget: { ...f.stewardSettings.budget, calls: 1 } })
  f.reopen()
  await new Promise((r) => setTimeout(r, 50))
  expect(f.send).toHaveBeenCalledTimes(1)
})
it('requires explicit unknown retry and never refunds an interrupted dispatch', async () => {
  const f = stewardFixture({
    send: async () => {
      throw Error('unknown')
    }
  })
  f.remember()
  f.configure()
  await vi.waitFor(() => expect(f.snapshot().jobs[0]?.state).toBe('REMOTE_UNKNOWN'))
  const job = f.snapshot().jobs[0]!
  expect(
    f.service.control({
      ...f.base,
      jobId: job.id,
      expectedVersion: job.version,
      commandId: randomUUID(),
      action: 'retry'
    }).ok
  ).toBe(false)
  f.reopen()
  await new Promise((r) => setTimeout(r, 50))
  expect(f.send).toHaveBeenCalledTimes(1)
})
it('retains partial receipts and resumes the frozen local slots without an extra model call', async () => {
  let fail = true
  const f = stewardFixture({
    send: async () => ({
      status: 'completed',
      text: JSON.stringify({
        slots: [plan(), plan({ title: '第二项', markdown: '用户喜欢合成蓝色，也保留原句。' })]
      }),
      usage: null
    }),
    fault: (phase) => {
      if (phase === 'slot-committed' && fail) {
        fail = false
        throw Error('synthetic second slot stop')
      }
    }
  })
  f.remember()
  f.configure()
  await vi.waitFor(() => expect(f.snapshot().jobs[0]?.state).toBe('PARTIAL'))
  let job = f.snapshot().jobs[0]!
  expect(job.slots.filter((s) => s.state === 'COMPLETED')).toHaveLength(1)
  expect(
    f.service.control({
      ...f.base,
      jobId: job.id,
      expectedVersion: job.version,
      commandId: randomUUID(),
      action: 'retry'
    }).ok
  ).toBe(true)
  await vi.waitFor(() => expect(f.snapshot().jobs[0]?.state).toBe('COMPLETED'))
  job = f.snapshot().jobs[0]!
  expect(job.slots.filter((s) => s.state === 'COMPLETED')).toHaveLength(2)
  expect(f.send).toHaveBeenCalledTimes(1)
  expect(f.store.database.prepare('SELECT count(*) AS n FROM memory_objects').get()!.n).toBe(3)
})
it('user dismissal wins over an in-flight result and rescanning cannot recreate the source candidate', async () => {
  let resolve!: (result: TransportResult) => void
  const f = stewardFixture({
    send: async (_recipient, messages) =>
      messages[0]!.content!.includes('共享增量识别')
        ? {
            status: 'completed',
            text: JSON.stringify({
              sharedCandidates: [
                {
                  title: '候选',
                  markdown: '合成内容',
                  nature: 'faithful-summary',
                  sourceHandles: ['source0']
                }
              ]
            }),
            usage: null
          }
        : await new Promise((r) => {
            resolve = r
          })
  })
  f.round()
  f.discovery()
  await vi.waitFor(() => expect(f.snapshot().pending).toHaveLength(1))
  f.configure()
  await vi.waitFor(() => expect(f.send).toHaveBeenCalledTimes(2))
  const entry = f.snapshot().pending[0]!
  expect(
    stewardPendingResultSchema.parse(
      f.service.pending({
        ...f.base,
        id: entry.id,
        expectedVersion: entry.version,
        commandId: randomUUID(),
        action: 'dismiss'
      })
    ).ok
  ).toBe(true)
  resolve({ status: 'completed', text: JSON.stringify({ slots: [plan()] }), usage: null })
  await new Promise((r) => setTimeout(r, 80))
  expect(f.store.database.prepare('SELECT count(*) AS n FROM memory_objects').get()!.n).toBe(0)
  f.service.run({ ...f.base, role: 'assistant' })
  await new Promise((r) => setTimeout(r, 60))
  expect(f.snapshot().pending).toHaveLength(1)
  expect(f.send).toHaveBeenCalledTimes(2)
})
it('refuses model-forged target and source handles before accepting any memory', async () => {
  const f = stewardFixture({
    send: async () => ({
      status: 'completed',
      text: JSON.stringify({
        slots: [
          plan({
            action: 'equivalent',
            targetHandle: 'invented',
            sourceHandles: ['entry', 'invented']
          })
        ]
      }),
      usage: null
    })
  })
  f.remember()
  f.configure()
  await vi.waitFor(() => expect(f.snapshot().jobs[0]?.state).toBe('FAILED_CONFIRMED'))
  expect(f.store.database.prepare('SELECT count(*) AS n FROM memory_objects').get()!.n).toBe(1)
})
it('late user correction invalidates old input and does not consume the new pending version', async () => {
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
  f.memory.mutate({
    ...f.base,
    commandId: randomUUID(),
    mutation: {
      action: 'correct',
      targetId: receipt.objectId,
      expectedVersion: 1,
      kind: 'user',
      scope: 'global',
      title: '用户纠正',
      markdown: '用户喜欢绿色。',
      nature: 'user-statement',
      event: null
    }
  })
  resolve({ status: 'completed', text: JSON.stringify({ slots: [plan()] }), usage: null })
  await vi.waitFor(() =>
    expect(f.snapshot().jobs.some((j) => j.entryVersion === 1 && j.state === 'STALE')).toBe(true)
  )
  expect(
    f.store.database
      .prepare('SELECT version,state FROM memory_pending WHERE object_id=?')
      .get(receipt.objectId)
  ).toMatchObject({ version: 2, state: 'pending' })
})
