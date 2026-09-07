import { z } from 'zod'
import { toolCallSchema } from './tool-protocol.js'
import { randomUUID } from 'node:crypto'
import { toolOperationSchema, type ToolOperation } from '../../shared/tool-contract.js'
import type { SqliteStore } from '../data/sqlite.js'
import type { ProtocolMessage, ToolCall } from './tool-protocol.js'
import { TOOL_LIMITS } from './tool-protocol.js'
import {
  GLM_TOOL_ADAPTER,
  protocolInputCharacters,
  type ProviderProfile,
  type ProtocolMode
} from './provider-profile.js'
import { ProviderDomainError } from './provider-repository.js'

export interface ToolSegment {
  id: string
  assistantId: string
  requestId: string
  endpointFingerprint: string
  model: string
  adapterVersion: string
  mode?: ProtocolMode
  messages: ProtocolMessage[]
  createdAt: string
}
/** A temporary ledger has no store reference and cannot touch persistent protocol repositories. */
export class ToolRepository {
  private readonly closedSegments = new Set<string>()
  private readonly segments = new Map<string, ToolSegment>()
  private readonly operations = new Map<
    string,
    { callId: string; arguments: string; record: ToolOperation; result?: string }
  >()
  constructor(private readonly store?: SqliteStore) {}
  private retired(requestId: string): boolean {
    return (
      !!this.store &&
      !!(
        this.store.database
          .prepare("SELECT 1 FROM content_tombstones WHERE kind='round' AND id=?")
          .get(requestId) ||
        this.store.database
          .prepare('SELECT 1 FROM retention_original_trash WHERE request_id=?')
          .get(requestId)
      )
    )
  }
  recover(): void {
    if (!this.store) return
    this.store.transaction(() => {
      const rows = this.store!.database.prepare(
        'SELECT id,record_json FROM tool_operations'
      ).all() as unknown as { id: string; record_json: string }[]
      for (const row of rows) {
        const op = toolOperationSchema.parse(JSON.parse(row.record_json))
        if (op.state === 'PREPARED' || op.state === 'DISPATCHING') {
          op.state = op.state === 'PREPARED' ? 'CONFIRMED_NOT_APPLIED' : 'RESULT_UNKNOWN'
          op.summary =
            op.state === 'RESULT_UNKNOWN'
              ? '上次读取在派发后中断，结果待核查；不会自动重做'
              : '上次准备后中断，尚未派发'
          op.updatedAt = new Date().toISOString()
          this.store!.database.prepare('UPDATE tool_operations SET record_json=? WHERE id=?').run(
            JSON.stringify(op),
            row.id
          )
        }
      }
      this.store!.database.prepare(
        "UPDATE protocol_segments SET status='interrupted' WHERE status='active'"
      ).run()
    })
  }
  create(segment: ToolSegment): void {
    if (this.retired(segment.requestId)) throw new ProviderDomainError('PERMISSION_DENIED')
    this.checkMessages(segment.messages)
    if (this.store)
      this.store.database
        .prepare(
          "INSERT INTO protocol_segments(id,assistant_id,request_id,endpoint_fingerprint,model,adapter_version,status,messages_json,created_at,mode) VALUES(?,?,?,?,?,?,'active',?,?,?)"
        )
        .run(
          segment.id,
          segment.assistantId,
          segment.requestId,
          segment.endpointFingerprint,
          segment.model,
          segment.adapterVersion,
          JSON.stringify(segment.messages),
          segment.createdAt,
          segment.mode ?? 'standard-non-preserved'
        )
    else {
      if (this.segments.has(segment.id)) throw new ProviderDomainError('PROTOCOL')
      if (this.segments.size >= 64) throw new ProviderDomainError('LIMIT')
      this.segments.set(segment.id, structuredClone(segment))
    }
  }
  private checkMessages(messages: ProtocolMessage[]): void {
    if (Buffer.byteLength(JSON.stringify(messages), 'utf8') > TOOL_LIMITS.chainBytes)
      throw new ProviderDomainError('LIMIT')
  }
  messages(segmentId: string, messages: ProtocolMessage[], closed = false): void {
    this.checkMessages(messages)
    if (this.store)
      this.store.database
        .prepare('UPDATE protocol_segments SET messages_json=?,status=? WHERE id=?')
        .run(JSON.stringify(messages), closed ? 'closed' : 'active', segmentId)
    else {
      const s = this.segments.get(segmentId)
      if (s) s.messages = structuredClone(messages)
      if (closed) this.closedSegments.add(segmentId)
    }
  }
  close(segmentId: string): void {
    if (this.store)
      this.store.database
        .prepare("UPDATE protocol_segments SET status='interrupted' WHERE id=? AND status='active'")
        .run(segmentId)
  }
  prepare(
    segment: ToolSegment,
    modelRequestId: string,
    call: ToolCall,
    origin?: ToolOperation['origin']
  ): ToolOperation {
    const existing = this.find(segment.id, modelRequestId, call.id)
    if (existing) {
      if (
        existing.arguments !== call.function.arguments ||
        existing.record.toolName !== call.function.name
      )
        throw new ProviderDomainError('PROTOCOL')
      return existing.record
    }
    if (!this.store && this.operations.size >= 768) throw new ProviderDomainError('LIMIT')
    const now = new Date().toISOString()
    const record: ToolOperation = {
      operationId: randomUUID(),
      segmentId: segment.id,
      modelRequestId,
      requestId: segment.requestId,
      assistantId: segment.assistantId,
      toolName: call.function.name,
      ...(origin ? { origin } : {}),
      state: 'PREPARED',
      createdAt: now,
      updatedAt: now,
      summary: '准备读取',
      citations: []
    }
    if (this.store)
      this.store.database
        .prepare(
          'INSERT INTO tool_operations(id,segment_id,model_request_id,tool_call_id,arguments_json,record_json) VALUES(?,?,?,?,?,?)'
        )
        .run(
          record.operationId,
          segment.id,
          modelRequestId,
          call.id,
          call.function.arguments,
          JSON.stringify(record)
        )
    else
      this.operations.set(record.operationId, {
        callId: call.id,
        arguments: call.function.arguments,
        record: structuredClone(record)
      })
    return record
  }
  private find(
    segmentId: string,
    modelRequestId: string,
    callId: string
  ): { arguments: string; record: ToolOperation } | undefined {
    if (this.store) {
      const row = this.store.database
        .prepare(
          'SELECT arguments_json,record_json FROM tool_operations WHERE segment_id=? AND model_request_id=? AND tool_call_id=?'
        )
        .get(segmentId, modelRequestId, callId) as
        { arguments_json: string; record_json: string } | undefined
      return row
        ? {
            arguments: row.arguments_json,
            record: toolOperationSchema.parse(JSON.parse(row.record_json))
          }
        : undefined
    }
    return [...this.operations.values()].find(
      (o) =>
        o.record.segmentId === segmentId &&
        o.record.modelRequestId === modelRequestId &&
        o.callId === callId
    )
  }
  update(record: ToolOperation, result?: string, participating = false): void {
    toolOperationSchema.parse(record)
    const current = this.read(record.assistantId, record.requestId).find(
      (o) => o.operationId === record.operationId
    )
    if (!current) throw new ProviderDomainError('NOT_FOUND')
    const permitted: Record<ToolOperation['state'], ToolOperation['state'][]> = {
      PREPARED: [
        'DISPATCHING',
        'CANCELLED_BEFORE_DISPATCH',
        'BLOCKED_BY_CURRENT_STATE',
        'CONFIRMED_NOT_APPLIED'
      ],
      DISPATCHING: ['SUCCEEDED', 'CONFIRMED_NOT_APPLIED', 'RESULT_UNKNOWN'],
      SUCCEEDED: [],
      CONFIRMED_NOT_APPLIED: [],
      RESULT_UNKNOWN: [],
      CANCELLED_BEFORE_DISPATCH: [],
      BLOCKED_BY_CURRENT_STATE: []
    }
    if (record.state !== current.state && !permitted[current.state].includes(record.state))
      throw new ProviderDomainError('PROTOCOL')
    if (
      record.state === current.state &&
      JSON.stringify({ ...record, citations: [] }) !== JSON.stringify({ ...current, citations: [] })
    )
      throw new ProviderDomainError('PROTOCOL')
    if (result !== undefined && Buffer.byteLength(result) > 32768)
      throw new ProviderDomainError('LIMIT')
    const persisted = { ...record, citations: record.citations.map((c) => ({ ...c, excerpt: '' })) }
    if (this.store) {
      const commit = () => {
        this.store!.database.prepare('UPDATE tool_operations SET record_json=? WHERE id=?').run(
          JSON.stringify(persisted),
          record.operationId
        )
        if (result !== undefined)
          this.store!.database.prepare(
            'INSERT INTO protocol_results VALUES(?,?) ON CONFLICT(operation_id) DO UPDATE SET result_json=excluded.result_json'
          ).run(record.operationId, result)
      }
      if (participating) commit()
      else this.store.transaction(commit)
    } else {
      const op = this.operations.get(record.operationId)
      if (op) {
        op.record = structuredClone(record)
        if (result !== undefined) op.result = result
      }
    }
  }
  result(operationId: string): string | undefined {
    return this.store
      ? (
          this.store.database
            .prepare('SELECT result_json FROM protocol_results WHERE operation_id=?')
            .get(operationId) as { result_json: string } | undefined
        )?.result_json
      : this.operations.get(operationId)?.result
  }
  read(assistantId: string, requestId?: string, includeHistory = false): ToolOperation[] {
    const records = this.store
      ? (
          this.store.database
            .prepare(
              "SELECT o.record_json FROM tool_operations o JOIN protocol_segments s ON s.id=o.segment_id WHERE s.assistant_id=? AND s.request_id NOT IN(SELECT id FROM content_tombstones WHERE kind='round') AND s.request_id NOT IN(SELECT request_id FROM retention_original_trash) AND (? IS NULL OR s.request_id=?) ORDER BY o.rowid DESC LIMIT 384"
            )
            .all(assistantId, requestId ?? null, requestId ?? null) as unknown as {
            record_json: string
          }[]
        )
          .reverse()
          .map((r) => toolOperationSchema.parse(JSON.parse(r.record_json)))
      : [...this.operations.values()]
          .filter(
            (o) =>
              o.record.assistantId === assistantId &&
              (!requestId || o.record.requestId === requestId)
          )
          .map((o) => structuredClone(o.record))
    return records.map((op) => {
      if (!includeHistory) return { ...op, citations: [] }
      const result = this.result(op.operationId)
      if (op.toolName === 'search_conversation_history' && result) {
        const body = JSON.parse(result) as { matches?: ToolOperation['citations'] }
        if (body.matches) op.citations = body.matches
      }
      return toolOperationSchema.parse(op)
    })
  }
  expandContext(
    assistantId: string,
    previous: ProtocolMessage[],
    requestIds: string[],
    endpointFingerprint: string,
    model: string,
    profile?: ProviderProfile,
    tools = true
  ): ProtocolMessage[] {
    if (previous.length !== requestIds.length * 2) throw new ProviderDomainError('PROTOCOL')
    const schema = z
      .array(
        z.strictObject({
          role: z.enum(['user', 'assistant', 'system', 'tool']),
          content: z.string().max(120000),
          reasoning_content: z.string().max(120000).optional(),
          tool_calls: z.array(toolCallSchema).max(4).optional(),
          tool_call_id: z.string().min(1).max(200).optional()
        })
      )
      .max(256)
    const expanded: ProtocolMessage[] = []
    for (const [index, requestId] of requestIds.entries()) {
      if (this.retired(requestId)) throw new ProviderDomainError('PERMISSION_DENIED')
      let segment: ToolSegment | undefined,
        closed = false
      if (this.store) {
        const row = this.store.database
          .prepare(
            'SELECT id,endpoint_fingerprint,model,adapter_version,mode,status,messages_json,created_at FROM protocol_segments WHERE assistant_id=? AND request_id=?'
          )
          .get(assistantId, requestId) as
          | {
              id: string
              endpoint_fingerprint: string
              model: string
              adapter_version: string
              mode: ProtocolMode
              status: string
              messages_json: string
              created_at: string
            }
          | undefined
        if (row) {
          segment = {
            id: row.id,
            assistantId,
            requestId,
            endpointFingerprint: row.endpoint_fingerprint,
            model: row.model,
            adapterVersion: row.adapter_version,
            mode: row.mode,
            messages: schema.parse(JSON.parse(row.messages_json)),
            createdAt: row.created_at
          }
          closed = row.status === 'closed'
        }
      } else {
        segment = [...this.segments.values()].find(
          (s) => s.assistantId === assistantId && s.requestId === requestId
        )
        closed = !!segment && this.closedSegments.has(segment.id)
      }
      if (!segment) {
        if (profile?.retained && tools) throw new ProviderDomainError('CONFIGURATION')
        expanded.push(previous[index * 2]!, previous[index * 2 + 1]!)
        continue
      }
      if (
        !closed ||
        segment.endpointFingerprint !== endpointFingerprint ||
        segment.model.toLowerCase() !== model.toLowerCase() ||
        segment.adapterVersion !== (profile?.adapterVersion ?? GLM_TOOL_ADAPTER) ||
        (segment.mode ?? 'standard-non-preserved') !== (profile?.mode ?? 'standard-non-preserved')
      )
        throw new ProviderDomainError('CONFIGURATION')
      const start = segment.messages.findLastIndex((m) => m.role === 'user')
      if (start < 0) throw new ProviderDomainError('PROTOCOL')
      // Only this selected turn is replayed; prior context inside its segment is never imported.
      const turn = segment.messages.slice(start)
      if (
        turn[0]!.content !== previous[index * 2]!.content ||
        turn
          .filter((message) => message.role === 'assistant')
          .map((message) => message.content)
          .join('') !== previous[index * 2 + 1]!.content
      )
        throw new ProviderDomainError('PROTOCOL')
      if (profile?.retained) {
        const pending = new Set<string>()
        let finished = false
        for (const message of turn.slice(1)) {
          if (finished) throw new ProviderDomainError('PROTOCOL')
          if (message.role === 'assistant') {
            if (pending.size) throw new ProviderDomainError('PROTOCOL')
            for (const call of message.tool_calls ?? []) {
              if (pending.has(call.id)) throw new ProviderDomainError('PROTOCOL')
              pending.add(call.id)
            }
            finished = pending.size === 0
          } else if (message.role === 'tool') {
            if (!message.tool_call_id || !pending.delete(message.tool_call_id))
              throw new ProviderDomainError('PROTOCOL')
          } else if (message.role !== 'system' || pending.size) {
            throw new ProviderDomainError('PROTOCOL')
          }
        }
        if (!finished || pending.size) throw new ProviderDomainError('PROTOCOL')
      }
      for (const message of turn) {
        const copy = { ...message }
        if (profile?.retained && tools) {
          if (copy.role === 'assistant' && typeof copy.reasoning_content !== 'string')
            throw new ProviderDomainError('PROTOCOL')
        } else delete copy.reasoning_content
        expanded.push(copy)
      }
    }
    this.checkMessages(expanded)
    if (protocolInputCharacters(expanded) > 120000) throw new ProviderDomainError('LIMIT')
    return expanded
  }
  inheritSources(assistantId: string, requestId: string, selected?: string[]): void {
    if (!this.store) return
    const filter = selected
      ? ' AND request_id IN (' + selected.map(() => '?').join(',') + ')'
      : " AND request_id IN (SELECT u.request_id FROM timeline_messages u JOIN timeline_messages a ON a.assistant_id=u.assistant_id AND a.request_id=u.request_id AND a.role='assistant' WHERE u.assistant_id=? AND u.role='user' AND u.status='completed' AND a.status='completed' ORDER BY a.sequence DESC LIMIT 16)"
    const rows = this.store.database
      .prepare(
        'SELECT DISTINCT source_request_id FROM timeline_sources WHERE assistant_id=?' + filter
      )
      .all(assistantId, ...(selected ?? [assistantId])) as unknown as {
      source_request_id: string
    }[]
    this.addSources(
      assistantId,
      requestId,
      rows.map((r) => r.source_request_id)
    )
  }
  addSources(assistantId: string, requestId: string, sourceIds: string[]): void {
    if (!this.store) return
    this.store.transaction(() => {
      const statement = this.store!.database.prepare(
        'INSERT OR IGNORE INTO timeline_sources VALUES(?,?,?)'
      )
      for (const id of sourceIds) statement.run(assistantId, requestId, id)
    })
  }
  assertSelectedSources(assistantId: string, requestIds: string[]): void {
    if (!this.store) return
    for (const id of requestIds) {
      const rows = this.store.database
        .prepare(
          'SELECT source_request_id FROM timeline_sources WHERE assistant_id=? AND request_id=?'
        )
        .all(assistantId, id) as unknown as { source_request_id: string }[]
      if (rows.some((r) => !requestIds.includes(r.source_request_id)))
        throw new ProviderDomainError('PERMISSION_DENIED')
    }
  }
  clear(assistantId: string): void {
    if (this.store) throw new Error('Persistent clear is forbidden')
    for (const [id, segment] of this.segments)
      if (segment.assistantId === assistantId) {
        this.segments.delete(id)
        this.closedSegments.delete(id)
      }
    for (const [id, op] of this.operations)
      if (op.record.assistantId === assistantId) this.operations.delete(id)
  }
}
