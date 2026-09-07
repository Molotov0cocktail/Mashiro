import { expect, it, vi } from 'vitest'
import { stewardFixture, plan } from './steward-fixture.js'

it('offers an older relevant accepted member despite a newer unrelated prefix, after authority filtering', async () => {
  const f = stewardFixture({
    send: async (_recipient, messages) => {
      const data = JSON.parse(messages[1]!.content!) as {
        targets: { handle: string; markdown: string }[]
      }
      const match = data.targets.find((t) => t.markdown.includes('海蓝玻璃收藏'))!
      return {
        status: 'completed',
        text: JSON.stringify({
          slots: [
            plan({
              action: 'equivalent',
              targetHandle: match?.handle ?? 'missing',
              sourceHandles: ['entry', match?.handle ?? 'missing']
            })
          ]
        }),
        usage: null
      }
    }
  })
  const original = f.remember('海蓝玻璃收藏是用户长期明确的喜好。')
  for (let i = 0; i < 25; i++) f.remember('不相关的合成内容 ' + i)
  f.store.database.prepare("UPDATE memory_pending SET state='completed'").run()
  f.remember('海蓝玻璃收藏是我喜欢的。')
  f.configure()
  await vi.waitFor(() => expect(f.snapshot().jobs[0]?.state).toBe('COMPLETED'))
  expect(f.snapshot().jobs[0]!.slots[0]!.memoryId).toBe(original.objectId)
  expect(f.send).toHaveBeenCalledTimes(1)
})
