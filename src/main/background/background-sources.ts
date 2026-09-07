import { createHash } from 'node:crypto'
import type { SqliteStore } from '../data/sqlite.js'
import type { MemoryService } from '../memory/memory-service.js'
import { itemReceiptSchema } from '../../shared/item-contract.js'
import { memoryReceiptSchema } from '../../shared/memory-contract.js'
import { reminderPreviewSchema, reminderReceiptSchema } from '../../shared/reminder-contract.js'
import {
  retentionConfirmInputSchema,
  retentionReceiptSchema
} from '../../shared/retention-contract.js'
import { toolOperationSchema, type ToolOperation } from '../../shared/tool-contract.js'
import type { MemorySource } from '../../shared/memory-contract.js'

export const digest = (value: string) => createHash('sha256').update(value).digest('hex')
export class BackgroundError extends Error {
  constructor(
    readonly code:
      | 'INVALID_INPUT'
      | 'NOT_FOUND'
      | 'STALE_WRITE'
      | 'PERMISSION_DENIED'
      | 'CONFIGURATION'
      | 'CONFLICT'
      | 'STORAGE_UNAVAILABLE'
  ) {
    super(code)
  }
}
export function assertAssistant(store: SqliteStore, assistantId: string): void {
  const row = store.database
    .prepare('SELECT archived_at FROM assistants WHERE id=?')
    .get(assistantId)
  if (
    !row ||
    row.archived_at !== null ||
    store.database.prepare('SELECT 1 FROM assistant_tombstones WHERE id=?').get(assistantId)
  )
    throw new BackgroundError('PERMISSION_DENIED')
}

/** Protocol completion proves a tool returned, not that its business confirmation completed. */
function currentBusiness(store: SqliteStore, assistantId: string, operation: ToolOperation) {
  const current = { ...operation }
  let retentionOutcome: ReturnType<typeof currentRetentionIntent> | null = null
  const blocked = (): never => {
    throw new BackgroundError('PERMISSION_DENIED')
  }
  const command = (
    table: 'memory_commands' | 'item_commands' | 'reminder_commands',
    id: string
  ) => {
    const row = store.database
      .prepare('SELECT * FROM ' + table + ' WHERE id=? AND assistant_id=?')
      .get(id, assistantId)
    if (!row?.receipt_json) return blocked()
    return row
  }
  try {
    if (['PREPARED', 'DISPATCHING', 'RESULT_UNKNOWN'].includes(current.state)) blocked()
    if (current.memoryReceipt) {
      const row = command('memory_commands', current.memoryReceipt.operationId)
      const receipt = memoryReceiptSchema.parse(JSON.parse(String(row.receipt_json)))
      if (
        receipt.operationId !== current.memoryReceipt.operationId ||
        !['SUCCEEDED', 'CANCELLED'].includes(String(row.state)) ||
        !['SUCCEEDED', 'CANCELLED_BEFORE_DISPATCH'].includes(receipt.state)
      )
        blocked()
      current.memoryReceipt = receipt
    }
    if (current.itemReceipt) {
      // Preview identities are the original command identities; confirm overwrites that command.
      const row = command('item_commands', current.itemReceipt.operationId)
      const receipt = itemReceiptSchema.parse(JSON.parse(String(row.receipt_json)))
      if (
        receipt.operationId !== current.itemReceipt.operationId ||
        ['PENDING_CONFIRMATION', 'RESULT_UNKNOWN'].includes(receipt.state)
      )
        blocked()
      current.itemReceipt = receipt
    }
    if (current.reminderPreview) {
      const snapshot = current.reminderPreview
      const row = store.database
        .prepare('SELECT record_json FROM reminder_previews WHERE id=? AND assistant_id=?')
        .get(snapshot.confirmationId, assistantId)
      if (!row) return blocked()
      const preview = reminderPreviewSchema.parse(JSON.parse(String(row.record_json)))
      if (
        preview.confirmationId !== snapshot.confirmationId ||
        preview.commandId !== snapshot.commandId ||
        preview.state === 'PENDING' ||
        !preview.receipt ||
        preview.receipt.operationId !== preview.commandId
      )
        return blocked()
      let receipt = preview.receipt
      if (preview.state === 'ACCEPTED') {
        receipt = reminderReceiptSchema.parse(
          JSON.parse(String(command('reminder_commands', preview.commandId).receipt_json))
        )
        if (receipt.operationId !== preview.commandId || receipt.state !== 'SUCCEEDED') blocked()
      } else if (receipt.state !== 'CONFIRMED_NOT_APPLIED') blocked()
      current.reminderPreview = { ...preview, receipt }
      current.reminderReceipt = receipt
    } else if (current.reminderReceipt) {
      const receipt = reminderReceiptSchema.parse(
        JSON.parse(
          String(command('reminder_commands', current.reminderReceipt.operationId).receipt_json)
        )
      )
      if (
        receipt.operationId !== current.reminderReceipt.operationId ||
        receipt.state === 'RESULT_UNKNOWN'
      )
        blocked()
      current.reminderReceipt = receipt
    }
    if (current.retentionPreview)
      retentionOutcome = currentRetentionIntent(store, assistantId, current.retentionPreview)
  } catch {
    return blocked()
  }
  return { operation: current, retentionOutcome }
}

/** Resolve only this preview's durable authority; never guess by scanning other commands. */
export function currentRetentionIntent(
  store: SqliteStore,
  assistantId: string,
  preview: NonNullable<ToolOperation['retentionPreview']>
): { state: string; receipt: ReturnType<typeof retentionReceiptSchema.parse> | null } {
  const blocked = (): never => {
    throw new BackgroundError('PERMISSION_DENIED')
  }
  try {
    const row = store.database
      .prepare(
        'SELECT state,epoch,nonce,manifest_json FROM retention_previews WHERE id=? AND assistant_id=?'
      )
      .get(preview.id, assistantId)
    if (!row || row.nonce !== preview.nonce || row.epoch !== preview.epoch) return blocked()
    const epoch = store.database
      .prepare('SELECT epoch FROM retention_state WHERE singleton=1')
      .get()?.epoch
    if (row.state === 'pending') {
      if (typeof epoch !== 'number' || Number(row.epoch) >= epoch) return blocked()
      return { state: 'EXPIRED_INTENT_ONLY', receipt: null }
    }
    if (row.state !== 'closed') return blocked()
    const proof = JSON.parse(String(row.manifest_json)) as Record<string, unknown>
    if (proof.version !== 1) return blocked()
    if (proof.kind === 'invalidated' && Object.keys(proof).length === 2)
      return { state: 'INVALIDATED_NOT_APPLIED', receipt: null }
    if (proof.kind !== 'confirmation' || Object.keys(proof).length !== 4) return blocked()
    const confirmation = retentionConfirmInputSchema.parse({
      protocolVersion: 1,
      assistantId,
      commandId: proof.commandId,
      previewId: preview.id,
      nonce: preview.nonce,
      accept: proof.accept
    })
    const command = store.database
      .prepare(
        'SELECT intent_hash,receipt_json FROM retention_commands WHERE id=? AND assistant_id=?'
      )
      .get(confirmation.commandId, assistantId)
    if (!command || command.intent_hash !== digest(JSON.stringify(confirmation))) return blocked()
    const receipt = retentionReceiptSchema.parse(JSON.parse(String(command.receipt_json)))
    if (
      receipt.commandId !== confirmation.commandId ||
      (!confirmation.accept && receipt.state !== 'CANCELLED') ||
      (confirmation.accept && receipt.state === 'CANCELLED')
    )
      return blocked()
    if (receipt.state === 'CLEANUP_PENDING' || receipt.state === 'COMPLETED') {
      if (!receipt.jobId) return blocked()
      const job = store.database
        .prepare('SELECT state,command_id FROM retention_jobs WHERE id=? AND assistant_id=?')
        .get(receipt.jobId, assistantId)
      if (job?.state !== 'COMPLETED' || job.command_id !== receipt.commandId) return blocked()
      return { state: 'COMPLETED', receipt: { ...receipt, state: 'COMPLETED' } }
    }
    return { state: receipt.state, receipt }
  } catch {
    return blocked()
  }
}

/** Complete dependency closure, with no partial tool protocol or transient saved-session source. */
export function roundSource(store: SqliteStore, assistantId: string, root: string) {
  // Only these complete rounds are summarized. Ancestor authority remains in the source DAG;
  // replaying every ancestor body would make a long conversation impossible to organize.
  const requestIds = [root]
  const rounds = requestIds.map((id) => {
    if (
      store.database.prepare('SELECT 1 FROM retention_original_trash WHERE request_id=?').get(id) ||
      store.database.prepare("SELECT 1 FROM content_tombstones WHERE kind='round' AND id=?").get(id)
    )
      throw new BackgroundError('PERMISSION_DENIED')
    const messages = store.database
      .prepare(
        'SELECT role,content,status,created_at,source_session_id FROM timeline_messages WHERE assistant_id=? AND request_id=? ORDER BY sequence'
      )
      .all(assistantId, id)
    if (
      messages.length !== 2 ||
      messages[0]!.role !== 'user' ||
      messages[1]!.role !== 'assistant' ||
      messages.some((m) => m.status !== 'completed' || m.source_session_id !== null)
    )
      throw new BackgroundError('PERMISSION_DENIED')
    const operations = store.database
      .prepare(
        'SELECT o.record_json FROM tool_operations o JOIN protocol_segments s ON s.id=o.segment_id WHERE s.assistant_id=? AND s.request_id=?'
      )
      .all(assistantId, id)
      .map((r) => toolOperationSchema.parse(JSON.parse(String(r.record_json))))
    if (operations.some((o) => o.assistantId !== assistantId || o.requestId !== id))
      throw new BackgroundError('PERMISSION_DENIED')
    const current = operations.map((o) => currentBusiness(store, assistantId, o))
    const segments = store.database
      .prepare(
        'SELECT status,messages_json FROM protocol_segments WHERE assistant_id=? AND request_id=? ORDER BY created_at,id'
      )
      .all(assistantId, id)
    const protocols = segments.map((segment) => {
      if (segment.status !== 'closed') throw new BackgroundError('PERMISSION_DENIED')
      const protocol = JSON.parse(String(segment.messages_json)) as {
        role: string
        content: string | null
        tool_calls?: { id: string; function: { name: string; arguments: string } }[]
        tool_call_id?: string
      }[]
      const pending = new Set<string>()
      for (const message of protocol) {
        if (message.tool_calls)
          for (const call of message.tool_calls) {
            if (pending.has(call.id)) throw new BackgroundError('PERMISSION_DENIED')
            pending.add(call.id)
          }
        if (
          message.role === 'tool' &&
          (!message.tool_call_id || !pending.delete(message.tool_call_id))
        )
          throw new BackgroundError('PERMISSION_DENIED')
        if (message.role !== 'tool' && !message.tool_calls && pending.size)
          throw new BackgroundError('PERMISSION_DENIED')
      }
      if (pending.size) throw new BackgroundError('PERMISSION_DENIED')
      return protocol.map((m) => ({
        role: m.role,
        content: m.content,
        tool_calls: m.tool_calls,
        tool_call_id: m.tool_call_id
      }))
    })
    return {
      requestId: id,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
        createdAt: m.created_at
      })),
      protocols,
      businessStateNotice:
        'messages与protocols是历史原文和历史回执快照。业务的当前确认及执行状态只按下面operations/currentRetentionOutcomes；不可从历史PENDING或历史助手措辞推断已执行。',
      operations: current.map((value) => value.operation),
      currentRetentionOutcomes: current
        .filter((value) => value.retentionOutcome)
        .map((value) => ({ operationId: value.operation.operationId, ...value.retentionOutcome! }))
    }
  })
  const body = JSON.stringify(rounds)
  if (body.length > 100000) throw new BackgroundError('PERMISSION_DENIED')
  return { requestIds, body, hash: digest(body) }
}
export function assertRoundSources(
  memory: MemoryService,
  assistantId: string,
  fingerprint: string,
  requestIds: string[]
): MemorySource[] {
  return requestIds.map((id) => {
    const source: MemorySource = { type: 'round', id, assistantId, version: 1 }
    memory.assertSource(source, assistantId, fingerprint)
    memory.assertSource({ ...source, type: 'user-round' }, assistantId, fingerprint)
    memory.assertRound(assistantId, id, fingerprint)
    return source
  })
}
