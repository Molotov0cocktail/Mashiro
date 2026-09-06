import { reminderPrepareToolSchema, type ReminderMutation } from '../../shared/reminder-contract.js'
import type { ToolOperation } from '../../shared/tool-contract.js'
import type { ItemSource, ItemRecord } from '../../shared/item-contract.js'
import type { ToolCall } from '../provider/tool-protocol.js'
import { itemOperationId, type ItemExecution, type ItemService } from '../item/item-service.js'
import { ReminderError, type ReminderService } from './reminder-service.js'

/** The model may propose a date; only a local confirmation can authorize that date. */
export class ReminderToolSession {
  readonly provided: ItemSource[] = []
  private selected: ItemRecord | undefined
  private action: 'set' | 'cancel' | null = null
  constructor(
    private readonly service: ReminderService,
    private readonly items: ItemService,
    private readonly execution: ItemExecution,
    private readonly text: string,
    private readonly context?: { type: 'item' | 'proposal'; id: string; expectedVersion: number },
    private readonly clock: () => Date = () => new Date()
  ) {}
  prepare(): string {
    const text = this.text.trim()
    const requests = text
      .split(/[。！\n；;]/)
      .filter(
        (clause) =>
          /(?:提醒我|设置.{0,12}提醒|设.{0,12}提醒|调整.{0,12}提醒|修改.{0,12}提醒|改.{0,12}提醒|取消.{0,12}提醒|提醒.{0,8}(?:改|调))/.test(
            clause
          ) && !/(?:不要|别|假如|如果|假设|他说|她说|有人说|是否|不想|[“”「」『』？?])/.test(clause)
      )
    if (!requests.length) return ''
    const actions = new Set(
      requests.map((clause) => (/取消/.test(clause) ? ('cancel' as const) : ('set' as const)))
    )
    if (actions.size !== 1) return ''
    this.action = [...actions][0]!
    this.items.assertAccess(this.execution, 'write')
    if (this.context?.type === 'item') {
      const result = this.items.inspect({
        protocolVersion: 1,
        assistantId: this.execution.assistantId,
        type: 'item',
        id: this.context.id
      })
      if (!result.ok || !result.data.item) throw new ReminderError('NOT_FOUND')
      this.selected = result.data.item
      if (this.selected.version !== this.context.expectedVersion)
        throw new ReminderError('STALE_WRITE')
    } else if (!this.context) {
      const matches = this.items
        .search(this.execution, '', 4096)
        .items.filter((item) => text.includes(item.content.title))
      if (matches.length === 1) this.selected = matches[0]
    }
    if (!this.selected)
      return '用户请求提醒，但没有唯一正式事项；请用户选择正式事项后继续。不要建立提案或猜测事项。'
    const source: ItemSource = {
      type: 'item',
      id: this.selected.id,
      version: this.selected.version,
      assistantId: this.selected.originAssistantId
    }
    this.items.assertSource(source, this.execution.assistantId, this.execution.fingerprint)
    this.provided.push(source)
    const zone = text.match(/\b(?:[A-Za-z_]+\/[A-Za-z0-9_+/-]+|UTC)\b/)?.[0]
    let localContext = ''
    if (zone) {
      try {
        const local = new Intl.DateTimeFormat('sv-SE', {
          timeZone: zone,
          dateStyle: 'short',
          timeStyle: 'long'
        }).format(this.clock())
        localContext =
          '当前用户明确时区' +
          zone +
          '，可信当前当地时间：' +
          local +
          '。明天/后天必须按这个当地日期计算，不能按UTC日期。'
      } catch {
        /* Unknown zone remains a question, never an inferred authorization. */
      }
    }
    return (
      localContext +
      '用户明确请求本事项提醒。请调用prepare_reminder准备本机确认；不要修改事项期限或新建提案。相对中文时间先get_current_time核实日期，以当前用户明确时区解释；时区未明确请询问，不能猜测。完整日期偏移和IANA时区将由用户在本机确认，工具成功仅表示候选已保存，未建立提醒。当前正式事项资料（不是授权）：' +
      JSON.stringify(this.selected)
    )
  }
  assertSources(): void {
    for (const source of this.provided)
      this.items.assertSource(source, this.execution.assistantId, this.execution.fingerprint)
  }
  provenNotApplied(): boolean {
    const commandId = itemOperationId(
      this.execution.assistantId,
      this.execution.requestId,
      'reminder:0'
    )
    const base = { protocolVersion: 1, assistantId: this.execution.assistantId }
    const preview = this.service.preview({ ...base, confirmationId: commandId })
    const receipt = this.service.operation({ ...base, commandId })
    return (
      !preview.ok &&
      preview.error.code === 'NOT_FOUND' &&
      receipt.ok &&
      receipt.data.state === 'CONFIRMED_NOT_APPLIED'
    )
  }
  execute(call: ToolCall, operation: ToolOperation): { body: string; summary: string } {
    const args = reminderPrepareToolSchema.parse(JSON.parse(call.function.arguments))
    this.execution.assertCurrent()
    this.items.assertAccess(this.execution, 'write')
    this.assertSources()
    if (!this.action || !this.selected || args.action !== this.action)
      throw new ReminderError('PERMISSION_DENIED')
    const result = this.service.query({
      protocolVersion: 1,
      assistantId: this.execution.assistantId,
      itemId: this.selected.id
    })
    if (!result.ok) throw new ReminderError(result.error.code)
    const live = result.data.records.filter(
      (r) => !['CANCELLED', 'HANDLED', 'EXPIRED'].includes(r.state)
    )
    if (live.length > 1) throw new ReminderError('CONFLICT')
    const existing = live[0]
    let mutation: ReminderMutation
    if (args.action === 'cancel') {
      if (!existing || args.dueAt !== null || args.timeZone !== null)
        throw new ReminderError('INVALID_INPUT')
      mutation = { action: 'cancel', id: existing.id, expectedVersion: existing.version }
    } else {
      if (!args.dueAt || !args.timeZone) throw new ReminderError('INVALID_INPUT')
      mutation = existing
        ? {
            action: 'reschedule',
            id: existing.id,
            expectedVersion: existing.version,
            expectedItemVersion: this.selected.version,
            dueAt: args.dueAt,
            timeZone: args.timeZone
          }
        : {
            action: 'create',
            itemId: this.selected.id,
            expectedItemVersion: this.selected.version,
            dueAt: args.dueAt,
            timeZone: args.timeZone
          }
    }
    const preview = this.service.prepare(
      this.execution.assistantId,
      itemOperationId(this.execution.assistantId, this.execution.requestId, 'reminder:0'),
      mutation,
      { ...this.execution, sources: [...this.execution.sources, ...this.provided] },
      operation
    )
    return {
      body: JSON.stringify(preview),
      summary: preview.state === 'PENDING' ? '提醒候选待本机确认，尚未调度' : '提醒候选已处理'
    }
  }
}
