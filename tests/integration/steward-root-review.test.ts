import { expect, it, vi } from 'vitest'
import { stewardFixture } from './steward-fixture.js'

it('does not provide accepted global memory when only shared-candidate reading is enabled', async () => {
  const f = stewardFixture()
  const secret = 'EXCLUDED_ACCEPTED_MEMORY_' + 'q'.repeat(20)
  const existing = f.remember(secret)
  f.store.database
    .prepare("UPDATE memory_pending SET state='completed' WHERE object_id=?")
    .run(existing.objectId)
  f.round()
  expect(f.discovery().ok).toBe(true)
  await vi.waitFor(() =>
    expect(f.snapshot().pending.some((p) => p.entryKind === 'shared-candidate')).toBe(true)
  )
  expect(f.configure({ allowAcceptedMemories: false }).ok).toBe(true)
  await vi.waitFor(() =>
    expect(f.send.mock.calls.some((c) => c[1][0]!.content!.includes('内置仓储员'))).toBe(true)
  )
  const request = f.send.mock.calls.find((c) => c[1][0]!.content!.includes('内置仓储员'))!
  expect(JSON.stringify(request[1])).not.toContain(secret)
  expect(JSON.parse(request[1][1]!.content!).targets).toEqual([])
})

it('can enumerate older branches beyond the first one hundred from the public snapshot', () => {
  const f = stewardFixture()
  const ids = new Set<string>()
  for (let index = 0; index < 103; index++)
    ids.add(f.service.organization.ensure('分支' + index).id)
  const seen = new Set<string>()
  let cursor: number | null = 0
  for (let page = 0; cursor !== null && page < 5; page++) {
    const response = f.service.query({ ...f.base, cursor })
    expect(response.ok).toBe(true)
    if (!response.ok) return
    for (const branch of response.data.branches) seen.add(branch.id)
    cursor = response.data.nextCursor
  }
  expect(seen).toEqual(ids)
})

it('ranks matching Chinese accepted text before unrelated newer memory targets', async () => {
  const f = stewardFixture()
  const relevant = f.remember('用户一直偏爱天青颜色')
  for (let index = 0; index < 22; index++) f.remember('完全无关的库存记录 ' + index)
  f.store.database.prepare("UPDATE memory_pending SET state='completed'").run()
  f.remember('用户一直偏爱天青颜色')
  expect(f.configure().ok).toBe(true)
  await vi.waitFor(() => expect(f.send).toHaveBeenCalledTimes(1))
  const input = JSON.parse(f.send.mock.calls[0]![1][1]!.content!)
  expect(
    input.targets.some(
      (target: { source: { id: string } }) => target.source.id === relevant.objectId
    )
  ).toBe(true)
})
