import { randomUUID } from 'node:crypto'
import { expect, it, vi } from 'vitest'
import { registerStewardIpc } from '../../src/main/ipc/register-steward-ipc.js'
import { stewardChannels } from '../../src/shared/steward-channels.js'
import { stewardFixture } from './steward-fixture.js'

it('never supplies an unauthorized global wrapper of another assistant private memory', async () => {
  const f = stewardFixture(),
    other = randomUUID(),
    privateId = randomUUID()
  f.store.database
    .prepare('INSERT INTO assistants(id,display_name,created_at,updated_at) VALUES(?,?,?,?)')
    .run(other, '合成另一助手', '2030-01-01T00:00:00Z', '2030-01-01T00:00:00Z')
  const record = f.remember('可见入口')
  const hidden = f.remember('隐藏目标正文')
  f.store.database
    .prepare("UPDATE memory_pending SET state='completed' WHERE object_id=?")
    .run(hidden.objectId)
  const base = f.memory.acceptedBackgroundMemory(f.assistantId, record.objectId, 1)
  f.store.database.prepare('INSERT INTO memory_objects VALUES(?,?,?)').run(
    privateId,
    1,
    JSON.stringify({
      ...base,
      id: privateId,
      ownerAssistantId: other,
      scope: 'assistant',
      title: '私有秘密',
      markdown: ''
    })
  )
  f.memory.addDependencies('memory', hidden.objectId, 1, [
    { type: 'memory', id: privateId, assistantId: other, version: 1 }
  ])
  f.configure()
  await vi.waitFor(() => expect(f.send).toHaveBeenCalledTimes(1))
  expect(JSON.stringify(f.send.mock.calls[0])).not.toContain('隐藏目标正文')
  expect(JSON.stringify(f.send.mock.calls[0])).not.toContain('私有秘密')
})
it('denies a global input whose ancestor is another assistant private memory before dispatch', async () => {
  const f = stewardFixture(),
    other = randomUUID(),
    privateId = randomUUID()
  f.store.database
    .prepare('INSERT INTO assistants(id,display_name,created_at,updated_at) VALUES(?,?,?,?)')
    .run(other, '另一助手', '2030-01-01T00:00:00Z', '2030-01-01T00:00:00Z')
  const receipt = f.remember(),
    record = f.memory.acceptedBackgroundMemory(f.assistantId, receipt.objectId, 1)
  f.store.database.prepare('INSERT INTO memory_objects VALUES(?,?,?)').run(
    privateId,
    1,
    JSON.stringify({
      ...record,
      id: privateId,
      ownerAssistantId: other,
      scope: 'assistant',
      markdown: ''
    })
  )
  f.memory.addDependencies('memory', receipt.objectId, 1, [
    { type: 'memory', id: privateId, assistantId: other, version: 1 }
  ])
  f.configure()
  await vi.waitFor(() => expect(f.snapshot().jobs[0]?.state).toBe('PERMISSION_BLOCKED'))
  expect(f.send).not.toHaveBeenCalled()
})
it('paginates a large branch completely under one version and rejects continuation after organization changes', () => {
  const f = stewardFixture()
  const branch = f.service.organization.ensure('合成完整分页')
  for (let i = 0; i < 103; i++) {
    const receipt = f.remember('分页正文' + i)
    f.store.transaction(() =>
      f.service.organization.link(
        f.service.organization.branch(branch.id),
        { type: 'memory', id: receipt.objectId, version: 1, assistantId: f.assistantId },
        'member',
        []
      )
    )
  }
  const current = f.service.organization.branch(branch.id)
  const first = f.service.branch({ ...f.base, id: branch.id, expectedVersion: current.version })
  expect(first).toMatchObject({ ok: true, data: { nextCursor: 100 } })
  if (!first.ok) throw Error('first')
  expect(first.data.members).toHaveLength(100)
  const last = f.service.branch({
    ...f.base,
    id: branch.id,
    expectedVersion: current.version,
    cursor: 100
  })
  if (!last.ok) throw Error('last')
  expect(last.data.members).toHaveLength(3)
  expect(last.data.nextCursor).toBeNull()
  expect(new Set([...first.data.members, ...last.data.members].map((m) => m.id)).size).toBe(103)
  f.service.organize({
    ...f.base,
    commandId: randomUUID(),
    branchId: branch.id,
    expectedVersion: current.version,
    title: '新分支名',
    memoryId: null,
    memoryVersion: null
  })
  expect(
    f.service.branch({ ...f.base, id: branch.id, expectedVersion: current.version, cursor: 100 })
  ).toMatchObject({ ok: false, error: { code: 'STALE_WRITE' } })
})
it('has strict dedicated IPC sender and request validation without granting assistant authority', () => {
  const f = stewardFixture(),
    handlers = new Map<string, (event: unknown, input: unknown) => unknown>()
  const release = registerStewardIpc(
    {
      handle: (name, fn) => handlers.set(name, fn),
      removeHandler: (name) => {
        handlers.delete(name)
      }
    },
    f.service,
    (event) => event === 'trusted'
  )
  expect(handlers.get(stewardChannels.query)!('untrusted', f.base)).toMatchObject({
    ok: false,
    error: { code: 'PERMISSION_DENIED' }
  })
  expect(
    handlers.get(stewardChannels.query)!('trusted', { ...f.base, sql: 'forbidden' })
  ).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } })
  expect(handlers.get(stewardChannels.query)!('trusted', f.base)).toMatchObject({ ok: true })
  release()
  expect(handlers.size).toBe(0)
})
it('keeps an inaccessible prefix from starving later ordinary source recognition', async () => {
  const f = stewardFixture()
  const measurements: Array<{ name: string; elapsed: number; at: number }> = []
  const begun = performance.now()
  const wrap = (target: object, name: string) => {
    const original: unknown = Reflect.get(target, name)
    if (typeof original !== 'function') return
    Reflect.set(target, name, function (...args: unknown[]) {
      const start = performance.now()
      try {
        return original.apply(target, args)
      } finally {
        measurements.push({ name, elapsed: performance.now() - start, at: start - begun })
      }
    })
  }
  for (const name of [
    'pump',
    'scanDiscovery',
    'scanPending',
    'addJob',
    'jobs',
    'current',
    'execute',
    'update'
  ])
    wrap(f.service, name)
  wrap(f.service.organization, 'refreshGovernance')
  wrap(f.store, 'transaction')
  for (let i = 0; i < 72; i++) {
    const id = f.round()
    f.store.database
      .prepare("INSERT INTO memory_suppressions VALUES('round',?,1,'withdrawal',?)")
      .run(id, id)
  }
  const eligible = f.round(),
    gaps: number[] = []
  let before = performance.now()
  const heartbeat = setInterval(() => {
    const now = performance.now()
    gaps.push(now - before)
    before = now
  }, 10)
  try {
    f.discovery()
    await vi.waitFor(
      () =>
        expect(
          f.snapshot().jobs.some((j) => j.entryId === eligible && j.state === 'COMPLETED')
        ).toBe(true),
      { timeout: 10000 }
    )
    expect(f.send).toHaveBeenCalledTimes(1)
    expect(Math.max(...gaps)).toBeLessThan(500)
  } finally {
    clearInterval(heartbeat)
    const groups = [...new Set(measurements.map((x) => x.name))].map((name) => {
      const rows = measurements.filter((x) => x.name === name)
      return {
        name,
        count: rows.length,
        total: rows.reduce((sum, x) => sum + x.elapsed, 0),
        max: Math.max(...rows.map((x) => x.elapsed))
      }
    })
    process.stdout.write(
      'REVIEW_STEWARD ' +
        JSON.stringify({
          elapsed: performance.now() - begun,
          maxGap: Math.max(...gaps),
          groups,
          longest: measurements.sort((a, b) => b.elapsed - a.elapsed).slice(0, 12)
        }) +
        '\n'
    )
  }
})
