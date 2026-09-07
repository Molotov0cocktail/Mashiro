import { z } from 'zod'
import type { SqliteStore } from '../data/sqlite.js'
import { memoryMutationSchema, memoryReceiptSchema } from '../../shared/memory-contract.js'
import type { MemoryRoundChange, MemoryRoundProvided } from '../../shared/memory-round-contract.js'
import { memoryRoundInputSchema } from '../../shared/memory-round-contract.js'

export interface RoundObjectView {
  availability: MemoryRoundProvided['availability']
  record: MemoryRoundProvided['record']
  canInspect: boolean
}
const intentSchema = z.object({ mutation: memoryMutationSchema })
export function queryMemoryRound(
  store: SqliteStore,
  value: z.output<typeof memoryRoundInputSchema>,
  inspect: (id: string, version: number) => RoundObjectView
) {
  const entries: (MemoryRoundProvided | MemoryRoundChange)[] = []
  const unavailable: RoundObjectView = {
    availability: 'unavailable',
    record: null,
    canInspect: false
  }
  const table = value.section === 'provided' ? 'memory_round_evidence' : 'memory_commands'
  const rows = store.database
    .prepare(
      `SELECT rowid AS cursor,* FROM ${table}
    WHERE assistant_id=? AND request_id=? AND rowid>? ORDER BY rowid LIMIT ?`
    )
    .all(value.assistantId, value.requestId, value.cursor ?? 0, value.limit + 1)
  for (const row of rows.slice(0, value.limit)) {
    if (value.section === 'provided') {
      const id = String(row.object_id),
        version = Number(row.object_version)
      entries.push({
        kind: 'provided',
        objectId: id,
        objectVersion: version,
        ...inspect(id, version),
        evidence: row.state as MemoryRoundProvided['evidence'],
        dispatchedAt: row.dispatched_at === null ? null : String(row.dispatched_at)
      })
    } else {
      const intent = intentSchema.parse(JSON.parse(String(row.intent_json)))
      const receipt =
        row.receipt_json === null
          ? null
          : memoryReceiptSchema.parse(JSON.parse(String(row.receipt_json)))
      const objectId = receipt?.objectId ?? intent.mutation.targetId
      const objectVersion = receipt?.objectVersion ?? intent.mutation.expectedVersion
      const state: MemoryRoundChange['state'] =
        row.state === 'SUCCEEDED' && receipt?.state === 'SUCCEEDED'
          ? 'SUCCEEDED'
          : row.state === 'PENDING_CONFIRMATION' && receipt?.state === 'PENDING_CONFIRMATION'
            ? 'PENDING_CONFIRMATION'
            : ['CANCELLED', 'NOT_APPLIED'].includes(String(row.state))
              ? 'NOT_APPLIED'
              : 'RESULT_UNKNOWN'
      const view =
        objectId && objectVersion !== null ? inspect(objectId, objectVersion) : unavailable
      entries.push({
        kind: 'change',
        objectId,
        objectVersion,
        ...view,
        operationId: String(row.id),
        action: intent.mutation.action,
        state,
        createdAt: String(row.created_at),
        confirmationId:
          state === 'PENDING_CONFIRMATION' && view.canInspect
            ? (receipt?.confirmationId ?? null)
            : null,
        summary: {
          SUCCEEDED: '本轮操作已成功提交',
          PENDING_CONFIRMATION: '尚未执行，等待本地确认',
          NOT_APPLIED: '已确认未执行',
          RESULT_UNKNOWN: '执行结果未确认，不代表成功'
        }[state]
      })
    }
  }
  return {
    assistantId: value.assistantId,
    requestId: value.requestId,
    evidenceCoverage: 'recorded-only' as const,
    entries,
    nextCursor: rows.length > value.limit ? Number(rows[value.limit - 1]!.cursor) : null
  }
}
