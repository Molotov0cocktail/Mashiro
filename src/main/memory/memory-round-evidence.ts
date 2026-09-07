import { z } from 'zod'
import type { SqliteStore } from '../data/sqlite.js'
import type { ProtocolMessage } from '../provider/tool-protocol.js'
import { memoryRecordSchema, type MemorySource } from '../../shared/memory-contract.js'

const resultSchema = z.strictObject({ records: z.array(memoryRecordSchema).max(10) })
/** Only structured search results in the actual transport payload count, never prose or dependencies. */
export function dispatchedMemorySources(messages: ProtocolMessage[]): MemorySource[] {
  const calls = new Map<string, string>()
  const found = new Map<string, MemorySource>()
  for (const message of messages) {
    if (message.role === 'assistant')
      for (const call of message.tool_calls ?? []) calls.set(call.id, call.function.name)
    if (message.role !== 'tool' || calls.get(message.tool_call_id ?? '') !== 'search_memory')
      continue
    let parsed: z.infer<typeof resultSchema>
    try {
      parsed = resultSchema.parse(JSON.parse(message.content))
    } catch {
      continue
    }
    for (const record of parsed.records) {
      const source: MemorySource = {
        type: 'memory',
        id: record.id,
        version: record.objectVersion,
        assistantId: record.ownerAssistantId
      }
      found.set(record.id + ':' + record.objectVersion, source)
    }
  }
  return [...found.values()]
}

/** Contains identifiers only. Pending state never claims a transport call or Provider response. */
export function recordMemoryEvidence(
  store: SqliteStore,
  assistantId: string,
  requestId: string,
  sources: MemorySource[],
  state: 'PREPARED' | 'DISPATCH_STARTED' | 'RESPONSE_OBSERVED'
): void {
  if (!sources.length) return
  const owners = store.database
    .prepare('SELECT DISTINCT assistant_id FROM timeline_messages WHERE request_id=?')
    .all(requestId)
  if (owners.length !== 1 || owners[0]!.assistant_id !== assistantId)
    throw Error('MEMORY_ROUND_OWNER')
  const now = new Date().toISOString()
  store.transaction(() => {
    for (const source of sources) {
      if (source.type !== 'memory') continue
      store.database
        .prepare(
          `INSERT INTO memory_round_evidence VALUES(?,?,?,?,?,?,?,?)
        ON CONFLICT(assistant_id,request_id,object_id,object_version) DO UPDATE SET
        state=CASE WHEN memory_round_evidence.state='RESPONSE_OBSERVED' THEN memory_round_evidence.state
          WHEN excluded.state='PREPARED' THEN memory_round_evidence.state ELSE excluded.state END,
        dispatched_at=COALESCE(memory_round_evidence.dispatched_at,excluded.dispatched_at)`
        )
        .run(
          assistantId,
          requestId,
          source.id,
          source.version,
          source.assistantId,
          state,
          now,
          state === 'PREPARED' ? null : now
        )
    }
  })
}
