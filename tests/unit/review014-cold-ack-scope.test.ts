import { expect, it } from 'vitest'
import { ReminderNavigationBroker } from '../../src/main/reminder/reminder-navigation.js'

it('an acknowledgement retained for assistant A is not reported as acknowledged for assistant B', () => {
  const assistantA = '00000000-0000-4000-8000-000000000001'
  const assistantB = '00000000-0000-4000-8000-000000000002'
  let current = { id: assistantA, revision: 1 }
  const broker = new ReminderNavigationBroker(
    () => current,
    () => true
  )
  const delivery = broker.publish({ kind: 'open-reminders', itemId: null })!
  const input = {
    protocolVersion: 1,
    assistantId: assistantA,
    assistantRevision: 1,
    deliveryId: delivery.deliveryId
  }
  expect(broker.ackNavigation(input)).toMatchObject({ ok: true, data: { acknowledged: true } })
  current = { id: assistantB, revision: 2 }
  expect(broker.ackNavigation({ ...input, assistantId: assistantB })).not.toMatchObject({
    ok: true,
    data: { acknowledged: true }
  })
})
