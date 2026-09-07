import { expect, it, vi } from 'vitest'
import { stewardFixture } from './steward-fixture.js'
it('does not launder an unsupported discovery number into a faithful source for the steward', async () => {
  const f = stewardFixture({
    send: async () => ({
      status: 'completed',
      text: JSON.stringify({
        sharedCandidates: [
          {
            title: '新增判断',
            markdown: '用户每天购买蓝色物品999件。',
            nature: 'faithful-summary',
            sourceHandles: ['source0']
          }
        ]
      }),
      usage: null
    })
  })
  f.round()
  f.discovery()
  await vi.waitFor(() => expect(f.snapshot().pending).toHaveLength(1))
  expect(f.snapshot().pending[0]!.nature).toBe('inference')
  f.configure({ allowInferences: false })
  await vi.waitFor(() =>
    expect(
      f.snapshot().jobs.some((j) => j.role === 'steward' && j.state === 'PERMISSION_BLOCKED')
    ).toBe(true)
  )
  expect(f.send).toHaveBeenCalledTimes(1)
})
