import { randomUUID } from 'node:crypto'
import {
  reminderAckNavigationInputSchema,
  reminderNavigationDeliverySchema,
  reminderPendingNavigationInputSchema,
  type ReminderChanged,
  type ReminderNavigationDelivery
} from '../../shared/reminder-contract.js'

type CurrentAssistant = () => { id: string | null; revision: number }
type ValidateDelivery = (delivery: ReminderNavigationDelivery) => boolean

const invalidInput = () => ({
  ok: false as const,
  error: { code: 'INVALID_INPUT' as const, message: '提醒导航参数不正确' }
})
const unavailable = () => ({
  ok: false as const,
  error: { code: 'STORAGE_UNAVAILABLE' as const, message: '当前助手状态暂不可用' }
})
const denied = () => ({
  ok: false as const,
  error: { code: 'PERMISSION_DENIED' as const, message: '提醒导航不属于当前助手' }
})

export class ReminderNavigationBroker {
  private pending: ReminderNavigationDelivery | null = null
  private pendingRevision: number | null = null
  private acknowledged: { deliveryId: string; assistantId: string; revision: number }[] = []

  constructor(
    private readonly currentAssistant: CurrentAssistant,
    private readonly validate: ValidateDelivery
  ) {}

  publish(event: ReminderChanged): ReminderChanged | null {
    if (event.kind === 'changed') return event
    const current = this.currentAssistant()
    if (!current.id) return null
    const delivery = reminderNavigationDeliverySchema.parse({
      deliveryId: randomUUID(),
      assistantId: current.id,
      assistantRevision: current.revision,
      kind: event.kind,
      itemId: event.itemId
    })
    if (!this.validate(delivery)) return null
    this.pending = delivery
    this.pendingRevision = current.revision
    return delivery
  }

  pendingNavigation(input: unknown) {
    const parsed = reminderPendingNavigationInputSchema.safeParse(input)
    if (!parsed.success) return invalidInput()
    const current = this.currentAssistant()
    if (!current.id) return unavailable()
    if (
      current.id !== parsed.data.assistantId ||
      current.revision !== parsed.data.assistantRevision
    )
      return denied()
    if (!this.pending) return { ok: true as const, data: null }
    if (
      this.pending.assistantId !== current.id ||
      this.pendingRevision !== current.revision ||
      !this.validate(this.pending)
    ) {
      this.pending = null
      this.pendingRevision = null
      return { ok: true as const, data: null }
    }
    return { ok: true as const, data: this.pending }
  }

  ackNavigation(input: unknown) {
    const parsed = reminderAckNavigationInputSchema.safeParse(input)
    if (!parsed.success) return invalidInput()
    const current = this.currentAssistant()
    if (!current.id) return unavailable()
    if (
      current.id !== parsed.data.assistantId ||
      current.revision !== parsed.data.assistantRevision
    )
      return denied()
    const acknowledged = this.acknowledged.find(
      (value) => value.deliveryId === parsed.data.deliveryId
    )
    if (acknowledged) {
      return {
        ok: true as const,
        data: {
          deliveryId: parsed.data.deliveryId,
          acknowledged:
            acknowledged.assistantId === current.id && acknowledged.revision === current.revision
        }
      }
    }
    if (!this.pending || this.pending.deliveryId !== parsed.data.deliveryId) {
      return {
        ok: true as const,
        data: { deliveryId: parsed.data.deliveryId, acknowledged: false }
      }
    }
    if (
      this.pending.assistantId !== current.id ||
      this.pendingRevision !== current.revision ||
      !this.validate(this.pending)
    ) {
      this.pending = null
      this.pendingRevision = null
      return {
        ok: true as const,
        data: { deliveryId: parsed.data.deliveryId, acknowledged: false }
      }
    }
    this.pending = null
    this.pendingRevision = null
    this.acknowledged.push({
      deliveryId: parsed.data.deliveryId,
      assistantId: current.id,
      revision: current.revision
    })
    if (this.acknowledged.length > 64) this.acknowledged.shift()
    return {
      ok: true as const,
      data: { deliveryId: parsed.data.deliveryId, acknowledged: true }
    }
  }
}
