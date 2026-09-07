import { describe, expect, it } from 'vitest'
import { ReminderNavigationBroker } from '../../src/main/reminder/reminder-navigation.js'

const assistantA = '00000000-0000-4000-8000-000000000001'
const assistantB = '00000000-0000-4000-8000-000000000002'
const itemA = '00000000-0000-4000-8000-000000000003'
const unknownDelivery = '00000000-0000-4000-8000-000000000004'

function fixture() {
  let currentAssistantId: string | null = assistantA
  let assistantRevision = 1
  let targetAvailable = true
  const broker = new ReminderNavigationBroker(
    () => ({ id: currentAssistantId, revision: assistantRevision }),
    (delivery) => delivery.kind === 'open-reminders' || targetAvailable
  )
  return {
    broker,
    setAssistant(value: string | null) {
      currentAssistantId = value
      assistantRevision += 1
    },
    revision() {
      return assistantRevision
    },
    setTargetAvailable(value: boolean) {
      targetAvailable = value
    }
  }
}

describe('ReminderNavigationBroker', () => {
  it('retains one navigation until an exact acknowledgement and acknowledges retries idempotently', () => {
    const f = fixture()
    const published = f.broker.publish({ kind: 'open-item', itemId: itemA })
    expect(published).not.toBeNull()
    if (!published) throw new Error('EXPECTED_DELIVERY')
    expect(published).toMatchObject({
      kind: 'open-item',
      itemId: itemA,
      assistantId: assistantA,
      deliveryId: expect.stringMatching(/^[0-9a-f-]{36}$/)
    })
    const deliveryId = published.deliveryId!

    const first = f.broker.pendingNavigation({
      protocolVersion: 1,
      assistantId: assistantA,
      assistantRevision: f.revision()
    })
    const second = f.broker.pendingNavigation({
      protocolVersion: 1,
      assistantId: assistantA,
      assistantRevision: f.revision()
    })
    expect(first).toEqual(second)
    expect(first).toMatchObject({ ok: true, data: { deliveryId } })

    expect(
      f.broker.ackNavigation({
        protocolVersion: 1,
        assistantId: assistantA,
        assistantRevision: f.revision(),
        deliveryId: unknownDelivery
      })
    ).toEqual({ ok: true, data: { deliveryId: unknownDelivery, acknowledged: false } })
    expect(
      f.broker.pendingNavigation({
        protocolVersion: 1,
        assistantId: assistantA,
        assistantRevision: f.revision()
      })
    ).toMatchObject({ ok: true, data: { deliveryId } })

    const acknowledgement = {
      protocolVersion: 1 as const,
      assistantId: assistantA,
      assistantRevision: f.revision(),
      deliveryId
    }
    expect(f.broker.ackNavigation(acknowledgement)).toEqual({
      ok: true,
      data: { deliveryId, acknowledged: true }
    })
    expect(f.broker.ackNavigation(acknowledgement)).toEqual({
      ok: true,
      data: { deliveryId, acknowledged: true }
    })
    expect(
      f.broker.pendingNavigation({
        protocolVersion: 1,
        assistantId: assistantA,
        assistantRevision: f.revision()
      })
    ).toEqual({
      ok: true,
      data: null
    })
  })

  it('invalidates a delivery after an assistant switch and never replays it after switching back', () => {
    const f = fixture()
    f.broker.publish({ kind: 'open-item', itemId: itemA })
    f.setAssistant(assistantB)
    f.setAssistant(assistantA)
    expect(
      f.broker.pendingNavigation({
        protocolVersion: 1,
        assistantId: assistantA,
        assistantRevision: f.revision()
      })
    ).toEqual({
      ok: true,
      data: null
    })
  })

  it('drops a deleted target at both pull and acknowledgement boundaries', () => {
    const f = fixture()
    f.broker.publish({ kind: 'open-item', itemId: itemA })
    f.setTargetAvailable(false)
    expect(
      f.broker.pendingNavigation({
        protocolVersion: 1,
        assistantId: assistantA,
        assistantRevision: f.revision()
      })
    ).toEqual({
      ok: true,
      data: null
    })

    f.setTargetAvailable(true)
    const published = f.broker.publish({ kind: 'open-item', itemId: itemA })
    expect(published).not.toBeNull()
    if (!published) throw new Error('EXPECTED_DELIVERY')
    f.setTargetAvailable(false)
    expect(
      f.broker.ackNavigation({
        protocolVersion: 1,
        assistantId: assistantA,
        assistantRevision: f.revision(),
        deliveryId: published.deliveryId!
      })
    ).toEqual({
      ok: true,
      data: { deliveryId: published.deliveryId, acknowledged: false }
    })
  })

  it('rejects unavailable assistants and invalid targets before direct renderer delivery', () => {
    const f = fixture()
    f.setTargetAvailable(false)
    expect(f.broker.publish({ kind: 'open-item', itemId: itemA })).toBeNull()
    f.setTargetAvailable(true)
    f.setAssistant(null)
    expect(f.broker.publish({ kind: 'open-item', itemId: itemA })).toBeNull()
  })

  it('rejects stale assistant requests and leaves ordinary changed events outside navigation state', () => {
    const f = fixture()
    expect(f.broker.publish({ kind: 'changed', itemId: null })).toEqual({
      kind: 'changed',
      itemId: null
    })
    expect(
      f.broker.pendingNavigation({
        protocolVersion: 1,
        assistantId: assistantB,
        assistantRevision: f.revision()
      })
    ).toMatchObject({ ok: false, error: { code: 'PERMISSION_DENIED' } })
    f.setAssistant(null)
    expect(
      f.broker.pendingNavigation({
        protocolVersion: 1,
        assistantId: assistantA,
        assistantRevision: f.revision()
      })
    ).toMatchObject({ ok: false, error: { code: 'STORAGE_UNAVAILABLE' } })
  })
})
