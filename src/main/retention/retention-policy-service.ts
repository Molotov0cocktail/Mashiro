import { createHash, randomUUID } from 'node:crypto'
import type { SqliteStore } from '../data/sqlite.js'
import { memoryRecordSchema, type MemoryRecord } from '../../shared/memory-contract.js'
import type {
  RetentionChanged,
  RetentionPolicyPreview,
  RetentionPolicySettings,
  RetentionPolicySnapshot
} from '../../shared/retention-contract.js'
import {
  MemoryError,
  type MemoryRetentionPolicyGuard,
  type MemoryService
} from '../memory/memory-service.js'

type PolicyCode = 'INVALID_INPUT' | 'STALE_PREVIEW' | 'CONFLICT' | 'STORAGE_UNAVAILABLE'

export class RetentionPolicyError extends Error {
  constructor(readonly code: PolicyCode) {
    super(code)
  }
}

interface PolicyRow {
  revision: number
  capacity_enabled: number
  capacity_bytes: number
  staging_enabled: number
  staging_days: number
  activated_at: string
  updated_at: string
  restored_paused: number
  scheduler_generation: number
}
interface PolicyObjectRow {
  object_id: string
  object_version: number
  zone: MemoryRecord['retention']
  accepted_bytes: number | null
  measurement_state: 'KNOWN' | 'UNKNOWN' | 'EXCLUDED'
  body_hash: string | null
  file_name: string | null
  file_identity: string | null
  governance_generation: number
  staging_entered_at: string | null
  staging_generation: number
}

const digest = (value: string): string => createHash('sha256').update(value).digest('hex')
const dayMilliseconds = 86_400_000
const batchSize = 20
const retryDelayMilliseconds = dayMilliseconds
const yieldTurn = () => new Promise<void>((resolve) => setImmediate(resolve))

/** Capacity accounting and staging expiry never receive renderer filesystem authority. */
export class RetentionPolicyService implements MemoryRetentionPolicyGuard {
  private stopped = false
  private running = false
  private timer: ReturnType<typeof setTimeout> | undefined
  private auditTimer: ReturnType<typeof setTimeout> | undefined
  private auditGeneration = 0
  private auditing = false
  private auditScheduled = false
  private stopWatching: () => void = () => undefined
  private audit: RetentionPolicySnapshot['audit'] = {
    state: 'PENDING',
    checkedObjects: 0,
    totalObjects: 0,
    startedAt: null,
    completedAt: null
  }
  private schedulerFailure: Exclude<RetentionPolicySnapshot['recentRun'], null> | null = null

  constructor(
    private readonly store: SqliteStore,
    private readonly memory: MemoryService,
    private readonly emit: (event: RetentionChanged) => void,
    private readonly clock: () => Date = () => new Date()
  ) {
    this.recoverInterruptedRuns()
    this.invalidateAudit()
    this.stopWatching = this.memory.watchRetentionFiles((fileName) => this.observeFile(fileName))
    this.schedule()
  }

  close(): void {
    this.stopped = true
    this.auditGeneration++
    this.stopWatching()
    if (this.timer) clearTimeout(this.timer)
    if (this.auditTimer) clearTimeout(this.auditTimer)
    this.timer = undefined
    this.auditTimer = undefined
  }

  get revision(): number {
    return this.policy().revision
  }

  private recoverInterruptedRuns(): void {
    const now = this.clock().toISOString()
    for (const run of this.store.database
      .prepare("SELECT id FROM retention_policy_runs WHERE state='RUNNING'")
      .all() as { id: string }[]) {
      const counts = this.store.database
        .prepare(
          `SELECT
             sum(CASE state WHEN 'MOVED' THEN 1 ELSE 0 END) AS moved,
             sum(CASE state WHEN 'SKIPPED' THEN 1 ELSE 0 END) AS skipped,
             sum(CASE state WHEN 'FAILED' THEN 1 ELSE 0 END) AS failed
           FROM retention_policy_receipts WHERE run_id=?`
        )
        .get(run.id)!
      this.store.database
        .prepare(
          "UPDATE retention_policy_runs SET state='FAILED',completed_at=?,moved=?,skipped=?,failed=?,error=? WHERE id=? AND state='RUNNING'"
        )
        .run(
          now,
          Number(counts.moved ?? 0),
          Number(counts.skipped ?? 0),
          Number(counts.failed ?? 0),
          '上次策略核查被进程退出或中断；已按逐项回执收敛，未确认对象仍保留原分区',
          run.id
        )
    }
  }

  private policy(): PolicyRow {
    return this.store.database
      .prepare('SELECT * FROM retention_policy WHERE singleton=1')
      .get() as unknown as PolicyRow | never
  }

  private settings(row = this.policy()): RetentionPolicySettings {
    return {
      persistentCapacity: {
        enabled: row.capacity_enabled === 1,
        limitBytes: Number(row.capacity_bytes)
      },
      stagingExpiry: {
        enabled: row.staging_enabled === 1,
        days: Number(row.staging_days)
      }
    }
  }

  private object(id: string): PolicyObjectRow | undefined {
    return this.store.database
      .prepare('SELECT * FROM retention_policy_objects WHERE object_id=?')
      .get(id) as PolicyObjectRow | undefined
  }

  private governanceGeneration(): number {
    return Number(
      this.store.database.prepare('SELECT generation FROM retention_state WHERE singleton=1').get()!
        .generation
    )
  }

  private stateFor(
    record: MemoryRecord,
    measurement: ReturnType<MemoryService['retentionMeasurement']>,
    governanceGeneration: number
  ): PolicyObjectRow {
    const prior = this.object(record.id)
    let stagingEnteredAt = prior?.staging_entered_at ?? null
    let stagingGeneration = prior?.staging_generation ?? 0
    if (record.retention === 'staging') {
      if (!stagingEnteredAt) {
        stagingEnteredAt = this.policy().activated_at
        stagingGeneration += 1
      }
    } else stagingEnteredAt = null
    return {
      object_id: record.id,
      object_version: record.objectVersion,
      zone: record.retention,
      accepted_bytes:
        measurement.state === 'UNKNOWN' ? (prior?.accepted_bytes ?? null) : measurement.bytes,
      measurement_state: measurement.state,
      body_hash: measurement.bodyHash ?? prior?.body_hash ?? null,
      file_name: measurement.fileName ?? prior?.file_name ?? null,
      file_identity: measurement.fileIdentity,
      governance_generation: governanceGeneration,
      staging_entered_at: stagingEnteredAt,
      staging_generation: stagingGeneration
    }
  }

  private saveObject(row: PolicyObjectRow): void {
    this.store.database
      .prepare(
        `INSERT INTO retention_policy_objects VALUES(?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(object_id) DO UPDATE SET object_version=excluded.object_version,zone=excluded.zone,
         accepted_bytes=excluded.accepted_bytes,measurement_state=excluded.measurement_state,
         body_hash=excluded.body_hash,file_name=excluded.file_name,file_identity=excluded.file_identity,
         governance_generation=excluded.governance_generation,
         staging_entered_at=excluded.staging_entered_at,
         staging_generation=excluded.staging_generation`
      )
      .run(
        row.object_id,
        row.object_version,
        row.zone,
        row.accepted_bytes,
        row.measurement_state,
        row.body_hash,
        row.file_name,
        row.file_identity,
        row.governance_generation,
        row.staging_entered_at,
        row.staging_generation
      )
  }

  private queueAudit(): void {
    if (this.stopped || this.auditScheduled) return
    this.auditScheduled = true
    setImmediate(() => {
      this.auditScheduled = false
      void this.runAudit()
    })
  }

  invalidateAudit(fileName: string | null = null): void {
    if (this.stopped) return
    this.store.database
      .prepare(
        'DELETE FROM retention_policy_objects WHERE NOT EXISTS(SELECT 1 FROM memory_objects WHERE id=object_id)'
      )
      .run()
    const update = fileName
      ? this.store.database
          .prepare(
            "UPDATE retention_policy_objects SET measurement_state='UNKNOWN' WHERE zone='persistent' AND file_name=?"
          )
          .run(fileName)
      : this.store.database
          .prepare(
            "UPDATE retention_policy_objects SET measurement_state='UNKNOWN' WHERE zone='persistent'"
          )
          .run()
    if (fileName && update.changes === 0) return
    this.auditGeneration++
    const total = Number(
      this.store.database.prepare('SELECT count(*) AS total FROM memory_objects').get()!.total
    )
    this.audit = {
      state: total ? 'PENDING' : 'COMPLETE',
      checkedObjects: 0,
      totalObjects: total,
      startedAt: null,
      completedAt: total ? this.audit.completedAt : this.clock().toISOString()
    }
    if (total) this.queueAudit()
  }

  private observeFile(fileName: string | null): void {
    if (this.stopped) return
    if (!fileName) {
      this.invalidateAudit()
      return
    }
    const rows = this.store.database
      .prepare(
        `SELECT file_identity FROM retention_policy_objects
         WHERE zone='persistent' AND measurement_state='KNOWN' AND file_name=?`
      )
      .all(fileName) as { file_identity: string }[]
    if (!rows.length) return
    const identity = this.memory.retentionIdentityForFile(fileName)
    for (const row of rows) {
      if (!identity || identity !== row.file_identity) {
        this.invalidateAudit(fileName)
        return
      }
    }
  }

  private async runAudit(): Promise<void> {
    if (this.stopped || this.auditing || this.audit.state === 'COMPLETE') return
    this.auditing = true
    const generation = this.auditGeneration
    const governanceGeneration = this.governanceGeneration()
    this.audit = {
      ...this.audit,
      state: 'RUNNING',
      checkedObjects: 0,
      startedAt: this.clock().toISOString()
    }
    try {
      let cursor = ''
      for (;;) {
        const rows = this.store.database
          .prepare(
            'SELECT id,version,record_json FROM memory_objects WHERE id>? ORDER BY id LIMIT ?'
          )
          .all(cursor, batchSize) as { id: string; version: number; record_json: string }[]
        if (!rows.length) break
        const measured = rows.map((row) => {
          if (this.stopped || generation !== this.auditGeneration) return null
          const record = memoryRecordSchema.parse(JSON.parse(row.record_json))
          return { row, record, measurement: this.memory.retentionMeasurement(record) }
        })
        if (
          this.stopped ||
          generation !== this.auditGeneration ||
          measured.some((item) => item === null)
        )
          return
        let governanceStale = false
        this.store.transaction(() => {
          if (generation !== this.auditGeneration) return
          if (this.governanceGeneration() !== governanceGeneration) {
            governanceStale = true
            return
          }
          const currentStatement = this.store.database.prepare(
            'SELECT version,record_json FROM memory_objects WHERE id=?'
          )
          for (const item of measured) {
            if (!item) return
            const current = currentStatement.get(item.row.id) as
              { version: number; record_json: string } | undefined
            if (
              !current ||
              current.version !== item.row.version ||
              current.record_json !== item.row.record_json
            )
              continue
            this.saveObject(this.stateFor(item.record, item.measurement, governanceGeneration))
          }
        })
        if (this.stopped || generation !== this.auditGeneration) return
        if (governanceStale) {
          this.invalidateAudit()
          return
        }
        this.audit = { ...this.audit, checkedObjects: this.audit.checkedObjects + rows.length }
        cursor = rows.at(-1)!.id
        await yieldTurn()
      }
      if (this.stopped || generation !== this.auditGeneration) return
      this.store.transaction(() => {
        if (generation !== this.auditGeneration) return
        this.store.database
          .prepare(
            'DELETE FROM retention_policy_objects WHERE NOT EXISTS(SELECT 1 FROM memory_objects WHERE id=object_id)'
          )
          .run()
      })
      if (generation !== this.auditGeneration) return
      this.audit = {
        ...this.audit,
        state: 'COMPLETE',
        completedAt: this.clock().toISOString()
      }
      try {
        this.emitPolicy([], 'policy-status')
      } catch {
        // Public reads remain the trusted storage availability boundary.
      }
      if (this.auditTimer) clearTimeout(this.auditTimer)
      this.auditTimer = setTimeout(() => {
        this.auditTimer = undefined
        this.invalidateAudit()
      }, retryDelayMilliseconds)
      this.auditTimer.unref?.()
    } catch {
      if (!this.stopped && generation === this.auditGeneration) {
        this.audit = { ...this.audit, state: 'PENDING' }
        if (this.auditTimer) clearTimeout(this.auditTimer)
        this.auditTimer = setTimeout(() => {
          this.auditTimer = undefined
          this.queueAudit()
        }, retryDelayMilliseconds)
        this.auditTimer.unref?.()
      }
    } finally {
      this.auditing = false
      if (!this.stopped && generation !== this.auditGeneration) this.queueAudit()
    }
  }

  private contribution(record: MemoryRecord | undefined): {
    eligible: boolean
    state: 'KNOWN' | 'UNKNOWN' | 'EXCLUDED'
    bytes: number
  } {
    if (!record || record.retention !== 'persistent' || record.state !== 'active')
      return { eligible: false, state: 'EXCLUDED', bytes: 0 }
    const row = this.object(record.id)
    if (
      !row ||
      row.object_version !== record.objectVersion ||
      row.zone !== 'persistent' ||
      row.measurement_state !== 'KNOWN' ||
      row.accepted_bytes === null
    )
      return { eligible: true, state: 'UNKNOWN', bytes: 0 }
    return { eligible: true, state: 'KNOWN', bytes: Number(row.accepted_bytes) }
  }

  private verifyKnownIdentities(excludedId?: string): void {
    const governanceGeneration = this.governanceGeneration()
    const rows = this.store.database
      .prepare(
        `SELECT object_id,file_name,file_identity,governance_generation
         FROM retention_policy_objects
         WHERE zone='persistent' AND measurement_state='KNOWN' AND object_id<>?`
      )
      .all(excludedId ?? '') as {
      object_id: string
      file_name: string | null
      file_identity: string | null
      governance_generation: number
    }[]
    for (const row of rows) {
      const identity = row.file_name ? this.memory.retentionIdentityForFile(row.file_name) : null
      if (
        row.governance_generation !== governanceGeneration ||
        !identity ||
        identity !== row.file_identity
      ) {
        this.invalidateAudit(row.file_name)
        throw new MemoryError('MEASUREMENT_UNKNOWN')
      }
    }
  }

  assertTransition(
    previous: MemoryRecord | undefined,
    next: MemoryRecord,
    bodyBytes: number
  ): void {
    const config = this.policy()
    if (!config.capacity_enabled) return
    const oldValue = this.contribution(previous)
    const nextEligible = next.retention === 'persistent' && next.state === 'active'
    if (!nextEligible) return
    if (oldValue.state === 'KNOWN' && bodyBytes <= oldValue.bytes) return
    if (oldValue.state === 'UNKNOWN' || this.audit.state !== 'COMPLETE')
      throw new MemoryError('MEASUREMENT_UNKNOWN')
    this.verifyKnownIdentities(previous?.id)
    const aggregate = this.store.database
      .prepare(
        `SELECT coalesce(sum(accepted_bytes),0) AS used,
                sum(CASE measurement_state WHEN 'UNKNOWN' THEN 1 ELSE 0 END) AS unknown
         FROM retention_policy_objects WHERE zone='persistent' AND object_id<>?`
      )
      .get(previous?.id ?? '')!
    const used = Number(aggregate.used)
    if (Number(aggregate.unknown) || !Number.isSafeInteger(used))
      throw new MemoryError('MEASUREMENT_UNKNOWN')
    if (used + bodyBytes > config.capacity_bytes) throw new MemoryError('CAPACITY_EXCEEDED')
  }

  recordTransition(
    previous: MemoryRecord | undefined,
    next: MemoryRecord,
    bodyBytes: number,
    bodyHash: string
  ): void {
    const prior = previous ? this.object(previous.id) : undefined
    let stagingEnteredAt: string | null = null
    let stagingGeneration = prior?.staging_generation ?? 0
    if (next.retention === 'staging') {
      if (previous?.retention === 'staging' && prior?.staging_entered_at) {
        stagingEnteredAt = prior.staging_entered_at
      } else {
        stagingEnteredAt = this.clock().toISOString()
        stagingGeneration += 1
      }
    }
    const measurement = this.memory.retentionMeasurement(next)
    this.saveObject({
      object_id: next.id,
      object_version: next.objectVersion,
      zone: next.retention,
      accepted_bytes: measurement.state === 'KNOWN' ? bodyBytes : measurement.bytes,
      measurement_state: measurement.state,
      body_hash: measurement.state === 'KNOWN' ? bodyHash : measurement.bodyHash,
      file_name: measurement.fileName,
      file_identity: measurement.fileIdentity,
      governance_generation: this.governanceGeneration(),
      staging_entered_at: stagingEnteredAt,
      staging_generation: stagingGeneration
    })
    this.rescheduleSoon()
  }

  private usage(): RetentionPolicySnapshot['usage'] {
    const aggregate = this.store.database
      .prepare(
        `SELECT coalesce(sum(accepted_bytes),0) AS accepted,
                sum(CASE measurement_state WHEN 'UNKNOWN' THEN 1 ELSE 0 END) AS unknown,
                count(*) AS total
         FROM retention_policy_objects WHERE zone='persistent'`
      )
      .get()!
    let unknownObjects = Number(aggregate.unknown)
    if (this.audit.state !== 'COMPLETE' && Number(aggregate.total))
      unknownObjects = Math.max(1, unknownObjects)
    const acceptedBytes = Number(aggregate.accepted)
    const config = this.policy()
    return {
      acceptedBytes,
      measurement: unknownObjects ? 'UNKNOWN' : 'COMPLETE',
      unknownObjects,
      overLimit: config.capacity_enabled === 1 && acceptedBytes > config.capacity_bytes
    }
  }

  private dueAt(enteredAt: string, days: number): string {
    return new Date(Date.parse(enteredAt) + days * dayMilliseconds).toISOString()
  }

  private staging(row = this.policy()): RetentionPolicySnapshot['staging'] {
    const objects = this.store.database
      .prepare(
        `SELECT p.staging_entered_at,p.object_version,p.staging_generation,r.state,r.occurred_at
         FROM retention_policy_objects p
         LEFT JOIN retention_policy_receipts r
           ON r.object_id=p.object_id AND r.object_version=p.object_version
          AND r.staging_generation=p.staging_generation AND r.policy_revision=?
         WHERE p.zone='staging' AND p.staging_entered_at IS NOT NULL
         ORDER BY p.staging_entered_at,p.object_id`
      )
      .all(row.revision) as {
      staging_entered_at: string
      object_version: number
      staging_generation: number
      state: 'MOVED' | 'SKIPPED' | 'FAILED' | null
      occurred_at: string | null
    }[]
    const now = this.clock().getTime()
    const dueDates = objects.map((item) => this.dueAt(item.staging_entered_at, row.staging_days))
    const retryDates = objects.flatMap((item) =>
      (item.state === 'FAILED' || item.state === 'SKIPPED') && item.occurred_at
        ? [new Date(Date.parse(item.occurred_at) + retryDelayMilliseconds).toISOString()]
        : []
    )
    const eligibleDates = objects.map((item, index) => {
      const due = Date.parse(dueDates[index]!)
      const retry =
        (item.state === 'FAILED' || item.state === 'SKIPPED') && item.occurred_at
          ? Date.parse(item.occurred_at) + retryDelayMilliseconds
          : due
      return Math.max(due, retry)
    })
    const nextDueAt = dueDates.at(0) ?? null
    const nextRetryAt =
      retryDates.length > 0
        ? new Date(Math.min(...retryDates.map((value) => Date.parse(value)))).toISOString()
        : null
    const nextCheckAt =
      row.staging_enabled && !row.restored_paused && eligibleDates.length > 0
        ? new Date(Math.min(...eligibleDates)).toISOString()
        : null
    return {
      trackedObjects: objects.length,
      dueObjects: dueDates.filter((value) => Date.parse(value) <= now).length,
      failedObjects: objects.filter((item) => item.state === 'FAILED').length,
      nextDueAt,
      nextRetryAt,
      nextCheckAt
    }
  }

  private recentRun(): RetentionPolicySnapshot['recentRun'] {
    if (this.schedulerFailure) return this.schedulerFailure
    const row = this.store.database
      .prepare('SELECT * FROM retention_policy_runs ORDER BY ordinal DESC LIMIT 1')
      .get() as
      | {
          id: string
          policy_revision: number
          state: 'RUNNING' | 'COMPLETED' | 'FAILED'
          started_at: string
          completed_at: string | null
          moved: number
          skipped: number
          failed: number
          error: string | null
        }
      | undefined
    return row
      ? {
          id: row.id,
          policyRevision: row.policy_revision,
          state: row.state,
          startedAt: row.started_at,
          completedAt: row.completed_at,
          moved: row.moved,
          skipped: row.skipped,
          failed: row.failed,
          error: row.error
        }
      : null
  }

  snapshot(): RetentionPolicySnapshot {
    const row = this.policy()
    return {
      revision: row.revision,
      settings: this.settings(row),
      activatedAt: row.activated_at,
      updatedAt: row.updated_at,
      restoredPaused: row.restored_paused === 1,
      usage: this.usage(),
      audit: this.audit,
      staging: this.staging(row),
      recentRun: this.recentRun()
    }
  }

  preview(
    assistantId: string,
    expectedRevision: number,
    settings: RetentionPolicySettings
  ): RetentionPolicyPreview {
    const row = this.policy()
    if (row.revision !== expectedRevision) throw new RetentionPolicyError('STALE_PREVIEW')
    const now = this.clock()
    const threshold = new Date(
      now.getTime() - settings.stagingExpiry.days * dayMilliseconds
    ).toISOString()
    const dueObjects = settings.stagingExpiry.enabled
      ? Number(
          this.store.database
            .prepare(
              `SELECT count(*) AS total FROM retention_policy_objects
               WHERE zone='staging' AND staging_entered_at IS NOT NULL AND staging_entered_at<=?`
            )
            .get(threshold)!.total
        )
      : 0
    const due = settings.stagingExpiry.enabled
      ? (this.store.database
          .prepare(
            `SELECT p.object_id,p.object_version,p.staging_entered_at,m.record_json
             FROM retention_policy_objects p JOIN memory_objects m ON m.id=p.object_id
             WHERE p.zone='staging' AND p.staging_entered_at IS NOT NULL
               AND p.staging_entered_at<=?
               AND (json_extract(m.record_json,'$.scope')='global'
                    OR json_extract(m.record_json,'$.ownerAssistantId')=?)
             ORDER BY p.staging_entered_at,p.object_id LIMIT ?`
          )
          .all(threshold, assistantId, batchSize) as {
          object_id: string
          object_version: number
          staging_entered_at: string
          record_json: string
        }[])
      : []
    const usage = this.usage()
    const impact: RetentionPolicyPreview = {
      id: randomUUID(),
      expectedRevision,
      settings,
      dueObjects,
      firstBatch: settings.stagingExpiry.enabled
        ? due.map((item) => {
            const record = memoryRecordSchema.parse(JSON.parse(item.record_json))
            return {
              id: item.object_id,
              version: item.object_version,
              ownerAssistantId: record.ownerAssistantId,
              title: record.title,
              dueAt: this.dueAt(item.staging_entered_at, settings.stagingExpiry.days)
            }
          })
        : [],
      capacityAfterSave: {
        acceptedBytes: usage.acceptedBytes,
        measurement: usage.measurement,
        overLimit:
          settings.persistentCapacity.enabled &&
          usage.acceptedBytes > settings.persistentCapacity.limitBytes
      },
      restoredPauseWillClear: row.restored_paused === 1
    }
    const intentHash = digest(JSON.stringify({ expectedRevision, settings }))
    this.store.database
      .prepare("INSERT INTO retention_policy_previews VALUES(?,?,?,?,?,? ,'pending')")
      .run(
        impact.id,
        assistantId,
        expectedRevision,
        intentHash,
        JSON.stringify(impact),
        now.toISOString()
      )
    return impact
  }

  configure(
    assistantId: string,
    commandId: string,
    expectedRevision: number,
    previewId: string,
    settings: RetentionPolicySettings
  ): RetentionPolicySnapshot {
    const intentHash = digest(JSON.stringify({ expectedRevision, previewId, settings }))
    const prior = this.store.database
      .prepare(
        'SELECT assistant_id,intent_hash,result_json FROM retention_policy_commands WHERE id=?'
      )
      .get(commandId) as
      { assistant_id: string; intent_hash: string; result_json: string } | undefined
    if (prior) {
      if (prior.assistant_id !== assistantId || prior.intent_hash !== intentHash)
        throw new RetentionPolicyError('CONFLICT')
      return JSON.parse(prior.result_json) as RetentionPolicySnapshot
    }
    const preview = this.store.database
      .prepare('SELECT * FROM retention_policy_previews WHERE id=?')
      .get(previewId) as
      | {
          assistant_id: string
          expected_revision: number
          intent_hash: string
          state: string
        }
      | undefined
    const previewHash = digest(JSON.stringify({ expectedRevision, settings }))
    if (
      !preview ||
      preview.state !== 'pending' ||
      preview.assistant_id !== assistantId ||
      preview.expected_revision !== expectedRevision ||
      preview.intent_hash !== previewHash
    )
      throw new RetentionPolicyError('STALE_PREVIEW')
    this.store.transaction(() => {
      const current = this.policy()
      if (current.revision !== expectedRevision) throw new RetentionPolicyError('STALE_PREVIEW')
      const now = this.clock().toISOString()
      this.store.database
        .prepare(
          `UPDATE retention_policy SET revision=revision+1,capacity_enabled=?,capacity_bytes=?,
           staging_enabled=?,staging_days=?,updated_at=?,restored_paused=0,
           scheduler_generation=scheduler_generation+1 WHERE singleton=1 AND revision=?`
        )
        .run(
          Number(settings.persistentCapacity.enabled),
          settings.persistentCapacity.limitBytes,
          Number(settings.stagingExpiry.enabled),
          settings.stagingExpiry.days,
          now,
          expectedRevision
        )
      this.store.database
        .prepare("UPDATE retention_policy_previews SET state='closed' WHERE state='pending'")
        .run()
      this.store.database
        .prepare(
          "UPDATE retention_policy_objects SET staging_entered_at=?,staging_generation=staging_generation+1 WHERE zone='staging' AND staging_entered_at IS NULL"
        )
        .run(now)
      const result = this.snapshot()
      this.store.database
        .prepare('INSERT INTO retention_policy_commands VALUES(?,?,?,?)')
        .run(commandId, assistantId, intentHash, JSON.stringify(result))
    })
    const result = this.snapshot()
    this.emitPolicy([], 'policy-status')
    this.rescheduleSoon()
    return result
  }

  async run(expectedRevision?: number): Promise<RetentionPolicySnapshot> {
    if (this.stopped) throw new RetentionPolicyError('STORAGE_UNAVAILABLE')
    if (expectedRevision !== undefined && this.policy().revision !== expectedRevision)
      throw new RetentionPolicyError('STALE_PREVIEW')
    await this.runBatch(true, expectedRevision)
    if (this.stopped) throw new RetentionPolicyError('STORAGE_UNAVAILABLE')
    return this.snapshot()
  }

  private candidates(row: PolicyRow, retryFailed: boolean): PolicyObjectRow[] {
    if (!row.staging_enabled || row.restored_paused) return []
    const now = this.clock().getTime()
    const threshold = new Date(now - row.staging_days * dayMilliseconds).toISOString()
    const retryBefore = new Date(now - retryDelayMilliseconds).toISOString()
    return this.store.database
      .prepare(
        `SELECT p.* FROM retention_policy_objects p
         LEFT JOIN retention_policy_receipts r
           ON r.object_id=p.object_id AND r.object_version=p.object_version
          AND r.staging_generation=p.staging_generation AND r.policy_revision=?
         WHERE p.zone='staging' AND p.staging_entered_at IS NOT NULL
           AND p.staging_entered_at<=?
           AND (?=1 OR r.state IS NULL OR r.state NOT IN ('FAILED','SKIPPED') OR r.occurred_at<=?)
         ORDER BY CASE WHEN r.state IS NULL THEN 0 ELSE 1 END,
                  CASE WHEN r.occurred_at IS NULL THEN p.staging_entered_at ELSE r.occurred_at END,
                  p.object_id LIMIT ?`
      )
      .all(
        row.revision,
        threshold,
        Number(retryFailed),
        retryBefore,
        batchSize
      ) as unknown as PolicyObjectRow[]
  }

  private recordCandidate(
    candidate: PolicyObjectRow,
    config: PolicyRow,
    runId: string,
    state: 'MOVED' | 'SKIPPED' | 'FAILED',
    detail: string | null,
    objectVersion = candidate.object_version
  ): void {
    this.store.database
      .prepare(
        `INSERT INTO retention_policy_receipts VALUES(?,?,?,?,?,?,?,?)
         ON CONFLICT(object_id,staging_generation,policy_revision) DO UPDATE SET
         object_version=excluded.object_version,state=excluded.state,run_id=excluded.run_id,
         occurred_at=excluded.occurred_at,detail=excluded.detail`
      )
      .run(
        candidate.object_id,
        candidate.staging_generation,
        config.revision,
        objectVersion,
        state,
        runId,
        this.clock().toISOString(),
        detail
      )
  }

  private async runBatch(explicit = false, expectedRevision?: number): Promise<void> {
    if (this.stopped) return
    if (this.running) {
      if (!explicit) return
      while (this.running && !this.stopped) await yieldTurn()
      if (this.stopped) return
    }
    const config = this.policy()
    if (expectedRevision !== undefined && config.revision !== expectedRevision)
      throw new RetentionPolicyError('STALE_PREVIEW')
    const candidates = this.candidates(config, explicit)
    if (!candidates.length) {
      if (explicit) {
        const now = this.clock().toISOString()
        this.store.database
          .prepare(
            `INSERT INTO retention_policy_runs
             VALUES(?,(SELECT coalesce(max(ordinal),0)+1 FROM retention_policy_runs),?,'COMPLETED',?,?,0,0,0,NULL)`
          )
          .run(randomUUID(), config.revision, now, now)
      }
      this.schedulerFailure = null
      this.schedule()
      return
    }
    const id = randomUUID()
    const startedAt = this.clock().toISOString()
    this.store.database
      .prepare(
        `INSERT INTO retention_policy_runs
         VALUES(?,(SELECT coalesce(max(ordinal),0)+1 FROM retention_policy_runs),?,'RUNNING',?,NULL,0,0,0,NULL)`
      )
      .run(id, config.revision, startedAt)
    this.running = true
    let moved = 0,
      skipped = 0,
      failed = 0
    const changedIds: string[] = []
    try {
      for (const candidate of candidates) {
        await yieldTurn()
        if (this.stopped) return
        try {
          const didMove = this.store.transaction(() => this.moveDue(candidate, config, id))
          if (didMove) {
            moved++
            changedIds.push(candidate.object_id)
          } else {
            skipped++
            this.recordCandidate(
              candidate,
              config,
              id,
              'SKIPPED',
              '对象、策略或入区代际已变化；未改变当前对象'
            )
          }
        } catch {
          failed++
          this.recordCandidate(
            candidate,
            config,
            id,
            'FAILED',
            '正文缺失、校验失败或存储暂不可用；对象仍在暂存区'
          )
        }
      }
      this.store.database
        .prepare(
          'UPDATE retention_policy_runs SET state=?,completed_at=?,moved=?,skipped=?,failed=?,error=? WHERE id=?'
        )
        .run(
          failed ? 'FAILED' : 'COMPLETED',
          this.clock().toISOString(),
          moved,
          skipped,
          failed,
          failed ? '部分对象未能校验或提交，仍保留在暂存区' : null,
          id
        )
    } finally {
      this.running = false
    }
    this.schedulerFailure = null
    if (changedIds.length) this.emitPolicy(changedIds)
    this.rescheduleSoon()
  }

  private moveDue(candidate: PolicyObjectRow, config: PolicyRow, runId: string): boolean {
    const currentConfig = this.policy()
    if (
      currentConfig.revision !== config.revision ||
      currentConfig.scheduler_generation !== config.scheduler_generation ||
      !currentConfig.staging_enabled ||
      currentConfig.restored_paused
    )
      return false
    const tracked = this.object(candidate.object_id)
    if (
      !tracked ||
      tracked.object_version !== candidate.object_version ||
      tracked.zone !== 'staging' ||
      tracked.staging_generation !== candidate.staging_generation ||
      tracked.staging_entered_at !== candidate.staging_entered_at ||
      Date.parse(tracked.staging_entered_at ?? '') + config.staging_days * dayMilliseconds >
        this.clock().getTime()
    )
      return false
    const row = this.store.database
      .prepare('SELECT version,record_json FROM memory_objects WHERE id=?')
      .get(candidate.object_id) as { version: number; record_json: string } | undefined
    if (!row || row.version !== candidate.object_version) return false
    const record = memoryRecordSchema.parse(JSON.parse(row.record_json))
    if (record.retention !== 'staging' || record.state !== 'active') return false
    const measurement = this.memory.retentionMeasurement(record)
    if (measurement.state !== 'KNOWN' || measurement.bytes === null || !measurement.bodyHash)
      throw new RetentionPolicyError('STORAGE_UNAVAILABLE')
    const version = this.store.database
      .prepare('SELECT file_name,body_hash FROM memory_versions WHERE object_id=? AND version=?')
      .get(record.id, record.objectVersion) as { file_name: string; body_hash: string } | undefined
    if (!version || version.body_hash !== measurement.bodyHash)
      throw new RetentionPolicyError('STORAGE_UNAVAILABLE')
    const next = {
      ...record,
      objectVersion: record.objectVersion + 1,
      retention: 'trash' as const,
      updatedAt: this.clock().toISOString()
    }
    this.store.database
      .prepare('INSERT INTO memory_versions VALUES(?,?,?,?,?)')
      .run(
        record.id,
        next.objectVersion,
        version.file_name,
        version.body_hash,
        JSON.stringify(next)
      )
    const updated = this.store.database
      .prepare('UPDATE memory_objects SET version=?,record_json=? WHERE id=? AND version=?')
      .run(next.objectVersion, JSON.stringify(next), record.id, record.objectVersion)
    if (updated.changes !== 1) return false
    this.memory.addDependencies('memory', record.id, next.objectVersion, record.sources)
    this.store.database
      .prepare(
        'INSERT INTO retained_source_edges SELECT object_id,?,source_type,source_id,source_version,source_assistant,recipients_json,epoch FROM retained_source_edges WHERE object_id=? AND object_version=?'
      )
      .run(next.objectVersion, record.id, record.objectVersion)
    this.store.database.prepare('DELETE FROM memory_index WHERE object_id=?').run(record.id)
    this.store.database
      .prepare('UPDATE retention_state SET generation=generation+1 WHERE singleton=1')
      .run()
    this.saveObject({
      object_id: record.id,
      object_version: next.objectVersion,
      zone: 'trash',
      accepted_bytes: measurement.bytes,
      measurement_state: 'KNOWN',
      body_hash: measurement.bodyHash,
      file_name: measurement.fileName,
      file_identity: measurement.fileIdentity,
      governance_generation: this.governanceGeneration(),
      staging_entered_at: null,
      staging_generation: tracked.staging_generation
    })
    this.recordCandidate(candidate, config, runId, 'MOVED', null, next.objectVersion)
    return true
  }

  private emitPolicy(memoryIds: string[], reason: 'policy' | 'policy-status' = 'policy'): void {
    this.emit({
      epoch: Number(
        this.store.database.prepare('SELECT epoch FROM retention_state WHERE singleton=1').get()!
          .epoch
      ),
      assistantIds: [],
      memoryIds,
      requestIds: [],
      reason
    })
  }

  private startScheduledBatch(): void {
    void this.runBatch().catch(() => {
      if (this.stopped) return
      const failedAt = this.clock().toISOString()
      try {
        this.schedulerFailure = {
          id: randomUUID(),
          policyRevision: this.policy().revision,
          state: 'FAILED',
          startedAt: failedAt,
          completedAt: failedAt,
          moved: 0,
          skipped: 0,
          failed: 1,
          error: '自动策略运行遇到存储异常；本轮未确认完成，将在退避后再检查'
        }
        try {
          this.emitPolicy([], 'policy-status')
        } catch {
          // A failed storage read is reported by the next public snapshot as STORAGE_UNAVAILABLE.
        }
      } catch {
        // The public snapshot remains the trusted storage availability boundary.
      }
      if (this.timer) clearTimeout(this.timer)
      this.timer = setTimeout(() => {
        this.timer = undefined
        this.startScheduledBatch()
      }, retryDelayMilliseconds)
      this.timer.unref?.()
    })
  }

  private rescheduleSoon(): void {
    if (this.stopped) return
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = undefined
      this.startScheduledBatch()
    }, 25)
    this.timer.unref?.()
  }

  private schedule(): void {
    if (this.stopped || this.timer) return
    const next = this.staging().nextCheckAt
    if (!next) return
    const delay = Math.max(25, Math.min(Date.parse(next) - this.clock().getTime(), dayMilliseconds))
    this.timer = setTimeout(() => {
      this.timer = undefined
      this.startScheduledBatch()
    }, delay)
    this.timer.unref?.()
  }
}
