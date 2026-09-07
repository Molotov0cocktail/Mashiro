import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { ItemService, ItemExecution } from '../item/item-service.js'
import type { ToolRepository } from '../provider/tool-repository.js'
import { toolOperationSchema, type ToolOperation } from '../../shared/tool-contract.js'
import {
  reminderPreviewSchema,
  reminderPreviewInputSchema,
  reminderConfirmInputSchema,
  type ReminderPreview
} from '../../shared/reminder-contract.js'
import type { SqliteStore } from '../data/sqlite.js'
import { itemRecordSchema, type ItemRecord } from '../../shared/item-contract.js'
import {
  reminderQueryInputSchema,
  reminderMutateInputSchema,
  reminderOperationInputSchema,
  reminderRuntimeInputSchema,
  reminderConfigureInputSchema,
  reminderRecordSchema,
  reminderReceiptSchema,
  reminderPolicySchema,
  reminderMutationSchema,
  type ReminderRecord,
  type ReminderReceipt,
  type ReminderMutation,
  type ReminderRuntime,
  type ReminderChanged,
  type reminderErrorSchema
} from '../../shared/reminder-contract.js'

type ErrorCode = z.infer<typeof reminderErrorSchema>['code']
export class ReminderError extends Error {
  constructor(readonly code: ErrorCode) {
    super(code)
  }
}
export interface ReminderLoginStartupMutation {
  rollbackIfUnchanged(): 'RESTORED' | 'UNCHANGED' | 'CONCURRENT_CHANGE' | 'UNKNOWN'
}
export interface ReminderPlatform {
  notificationSupported(): boolean
  loginStartupSupported(): boolean
  getLoginStartup(): boolean
  setLoginStartup(value: boolean): void | ReminderLoginStartupMutation
  show(
    input: { identities: { id: string; version: number }[]; count: number; groupId?: string },
    event: (kind: 'show' | 'failed' | 'click') => void
  ): { close(): void }
}
const noPlatform: ReminderPlatform = {
  notificationSupported: () => false,
  loginStartupSupported: () => false,
  getLoginStartup: () => false,
  setLoginStartup: () => {
    throw new ReminderError('UNSUPPORTED')
  },
  show: () => {
    throw new ReminderError('UNSUPPORTED')
  }
}
const terminal = new Set<ReminderRecord['state']>(['CANCELLED', 'HANDLED', 'EXPIRED'])
/** The offset is user input: reject an instant that does not describe that zone's wall clock. */
export function assertReminderTime(dueAt: string, timeZone: string, now: number): void {
  if (!Number.isFinite(Date.parse(dueAt)) || Date.parse(dueAt) <= now)
    throw new ReminderError('INVALID_INPUT')
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(new Date(dueAt))
    const get = (key: string) => parts.find((p) => p.type === key)!.value
    const wall =
      get('year') +
      '-' +
      get('month') +
      '-' +
      get('day') +
      'T' +
      get('hour') +
      ':' +
      get('minute') +
      ':' +
      get('second')
    if (wall !== dueAt.slice(0, 19)) throw new Error('Offset mismatch')
  } catch {
    throw new ReminderError('INVALID_INPUT')
  }
}
export class ReminderService {
  private publishedState: string
  private platform: ReminderPlatform = noPlatform
  private changed: (event: ReminderChanged) => void = () => undefined
  private lastTick: number | undefined
  private notices = new Map<string, { close(): void }>()
  private timeouts = new Set<ReturnType<typeof setTimeout>>()
  private stopped = false
  private callbackGeneration = 0
  constructor(
    private readonly store: SqliteStore,
    private readonly clock: () => Date = () => new Date(),
    private readonly fault?: (phase: string) => void,
    private readonly items?: ItemService,
    private readonly ledger?: ToolRepository
  ) {
    // Clock injection is observed only when reminder work occurs, never during service construction.
    this.publishedState = this.observableState()
  }
  attach(platform: ReminderPlatform, changed: (event: ReminderChanged) => void): void {
    if (this.stopped) return
    this.platform = platform
    this.changed = changed
  }
  private handle<T extends z.ZodType, R>(schema: T, input: unknown, fn: (value: z.infer<T>) => R) {
    try {
      return { ok: true as const, data: fn(schema.parse(input)) }
    } catch (error) {
      const code: ErrorCode =
        error instanceof ReminderError
          ? error.code
          : error instanceof z.ZodError
            ? 'INVALID_INPUT'
            : 'STORAGE_UNAVAILABLE'
      return {
        ok: false as const,
        error: {
          code,
          message: {
            INVALID_INPUT: '时间、时区或提醒参数不正确',
            NOT_FOUND: '提醒或事项不存在',
            STALE_WRITE: '事项或提醒已变化，请刷新',
            PERMISSION_DENIED: '当前状态不允许此操作',
            CONFLICT: '此操作身份已用于不同内容',
            STORAGE_UNAVAILABLE: '提醒结果未确认，请核查原操作',
            UNSUPPORTED: '当前运行环境不支持此系统设置'
          }[code]
        }
      }
    }
  }
  private active(assistantId: string): void {
    if (
      !this.store.database
        .prepare(
          'SELECT 1 FROM assistants WHERE id=? AND archived_at IS NULL AND id NOT IN(SELECT id FROM assistant_tombstones)'
        )
        .get(assistantId)
    )
      throw new ReminderError('PERMISSION_DENIED')
  }
  private item(id: string): ItemRecord {
    const row = this.store.database.prepare('SELECT record_json FROM items WHERE id=?').get(id)
    if (!row) throw new ReminderError('NOT_FOUND')
    return itemRecordSchema.parse(JSON.parse(String(row.record_json)))
  }
  private read(id: string): ReminderRecord {
    const row = this.store.database.prepare('SELECT record_json FROM reminders WHERE id=?').get(id)
    if (!row) throw new ReminderError('NOT_FOUND')
    return reminderRecordSchema.parse(JSON.parse(String(row.record_json)))
  }
  private all(): ReminderRecord[] {
    return this.store.database
      .prepare('SELECT record_json FROM reminders ORDER BY due_at,id')
      .all()
      .map((row) => reminderRecordSchema.parse(JSON.parse(String(row.record_json))))
  }
  private save(record: ReminderRecord): void {
    reminderRecordSchema.parse(record)
    this.store.database
      .prepare(
        'INSERT INTO reminders VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET item_id=excluded.item_id,version=excluded.version,state=excluded.state,due_at=excluded.due_at,record_json=excluded.record_json'
      )
      .run(
        record.id,
        record.itemId,
        record.version,
        record.state,
        record.dueAt,
        JSON.stringify(record)
      )
  }
  private valid(record: ReminderRecord): boolean {
    try {
      const item = this.item(record.itemId)
      return !['completed', 'cancelled'].includes(item.content.status)
    } catch {
      return false
    }
  }
  private observableState(): string {
    return JSON.stringify(
      this.store.database
        .prepare(
          'SELECT r.record_json,i.version AS item_version FROM reminders r LEFT JOIN items i ON i.id=r.item_id ORDER BY r.id'
        )
        .all()
    )
  }
  private notify(force = false): void {
    const current = this.observableState()
    if (!force && current === this.publishedState) return
    this.changed({ kind: 'changed', itemId: null })
    this.publishedState = current
  }
  private runtimeValue(): ReminderRuntime {
    const row = this.store.database
      .prepare('SELECT * FROM reminder_settings WHERE singleton=1')
      .get()!
    const storedPolicy = reminderPolicySchema.parse(JSON.parse(String(row.policy_json)))
    // REM-002 (user confirmed 2026-09-07). Version zero means no user settings exist.
    // Explicit user settings, including disabled legacy policy, always take precedence.
    const policy =
      Number(row.version) === 0 && storedPolicy.mode === 'UNCONFIGURED'
        ? { mode: 'EXPLICIT' as const, catchUpMinutes: 1440, merge: true }
        : storedPolicy
    return {
      version: Number(row.version),
      policy,
      loginStartup: this.platform.getLoginStartup(),
      loginStartupSupported: this.platform.loginStartupSupported(),
      notificationSupported: this.platform.notificationSupported(),
      runningInTray: true
    }
  }
  runtime(input: unknown) {
    return this.handle(reminderRuntimeInputSchema, input, () => this.runtimeValue())
  }
  configure(input: unknown) {
    return this.handle(reminderConfigureInputSchema, input, (value) => {
      const previous = this.runtimeValue()
      if (previous.version !== value.expectedVersion) throw new ReminderError('STALE_WRITE')
      if (value.loginStartup !== previous.loginStartup && !previous.loginStartupSupported)
        throw new ReminderError('UNSUPPORTED')
      // Registration is external: query actual state on every receipt, never infer success from SQLite.
      let loginMutation: ReminderLoginStartupMutation | undefined
      let loginChanged = false
      try {
        if (value.loginStartup !== previous.loginStartup) {
          loginChanged = true
          loginMutation = this.platform.setLoginStartup(value.loginStartup) ?? undefined
          this.fault?.('after-login-startup')
        }
        if (this.platform.getLoginStartup() !== value.loginStartup)
          throw new ReminderError('STORAGE_UNAVAILABLE')
        this.store.transaction(() => {
          this.fault?.('before-login-config-commit')
          const result = this.store.database
            .prepare(
              'UPDATE reminder_settings SET version=version+1,policy_json=? WHERE singleton=1 AND version=?'
            )
            .run(JSON.stringify(value.policy), value.expectedVersion)
          if (Number(result.changes) !== 1) throw new ReminderError('STALE_WRITE')
        })
      } catch (error) {
        // Restore only when Windows still exposes this call's exact post-write snapshot.
        // Concurrent user changes remain untouched; an unverified restore is reported as unknown.
        const restoration = loginMutation?.rollbackIfUnchanged()
        if (
          loginChanged &&
          (restoration === undefined ||
            restoration === 'CONCURRENT_CHANGE' ||
            restoration === 'UNKNOWN')
        )
          throw new ReminderError('STORAGE_UNAVAILABLE')
        throw error
      }
      this.tick(true)
      this.notify(true)
      return this.runtimeValue()
    })
  }
  query(input: unknown) {
    return this.handle(reminderQueryInputSchema, input, (value) => {
      this.active(value.assistantId)
      this.reconcile()
      return {
        records: this.all().filter((r) => !value.itemId || r.itemId === value.itemId),
        runtime: this.runtimeValue()
      }
    })
  }
  operation(input: unknown) {
    return this.handle(reminderOperationInputSchema, input, (value) => {
      this.active(value.assistantId)
      const row = this.store.database
        .prepare('SELECT receipt_json FROM reminder_commands WHERE id=? AND assistant_id=?')
        .get(value.commandId, value.assistantId)
      return row
        ? reminderReceiptSchema.parse(JSON.parse(String(row.receipt_json)))
        : {
            operationId: value.commandId,
            reminderId: null,
            reminderVersion: 0,
            state: 'CONFIRMED_NOT_APPLIED' as const,
            summary: '原操作尚未提交'
          }
    })
  }
  mutate(input: unknown) {
    return this.handle(reminderMutateInputSchema, input, (value) =>
      this.apply(value.assistantId, value.commandId, value.mutation)
    )
  }
  apply(
    assistantId: string,
    commandId: string,
    mutation: ReminderMutation,
    execution?: { assertCurrent(): void; commitReceipt?(receipt: ReminderReceipt): void }
  ): ReminderReceipt {
    mutation = reminderMutationSchema.parse(mutation)
    this.active(assistantId)
    execution?.assertCurrent()
    const digest = createHash('sha256').update(JSON.stringify(mutation)).digest('hex')
    const receipt = this.store.transaction(() => {
      this.active(assistantId)
      execution?.assertCurrent()
      const old = this.store.database
        .prepare('SELECT * FROM reminder_commands WHERE id=?')
        .get(commandId)
      if (old) {
        if (old.assistant_id !== assistantId || old.arguments_hash !== digest)
          throw new ReminderError('CONFLICT')
        const receipt = reminderReceiptSchema.parse(JSON.parse(String(old.receipt_json)))
        execution?.commitReceipt?.(receipt)
        return receipt
      }
      if (
        !execution &&
        this.store.database.prepare('SELECT 1 FROM reminder_previews WHERE id=?').get(commandId)
      )
        throw new ReminderError('CONFLICT')
      const now = this.clock().toISOString()
      let record: ReminderRecord
      if (mutation.action === 'create' || mutation.action === 'reschedule') {
        const previous = mutation.action === 'reschedule' ? this.read(mutation.id) : null
        if (
          previous &&
          previous.version !== (mutation as { expectedVersion: number }).expectedVersion
        )
          throw new ReminderError('STALE_WRITE')
        const item = this.item(mutation.action === 'create' ? mutation.itemId : previous!.itemId)
        if (item.version !== mutation.expectedItemVersion) throw new ReminderError('STALE_WRITE')
        if (['completed', 'cancelled'].includes(item.content.status))
          throw new ReminderError('PERMISSION_DENIED')
        assertReminderTime(mutation.dueAt, mutation.timeZone, this.clock().getTime())
        record = {
          id: previous?.id ?? randomUUID(),
          itemId: item.id,
          itemVersion: item.version,
          version: (previous?.version ?? 0) + 1,
          dueAt: mutation.dueAt,
          timeZone: mutation.timeZone,
          state: 'SCHEDULED',
          createdAt: previous?.createdAt ?? now,
          updatedAt: now
        }
      } else {
        record = this.read(mutation.id)
        if (record.version !== mutation.expectedVersion) throw new ReminderError('STALE_WRITE')
        record = {
          ...record,
          version: record.version + 1,
          state: mutation.action === 'cancel' ? 'CANCELLED' : 'HANDLED',
          updatedAt: now
        }
      }
      this.save(record)
      this.fault?.('after-business')
      const receipt: ReminderReceipt = {
        operationId: commandId,
        reminderId: record.id,
        reminderVersion: record.version,
        state: 'SUCCEEDED',
        summary: '提醒操作已提交'
      }
      this.store.database
        .prepare('INSERT INTO reminder_commands VALUES(?,?,?,?)')
        .run(commandId, assistantId, digest, JSON.stringify(receipt))
      execution?.assertCurrent()
      execution?.commitReceipt?.(receipt)
      this.fault?.('before-commit')
      return receipt
    })
    this.reconcile()
    this.notify()
    return receipt
  }
  prepare(
    assistantId: string,
    commandId: string,
    mutation: ReminderMutation,
    execution: ItemExecution,
    operation: ToolOperation
  ): ReminderPreview {
    this.active(assistantId)
    execution.assertCurrent()
    this.items!.assertAccess(execution, 'write')
    const itemId = mutation.action === 'create' ? mutation.itemId : this.read(mutation.id).itemId
    const item = this.item(itemId)
    for (const source of execution.sources)
      this.items!.assertSource(source, assistantId, execution.fingerprint)
    if (mutation.action === 'create' || mutation.action === 'reschedule')
      assertReminderTime(mutation.dueAt, mutation.timeZone, this.clock().getTime())
    return this.store.transaction(() => {
      const existing = this.store.database
        .prepare('SELECT record_json FROM reminder_previews WHERE id=?')
        .get(commandId)
      let preview: ReminderPreview
      if (existing) {
        preview = reminderPreviewSchema.parse(JSON.parse(String(existing.record_json)))
        if (JSON.stringify(preview.mutation) !== JSON.stringify(mutation))
          throw new ReminderError('CONFLICT')
      } else {
        if (
          this.store.database.prepare('SELECT 1 FROM reminder_commands WHERE id=?').get(commandId)
        )
          throw new ReminderError('CONFLICT')
        preview = {
          confirmationId: commandId,
          commandId,
          itemId: item.id,
          itemVersion: item.version,
          itemTitle: item.content.title,
          mutation,
          state: 'PENDING',
          receipt: null
        }
        this.store.database.prepare('INSERT INTO reminder_previews VALUES(?,?,?,?)').run(
          commandId,
          assistantId,
          JSON.stringify(preview),
          JSON.stringify({
            assistantId,
            requestId: execution.requestId,
            fingerprint: execution.fingerprint,
            sources: execution.sources
          })
        )
      }
      execution.assertCurrent()
      this.ledger!.update(
        {
          ...operation,
          state: 'SUCCEEDED',
          reminderPreview: preview,
          summary: preview.state === 'PENDING' ? '提醒候选待本机确认，尚未调度' : '提醒候选已处理',
          updatedAt: this.clock().toISOString()
        },
        JSON.stringify(preview),
        true
      )
      Object.assign(operation, {
        state: 'SUCCEEDED',
        reminderPreview: preview,
        summary: preview.state === 'PENDING' ? '提醒候选待本机确认，尚未调度' : '提醒候选已处理'
      })
      return preview
    })
  }
  preview(input: unknown) {
    return this.handle(reminderPreviewInputSchema, input, (value) => {
      this.active(value.assistantId)
      const row = this.store.database
        .prepare('SELECT record_json FROM reminder_previews WHERE id=? AND assistant_id=?')
        .get(value.confirmationId, value.assistantId)
      if (!row) throw new ReminderError('NOT_FOUND')
      return reminderPreviewSchema.parse(JSON.parse(String(row.record_json)))
    })
  }
  confirm(input: unknown) {
    return this.handle(reminderConfirmInputSchema, input, (value) => {
      this.active(value.assistantId)
      const row = this.store.database
        .prepare('SELECT * FROM reminder_previews WHERE id=? AND assistant_id=?')
        .get(value.confirmationId, value.assistantId)
      if (!row) throw new ReminderError('NOT_FOUND')
      const preview = reminderPreviewSchema.parse(JSON.parse(String(row.record_json)))
      if (preview.receipt) return preview.receipt
      const proof = JSON.parse(String(row.proof_json)) as Omit<ItemExecution, 'assertCurrent'>
      const check = () => {
        this.active(value.assistantId)
        const current = this.item(preview.itemId)
        if (current.version !== preview.itemVersion) throw new ReminderError('STALE_WRITE')
        const execution = { ...proof, assertCurrent: () => undefined }
        this.items!.assertAccess(execution, 'write')
        for (const source of proof.sources)
          this.items!.assertSource(source, value.assistantId, proof.fingerprint)
      }
      const save = (receipt: ReminderReceipt) => {
        preview.state = value.accept ? 'ACCEPTED' : 'REJECTED'
        preview.receipt = receipt
        this.store.database
          .prepare('UPDATE reminder_previews SET record_json=? WHERE id=?')
          .run(JSON.stringify(preview), preview.confirmationId)
        // Each original protocol operation gets the authoritative confirmation status in this transaction.
        for (const row of this.store.database
          .prepare('SELECT record_json FROM tool_operations')
          .all()) {
          const operation = JSON.parse(String(row.record_json)) as ToolOperation
          if (operation.reminderPreview?.confirmationId === preview.confirmationId) {
            const updated = toolOperationSchema.parse({
              ...operation,
              reminderPreview: preview,
              reminderReceipt: receipt,
              summary: receipt.summary,
              updatedAt: this.clock().toISOString()
            })
            this.store.database
              .prepare('UPDATE tool_operations SET record_json=? WHERE id=?')
              .run(JSON.stringify(updated), operation.operationId)
            this.store.database
              .prepare('UPDATE protocol_results SET result_json=? WHERE operation_id=?')
              .run(JSON.stringify(preview), operation.operationId)
          }
        }
      }
      if (!value.accept)
        return this.store.transaction(() => {
          const receipt: ReminderReceipt = {
            operationId: preview.commandId,
            reminderId: null,
            reminderVersion: 0,
            state: 'CONFIRMED_NOT_APPLIED',
            summary: '已拒绝提醒候选，未建立调度'
          }
          save(receipt)
          return receipt
        })
      return this.apply(value.assistantId, preview.commandId, preview.mutation, {
        assertCurrent: check,
        commitReceipt: save
      })
    })
  }
  /** Also invalidates live notifications after item edits, completion, deletion and cancellation. */
  reconcile(): void {
    this.store.transaction(() => {
      for (const record of this.all()) {
        if (!terminal.has(record.state) && !this.valid(record))
          this.save({ ...record, state: 'CANCELLED', updatedAt: this.clock().toISOString() })
      }
    })
    const retired = new Set<{ close(): void }>()
    for (const [key, notice] of this.notices) {
      const split = key.lastIndexOf(':')
      try {
        const record = this.read(key.slice(0, split))
        if (
          record.version === Number(key.slice(split + 1)) &&
          !terminal.has(record.state) &&
          this.valid(record)
        )
          continue
      } catch {
        /* Deleted state cannot reactivate. */
      }
      retired.add(notice)
      this.notices.delete(key)
    }
    // A merged native notification belongs to all of its still-valid members.
    const retained = new Set(this.notices.values())
    for (const notice of retired) if (!retained.has(notice)) notice.close()
  }
  recover(): void {
    if (this.stopped) return
    this.store.transaction(() => {
      for (const record of this.all())
        if (record.state === 'DISPATCHING') {
          this.save({ ...record, state: 'RESULT_UNKNOWN', updatedAt: this.clock().toISOString() })
          this.store.database
            .prepare(
              "UPDATE reminder_occurrences SET state='RESULT_UNKNOWN' WHERE reminder_id=? AND version=?"
            )
            .run(record.id, record.version)
        }
    })
    this.tick(true)
  }
  tick(recovery = false): void {
    if (this.stopped) return
    const now = this.clock().getTime()
    recovery ||= now - (this.lastTick ?? now) > 5000 || now < (this.lastTick ?? now)
    this.lastTick = now
    this.reconcile()
    const policy = this.runtimeValue().policy
    const claimed = this.store.transaction(() => {
      const ready: ReminderRecord[] = []
      const records = this.all()
      const latestMissed = new Map<string, ReminderRecord>()
      for (const record of records) {
        if (
          !(recovery || record.state === 'RECOVERY_PENDING') ||
          !['SCHEDULED', 'RECOVERY_PENDING'].includes(record.state) ||
          Date.parse(record.dueAt) > now ||
          !this.valid(record)
        )
          continue
        const previous = latestMissed.get(record.itemId)
        if (
          !previous ||
          Date.parse(record.dueAt) > Date.parse(previous.dueAt) ||
          (record.dueAt === previous.dueAt && record.id > previous.id)
        )
          latestMissed.set(record.itemId, record)
      }
      for (const record of records) {
        if (
          !['SCHEDULED', 'RECOVERY_PENDING'].includes(record.state) ||
          Date.parse(record.dueAt) > now ||
          !this.valid(record)
        )
          continue
        if (recovery || record.state === 'RECOVERY_PENDING') {
          if (policy.mode === 'UNCONFIGURED') {
            if (record.state === 'RECOVERY_PENDING') continue
            this.save({
              ...record,
              state: 'RECOVERY_PENDING',
              updatedAt: this.clock().toISOString()
            })
            continue
          }
          if (
            latestMissed.get(record.itemId)?.id !== record.id ||
            policy.catchUpMinutes === 0 ||
            now - Date.parse(record.dueAt) > policy.catchUpMinutes * 60000
          ) {
            this.save({ ...record, state: 'EXPIRED', updatedAt: this.clock().toISOString() })
            continue
          }
        }
        const result = this.store.database
          .prepare("INSERT OR IGNORE INTO reminder_occurrences VALUES(?,?,'DISPATCHING')")
          .run(record.id, record.version)
        if (Number(result.changes) !== 1) continue
        this.save({ ...record, state: 'DISPATCHING', updatedAt: this.clock().toISOString() })
        ready.push(record)
      }
      return ready
    })
    this.fault?.('after-claim')
    const batches: ReminderRecord[][] = []
    if (policy.mode === 'EXPLICIT' && policy.merge) {
      batches.push(claimed)
    } else batches.push(...claimed.map((r) => [r]))
    for (const batch of batches) if (batch.length) this.dispatch(batch)
    this.notify()
  }
  private dispatch(records: ReminderRecord[]): void {
    const current = records.filter((record) => {
      const actual = this.read(record.id)
      return (
        actual.version === record.version && actual.state === 'DISPATCHING' && this.valid(actual)
      )
    })
    if (!current.length) return
    const groupId = createHash('sha256')
      .update(
        current
          .map((r) => r.id + ':' + r.version)
          .sort()
          .join(',')
      )
      .digest('hex')
    this.store.transaction(() => {
      const insert = this.store.database.prepare(
        'INSERT OR IGNORE INTO reminder_notification_members VALUES(?,?,?)'
      )
      for (const record of current) insert.run(groupId, record.id, record.version)
    })
    if (!this.platform.notificationSupported()) {
      this.settle(current, 'FAILED')
      return
    }
    let observed = false
    const callbackGeneration = this.callbackGeneration
    let notice: { close(): void }
    try {
      notice = this.platform.show(
        {
          identities: current.map((r) => ({ id: r.id, version: r.version })),
          count: current.length,
          groupId
        },
        (event) => {
          if (this.stopped || callbackGeneration !== this.callbackGeneration) return
          if (event === 'click') {
            this.activateGroup(groupId)
          } else {
            observed = true
            this.settle(current, event === 'show' ? 'DISPLAY_OBSERVED' : 'FAILED')
          }
        }
      )
    } catch {
      // A thrown native call may have dispatched before throwing. Never infer non-application.
      this.settle(current, 'RESULT_UNKNOWN')
      return
    }
    for (const record of current) this.notices.set(record.id + ':' + record.version, notice)
    this.fault?.('after-show')
    if (!observed) {
      const timer = setTimeout(() => {
        this.timeouts.delete(timer)
        if (this.stopped || callbackGeneration !== this.callbackGeneration) return
        this.settle(current, 'RESULT_UNKNOWN')
      }, 10000)
      timer.unref?.()
      this.timeouts.add(timer)
    }
  }
  private settle(records: ReminderRecord[], state: ReminderRecord['state']): void {
    this.store.transaction(() => {
      for (const original of records) {
        const record = this.read(original.id)
        if (
          record.version !== original.version ||
          !(
            ['DISPATCHING', 'RESULT_UNKNOWN'].includes(record.state) ||
            (state === 'FAILED' && record.state === 'DISPLAY_OBSERVED')
          ) ||
          !this.valid(record)
        )
          continue
        this.save({ ...record, state, updatedAt: this.clock().toISOString() })
        this.store.database
          .prepare('UPDATE reminder_occurrences SET state=? WHERE reminder_id=? AND version=?')
          .run(state, record.id, record.version)
      }
    })
    this.notify()
  }
  activate(id: string, version: number): void {
    this.activateBatch([{ id, version }])
  }
  activateGroup(groupId: string): void {
    if (this.stopped || !/^[a-f0-9]{64}$/.test(groupId)) return
    try {
      const members = this.store.database
        .prepare(
          'SELECT reminder_id,version FROM reminder_notification_members WHERE group_id=? ORDER BY reminder_id,version'
        )
        .all(groupId)
      this.activateVerified(
        members.map((row) => ({ id: String(row.reminder_id), version: Number(row.version) }))
      )
    } catch {
      /* External group activation does not expose storage details. */
    }
  }
  activateBatch(identities: { id: string; version: number }[]): void {
    if (this.stopped) return
    try {
      const parsed = z
        .array(z.strictObject({ id: z.string().uuid(), version: z.number().int().positive() }))
        .min(1)
        .max(100)
        .parse(identities)
      this.activateVerified(parsed)
    } catch {
      /* Invalid external activation is inert. */
    }
  }
  private activateVerified(parsed: { id: string; version: number }[]): void {
    try {
      const current = parsed
        .map((identity) => this.read(identity.id))
        .filter(
          (record, i) =>
            record.version === parsed[i]!.version &&
            ['DISPLAY_OBSERVED', 'RESULT_UNKNOWN', 'DISPATCHING'].includes(record.state) &&
            this.valid(record)
        )
      if (!current.length) return
      const identity = parsed
        .map((r) => r.id + ':' + r.version)
        .sort()
        .join(',')
      const result = this.store.database
        .prepare('INSERT OR IGNORE INTO reminder_activations VALUES(?)')
        .run(identity)
      if (!Number(result.changes)) return
      this.changed(
        current.length === 1
          ? { kind: 'open-item', itemId: current[0]!.itemId }
          : { kind: 'open-reminders', itemId: null }
      )
    } catch {
      /* External activation must not expose storage details. */
    }
  }
  close(): void {
    if (this.stopped) return
    this.stopped = true
    this.callbackGeneration += 1
    for (const timer of this.timeouts) clearTimeout(timer)
    this.timeouts.clear()
    this.changed = () => undefined
    this.platform = noPlatform
    // Process shutdown keeps already-dispatched native notifications available for cold activation.
    // Business completion, cancellation and cleanup withdraw them through reconcile().
  }
}
