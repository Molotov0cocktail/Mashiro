import { expect, it, vi } from 'vitest'
import { dailyFixture } from './daily-fixture.js'

it.each(['COMPLETED', 'FAILED'] as const)(
  'includes the current dispatched attempt in the persisted %s job budget',
  async (state) => {
    const f = dailyFixture()
    if (state === 'FAILED') f.send.mockRejectedValueOnce(new Error('synthetic transport failure'))
    f.remember()
    expect(f.configure().ok).toBe(true)
    expect(f.run().ok).toBe(true)
    await vi.waitFor(() => expect(f.query().jobs[0]?.state).toBe(state))
    expect(f.send).toHaveBeenCalledTimes(1)
    const inputCharacters = f.send.mock.calls[0]![1].reduce(
      (sum, message) => sum + message.content.length,
      0
    )
    expect(inputCharacters).toBeGreaterThan(0)
    expect(f.query().jobs[0]).toMatchObject({
      attempts: 1,
      budget: { callsUsed: 1, inputCharactersUsed: inputCharacters }
    })
    const reopened = f.reopen()
    expect(reopened.query({ ...f.base, view: 'jobs' })).toMatchObject({
      ok: true,
      data: { jobs: [{ state, budget: { callsUsed: 1, inputCharactersUsed: inputCharacters } }] }
    })
    expect(f.send).toHaveBeenCalledTimes(1)
  }
)

it('does not charge an attempt when the daily input budget pauses before dispatch', async () => {
  const f = dailyFixture()
  f.remember('合成预算资料')
  expect(
    f.configure('daily-brief', {
      budget: { window: 'utc-day', calls: 1, inputCharacters: 1000, maxOutputTokens: 256 }
    }).ok
  ).toBe(true)
  expect(f.run().ok).toBe(true)
  await vi.waitFor(() => expect(f.query().jobs[0]?.state).toBe('BUDGET_PAUSED'))
  expect(f.query().jobs[0]).toMatchObject({
    attempts: 0,
    budget: { callsUsed: 0, inputCharactersUsed: 0 }
  })
  expect(f.send).not.toHaveBeenCalled()
})

it('persists the charged RUNNING snapshot before the remote result arrives', async () => {
  const f = dailyFixture()
  const send = f.send.getMockImplementation()!
  let release!: () => void
  f.send.mockImplementation(async (...args) => {
    await new Promise<void>((resolve) => {
      release = resolve
    })
    return send(...args)
  })
  f.remember()
  expect(f.configure().ok).toBe(true)
  expect(f.run().ok).toBe(true)
  await vi.waitFor(() => expect(f.send).toHaveBeenCalledTimes(1))
  try {
    const usage = f.operations.usage({ protocolVersion: 1 })
    if (!usage.ok) throw Error('usage unavailable')
    expect(usage.data.attempts).toHaveLength(1)
    expect(f.query().jobs[0]).toMatchObject({
      state: 'RUNNING',
      attempts: 1,
      budget: { callsUsed: 1, inputCharactersUsed: usage.data.attempts[0]!.inputCharacters }
    })
  } finally {
    release()
  }
  await vi.waitFor(() => expect(f.query().jobs[0]?.state).toBe('COMPLETED'))
})
