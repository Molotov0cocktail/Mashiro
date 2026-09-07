import { expect, it } from 'vitest'
import { ReminderNavigationBroker } from '../../src/main/reminder/reminder-navigation.js'

const assistantA = '00000000-0000-4000-8000-000000000001'
const assistantB = '00000000-0000-4000-8000-000000000002'

it('a current-revision request cannot reuse another assistant or an older tenure acknowledgement', () => {
  let current = { id: assistantA, revision: 1 }
  const broker = new ReminderNavigationBroker(
    () => current,
    () => true
  )
  const delivery = broker.publish({ kind: 'open-reminders', itemId: null })!
  const ack = () =>
    broker.ackNavigation({
      protocolVersion: 1,
      assistantId: current.id,
      assistantRevision: current.revision,
      deliveryId: delivery.deliveryId
    })
  expect(ack()).toMatchObject({ ok: true, data: { acknowledged: true } })
  current = { id: assistantB, revision: 2 }
  expect(ack()).toMatchObject({ ok: true, data: { acknowledged: false } })
  current = { id: assistantA, revision: 3 }
  expect(ack()).toMatchObject({ ok: true, data: { acknowledged: false } })
})

it('an older delivery ack does not consume the newer live target', () => {
  const broker = new ReminderNavigationBroker(
    () => ({ id: assistantA, revision: 1 }),
    () => true
  )
  const older = broker.publish({ kind: 'open-reminders', itemId: null })!
  const newer = broker.publish({ kind: 'open-reminders', itemId: null })!
  expect(newer.deliveryId).not.toBe(older.deliveryId)
  expect(
    broker.ackNavigation({
      protocolVersion: 1,
      assistantId: assistantA,
      assistantRevision: 1,
      deliveryId: older.deliveryId
    })
  ).toMatchObject({ ok: true, data: { acknowledged: false } })
  expect(
    broker.pendingNavigation({ protocolVersion: 1, assistantId: assistantA, assistantRevision: 1 })
  ).toMatchObject({ ok: true, data: { deliveryId: newer.deliveryId } })
})

it('malformed revision and extra authority fields never reveal the pending target', () => {
  const broker = new ReminderNavigationBroker(
    () => ({ id: assistantA, revision: 1 }),
    () => true
  )
  broker.publish({ kind: 'open-reminders', itemId: null })
  for (const input of [
    { protocolVersion: 1, assistantId: assistantA },
    { protocolVersion: 1, assistantId: assistantA, assistantRevision: -1 },
    {
      protocolVersion: 1,
      assistantId: assistantA,
      assistantRevision: 1,
      includeOtherAssistants: true
    }
  ])
    expect(broker.pendingNavigation(input)).toMatchObject({
      ok: false,
      error: { code: 'INVALID_INPUT' }
    })
})
