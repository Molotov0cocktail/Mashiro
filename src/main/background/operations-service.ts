import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { SqliteStore } from '../data/sqlite.js'
import type { TransportUsage } from '../provider/chat-completions-transport.js'
import * as dto from '../../shared/operations-contract.js'
import { operationSources } from './operations-sources.js'

export class OperationsService {
  private revision = 0
  private closed = false
  private listeners = new Set<(event: dto.OperationsChanged) => void>()
  private temporary = new Map<string, dto.UsageAttempt>()
  constructor(
    private readonly store: SqliteStore,
    private readonly clock = () => new Date()
  ) {
    for (const record of this.attempts())
      if (record.state === 'SENDING') {
        this.save({
          ...record,
          state: 'UNKNOWN',
          unknownReason: '上次进程退出前未取得完整用量',
          finishedAt: this.clock().toISOString()
        })
        this.event(
          record.owner,
          record.feature,
          'USAGE_UNKNOWN',
          '上次进程退出前未取得完整用量；不自动重试',
          'WARN',
          true
        )
      }
  }
  onChanged(listener: (event: dto.OperationsChanged) => void) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  private emit(owner: dto.OperationOwner | null) {
    for (const listener of this.listeners) listener({ revision: ++this.revision, owner })
  }
  private save(record: dto.UsageAttempt) {
    dto.usageAttemptSchema.parse(record)
    if (record.persistent)
      this.store.database
        .prepare(
          'INSERT INTO usage_attempts VALUES(?,?) ON CONFLICT(id) DO UPDATE SET record_json=excluded.record_json'
        )
        .run(record.id, JSON.stringify(record))
    else this.temporary.set(record.id, record)
    this.emit(record.owner)
  }
  begin(
    input: Pick<
      dto.UsageAttempt,
      | 'chainId'
      | 'actor'
      | 'assistantId'
      | 'connectionId'
      | 'recipientFingerprint'
      | 'model'
      | 'feature'
      | 'inputCharacters'
      | 'persistent'
      | 'owner'
    >,
    attemptId: string = randomUUID()
  ) {
    if (this.closed) throw Error('OPERATIONS_CLOSED')
    if (this.attempts().some((attempt) => attempt.id === attemptId))
      throw Error('ATTEMPT_ALREADY_DISPATCHED')
    const record: dto.UsageAttempt = {
      ...input,
      id: attemptId,
      startedAt: this.clock().toISOString(),
      finishedAt: null,
      state: 'SENDING',
      actual: null,
      unknownReason: null,
      estimatedTokens: null,
      estimationMethod: null
    }
    this.save(record)
    if (record.persistent)
      this.event(record.owner, record.feature, 'SENDING', '正在调用已授权的实际模型', 'INFO', true)
    return record.id
  }
  settle(id: string, usage: TransportUsage | null, reason?: string) {
    if (this.closed) return
    const record = this.attempts().find((attempt) => attempt.id === id)
    if (!record || record.state !== 'SENDING') return
    const parsed = dto.usageTokensSchema.safeParse(usage)
    const actual = parsed.success ? parsed.data : null
    this.save({
      ...record,
      state: actual ? 'SETTLED' : 'UNKNOWN',
      finishedAt: this.clock().toISOString(),
      actual,
      unknownReason: actual ? null : (reason ?? '端点未返回完整可验证用量')
    })
    if (record.persistent)
      this.event(
        record.owner,
        record.feature,
        actual ? 'COMPLETED' : 'USAGE_UNKNOWN',
        actual ? '调用已结算；记录端点返回的实际用量' : '调用用量未知；不能按零计算',
        actual ? 'INFO' : 'WARN',
        !actual
      )
  }
  attempts(): dto.UsageAttempt[] {
    return [
      ...this.store.database
        .prepare('SELECT record_json FROM usage_attempts ORDER BY rowid')
        .all()
        .map((row) => dto.usageAttemptSchema.parse(JSON.parse(String(row.record_json)))),
      ...this.temporary.values()
    ]
  }
  event(
    owner: dto.OperationOwner,
    feature: dto.UsageFeature | null,
    state: string,
    summary: string,
    severity: dto.OperationRow['severity'],
    current: boolean
  ) {
    if (this.closed) return
    const now = this.clock().toISOString()
    {
      for (const row of this.store.database
        .prepare('SELECT record_json FROM operation_events')
        .all()) {
        const prior = dto.operationRowSchema.parse(JSON.parse(String(row.record_json)))
        if (prior.current && prior.owner.domain === owner.domain && prior.owner.id === owner.id)
          this.store.database
            .prepare('UPDATE operation_events SET record_json=? WHERE id=?')
            .run(JSON.stringify({ ...prior, current: false, recoveredAt: now }), prior.id)
      }
    }
    const record: dto.OperationRow = {
      id: randomUUID(),
      owner,
      feature,
      state,
      severity,
      summary,
      firstAt: now,
      lastAt: now,
      count: 1,
      current,
      recoveredAt: null
    }
    this.store.database
      .prepare('INSERT INTO operation_events VALUES(?,?)')
      .run(record.id, JSON.stringify(record))
    this.emit(owner)
  }
  capture() {
    if (this.closed) return
    const now = this.clock().toISOString()
    for (const record of operationSources(this.store, now)) {
      if (this.store.database.prepare('SELECT 1 FROM operation_events WHERE id=?').get(record.id))
        continue
      this.store.transaction(() => {
        for (const row of this.store.database
          .prepare('SELECT record_json FROM operation_events')
          .all()) {
          const previous = dto.operationRowSchema.parse(JSON.parse(String(row.record_json)))
          if (
            previous.current &&
            previous.owner.domain === record.owner.domain &&
            previous.owner.id === record.owner.id
          )
            this.store.database
              .prepare('UPDATE operation_events SET record_json=? WHERE id=?')
              .run(JSON.stringify({ ...previous, current: false, recoveredAt: now }), previous.id)
        }
        this.store.database
          .prepare('INSERT INTO operation_events VALUES(?,?)')
          .run(record.id, JSON.stringify(dto.operationRowSchema.parse(record)))
      })
      this.emit(record.owner)
    }
  }
  private result<T>(fn: () => T) {
    try {
      return { ok: true as const, data: fn() }
    } catch (error) {
      return {
        ok: false as const,
        error: {
          code:
            error instanceof z.ZodError
              ? ('INVALID_INPUT' as const)
              : ('STORAGE_UNAVAILABLE' as const),
          message: '运行记录读取失败，请刷新核查'
        }
      }
    }
  }
  query(input: unknown) {
    return this.result(() => {
      const value = dto.operationsQueryInputSchema.parse(input)
      this.capture()
      let records = this.store.database
        .prepare('SELECT record_json FROM operation_events ORDER BY rowid DESC')
        .all()
        .map((row) => dto.operationRowSchema.parse(JSON.parse(String(row.record_json))))
        .map((row) =>
          ['SENDING', 'QUEUED', 'RUNNING'].includes(row.state) && row.severity !== 'INFO'
            ? { ...row, severity: 'INFO' as const }
            : row
        )
      if (value.actor) {
        const attempts = this.attempts()
        records = records.filter((row) => {
          const owned = attempts.filter(
            (attempt) =>
              attempt.owner.domain === row.owner.domain && attempt.owner.id === row.owner.id
          )
          const localActor =
            row.feature === 'steward' ? 'steward' : row.owner.assistantId ? 'assistant' : 'system'
          return owned.length
            ? owned.some((attempt) => attempt.actor === value.actor)
            : localActor === value.actor
        })
      }
      if (value.assistantId)
        records = records.filter((row) => row.owner.assistantId === value.assistantId)
      if (value.feature) records = records.filter((row) => row.feature === value.feature)
      if (value.connectionId || value.model) {
        const matching = this.attempts().filter(
          (attempt) =>
            (!value.connectionId || attempt.connectionId === value.connectionId) &&
            (!value.model || attempt.model === value.model)
        )
        records = records.filter((row) =>
          matching.some(
            (attempt) =>
              attempt.owner.domain === row.owner.domain && attempt.owner.id === row.owner.id
          )
        )
      }
      if (value.from) records = records.filter((row) => row.lastAt >= value.from!)
      if (value.to) records = records.filter((row) => row.firstAt <= value.to!)
      if (value.view === 'current') records = records.filter((row) => row.current)
      if (value.view === 'business') records = records.filter((row) => row.state === 'COMPLETED')
      if (value.view === 'failures') {
        const groups = new Map<string, dto.OperationRow>()
        for (const row of records.filter((record) => record.severity !== 'INFO')) {
          const key = JSON.stringify([
            row.owner.domain,
            row.owner.assistantId,
            row.feature,
            row.state,
            row.summary
          ])
          const old = groups.get(key)
          groups.set(
            key,
            old
              ? {
                  ...old,
                  count: old.count + row.count,
                  firstAt: row.firstAt < old.firstAt ? row.firstAt : old.firstAt,
                  current: old.current || row.current
                }
              : row
          )
        }
        records = [...groups.values()]
      }
      return {
        view: value.view,
        rows: records.slice(value.cursor, value.cursor + 50),
        nextCursor: records.length > value.cursor + 50 ? value.cursor + 50 : null
      }
    })
  }
  usage(input: unknown) {
    return this.result(() => {
      const {
        cursor,
        groupsCursor,
        protocolVersion: _protocol,
        ...filters
      } = dto.operationsUsageInputSchema.parse(input)
      void _protocol
      const records = this.attempts()
        .filter(
          (row) =>
            (!filters.actor || row.actor === filters.actor) &&
            (!filters.assistantId || row.assistantId === filters.assistantId) &&
            (!filters.feature || row.feature === filters.feature) &&
            (!filters.connectionId || row.connectionId === filters.connectionId) &&
            (!filters.model || row.model === filters.model) &&
            (!filters.from || row.startedAt >= filters.from) &&
            (!filters.to || row.startedAt <= filters.to)
        )
        .reverse()
      const aggregate = (items: dto.UsageAttempt[]) => {
        const known = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
        let unknownRequests = 0,
          sendingRequests = 0,
          inputCharacters = 0
        for (const record of items) {
          inputCharacters += record.inputCharacters
          if (record.actual) {
            known.promptTokens += record.actual.promptTokens
            known.completionTokens += record.actual.completionTokens
            known.totalTokens += record.actual.totalTokens
          } else if (record.state === 'SENDING') sendingRequests++
          else unknownRequests++
        }
        return {
          calls: items.length,
          known,
          unknownRequests,
          sendingRequests,
          inputCharacters,
          complete: unknownRequests === 0 && sendingRequests === 0
        }
      }
      const grouped = new Map<string, dto.UsageAttempt[]>()
      for (const record of records) {
        const key = JSON.stringify([
          record.actor,
          record.assistantId,
          record.connectionId,
          record.model,
          record.feature
        ])
        grouped.set(key, [...(grouped.get(key) ?? []), record])
      }
      const groups = [...grouped.values()].map((items) => ({
        actor: items[0]!.actor,
        assistantId: items[0]!.assistantId,
        connectionId: items[0]!.connectionId,
        model: items[0]!.model,
        feature: items[0]!.feature,
        ...aggregate(items)
      }))
      return {
        attempts: records.slice(cursor, cursor + 50),
        nextCursor: records.length > cursor + 50 ? cursor + 50 : null,
        groups: groups.slice(groupsCursor, groupsCursor + 50),
        groupsNextCursor: groups.length > groupsCursor + 50 ? groupsCursor + 50 : null,
        filters,
        summary: {
          ...aggregate(records),
          historicalCoverage:
            '此计量模块启用后的实际派发；更早缺失的逐次身份/用量不能恢复，历史预算账本仍在对应功能可查。严格临时仅本次进程内。'
        }
      }
    })
  }
  close() {
    this.closed = true
    this.temporary.clear()
    this.listeners.clear()
  }
}
