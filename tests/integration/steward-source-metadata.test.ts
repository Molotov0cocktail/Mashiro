import { randomUUID } from 'node:crypto'
import { expect, it, vi } from 'vitest'
import { stewardFixture, plan } from './steward-fixture.js'

it('distinguishes provided dependencies from model citations and preserves event metadata without changing event status', async () => {
  const f = stewardFixture({
    send: async () => ({
      status: 'completed',
      text: JSON.stringify({
        slots: [plan({ markdown: '用户计划检查合成蓝色报告。', sourceHandles: ['entry'] })]
      }),
      usage: null
    })
  })
  const target = f.remember('资料仅供对照。')
  f.store.database
    .prepare("UPDATE memory_pending SET state='completed' WHERE object_id=?")
    .run(target.objectId)
  const event = {
    status: 'planned' as const,
    occurredAt: '2030-01-05T08:00:00Z',
    timeZone: 'Asia/Shanghai'
  }
  const receipt = f.memory.mutate({
    ...f.base,
    commandId: randomUUID(),
    mutation: {
      action: 'remember',
      targetId: null,
      expectedVersion: null,
      kind: 'event',
      scope: 'global',
      title: '计划检查',
      markdown: '用户计划检查合成蓝色报告。',
      nature: 'user-statement',
      event
    }
  })
  if (!receipt.ok) throw Error('event')
  f.configure()
  await vi.waitFor(() => expect(f.snapshot().jobs[0]?.state).toBe('COMPLETED'))
  const input = JSON.parse(f.send.mock.calls[0]![1][1]!.content!)
  expect(input.entry).toMatchObject({ kind: 'event', event })
  const slot = f.snapshot().jobs[0]!.slots[0]!
  expect(slot.providedSources).toHaveLength(2)
  expect(slot.citedSources).toHaveLength(1)
  expect(slot.citedSources![0]!.id).toBe(receipt.data.objectId)
  expect(f.memory.acceptedBackgroundMemory(f.assistantId, receipt.data.objectId, 1).event).toEqual(
    event
  )
  const accepted = f.memory.acceptedBackgroundMemory(
    f.assistantId,
    slot.memoryId!,
    slot.memoryVersion!
  )
  expect(accepted.sources.map((s) => s.id)).toContain(target.objectId)
  expect(accepted.event).toBeNull()
})
