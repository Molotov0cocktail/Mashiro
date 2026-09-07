import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { dailyFixture } from './daily-fixture.js'
import { ProviderService } from '../../src/main/provider/provider-service.js'
import type { TransportRequest } from '../../src/main/provider/chat-completions-transport.js'
import { dailyFeatureSchema } from '../../src/shared/daily-contract.js'

it('dispatches all five configured roles through the real Provider transport boundary with frozen identity and one usage record per request', async () => {
  const f = dailyFixture()
  f.remember('合成事件一', true)
  f.remember('合成事件二', true)
  f.service.close()
  f.operations.close()
  const requests: TransportRequest[] = []
  const service = ProviderService.open(
    f.path,
    join(f.directory, 'credentials'),
    {
      isEncryptionAvailable: () => true,
      encryptString: (value) => Buffer.from(value),
      decryptString: (value) => value.toString()
    },
    async (request) => {
      requests.push(request)
      return {
        status: 'completed',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        text: JSON.stringify({
          sections: [
            {
              title: '合成报告',
              markdown: '仍需核验',
              nature: 'inference',
              sourceHandles: ['source0']
            }
          ],
          observations: [],
          proposals: []
        })
      }
    },
    { backgroundClock: () => new Date('2030-01-01T12:00:00Z') }
  )
  try {
    const saved = service.saveConnection({
      protocolVersion: 1,
      displayName: '合成端点',
      baseUrl: 'https://synthetic.invalid/v1',
      enabled: true
    })
    if (!saved.ok) throw Error('connection')
    const connectionId = saved.data.connections[0]!.id
    expect(
      service.setCredential({
        protocolVersion: 1,
        connectionId,
        apiKey: 'synthetic-no-network-key',
        persistence: 'temporary'
      }).ok
    ).toBe(true)
    for (const feature of dailyFeatureSchema.options) {
      expect(
        service.daily.configure({
          ...f.base,
          feature,
          expectedVersion: 0,
          settings: { ...f.settings, connectionId, model: 'synthetic-' + feature },
          grantSelectedRecipient: true
        }).ok
      ).toBe(true)
      expect(service.daily.run({ ...f.base, feature, commandId: crypto.randomUUID() }).ok).toBe(
        true
      )
    }
    await vi.waitFor(
      () => {
        const query = service.daily.query({ ...f.base, view: 'jobs' })
        expect(query.ok && query.data.jobs.filter((job) => job.state === 'COMPLETED')).toHaveLength(
          5
        )
      },
      { timeout: 8000 }
    )
    expect(requests).toHaveLength(5)
    expect(
      requests.every(
        (request) =>
          request.maxOutputTokens === 2048 && request.baseUrl === 'https://synthetic.invalid/v1'
      )
    ).toBe(true)
    const usage = service.operations.usage({ protocolVersion: 1 })
    expect(usage).toMatchObject({
      ok: true,
      data: { summary: { calls: 5, known: { totalTokens: 75 }, complete: true } }
    })
    if (!usage.ok) throw Error('usage')
    expect(new Set(usage.data.attempts.map((row) => row.feature))).toEqual(
      new Set(dailyFeatureSchema.options)
    )
    expect(
      usage.data.attempts.every(
        (row) =>
          row.connectionId === connectionId &&
          row.actor === 'assistant' &&
          row.assistantId === f.assistantId
      )
    ).toBe(true)
    expect(f.store.database.prepare('SELECT count(*) AS n FROM reminders').get()!.n).toBe(0)
    expect(f.store.database.prepare('SELECT count(*) AS n FROM items').get()!.n).toBe(0)
  } finally {
    service.close()
  }
})
