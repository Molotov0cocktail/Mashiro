import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { SqliteStore } from '../data/sqlite.js'
import { MemoryError, type MemoryService } from '../memory/memory-service.js'
import type { BackgroundRecipient } from './background-service.js'
import type { TransportResult, TransportUsage } from '../provider/chat-completions-transport.js'
import type { ProtocolMessage } from '../provider/tool-protocol.js'
import {
  memoryRecordSchema,
  memorySourceSchema,
  type MemorySource
} from '../../shared/memory-contract.js'
import * as dto from '../../shared/steward-contract.js'
import type { BackgroundUsage } from '../../shared/background-contract.js'
import {
  BackgroundError,
  assertAssistant,
  assertRoundSources,
  roundSource,
  digest
} from './background-sources.js'
import {
  discoveryOutputSchema,
  stewardOutputSchema,
  slotPlanSchema,
  frozenInputSchema,
  stableId,
  discoveryPrompt,
  stewardPrompt,
  type FrozenInput,
  type SlotPlan
} from './steward-model.js'
import { StewardOrganization } from './steward-organization.js'

export interface StewardProvider {
  resolve(
    configuration: { connectionId: string | null; model: string | null },
    requireCredential?: boolean
  ): BackgroundRecipient
  send(
    recipient: BackgroundRecipient,
    messages: ProtocolMessage[],
    signal: AbortSignal,
    options?: import('./background-service.js').BackgroundDispatch
  ): Promise<TransportResult>
}
interface PendingRow {
  object_id: string
  version: number
  state: string
  entry_kind: 'accepted-memory' | 'shared-candidate'
  authority_assistant: string
  source_digest: string
  sources_json: string
  candidate_json: string | null
  created_at: string
}
type Config = dto.StewardConfiguration | dto.DiscoveryConfiguration
type StoredJob = {
  source_key: string
  source_digest: string
  inputs_json: string | null
  candidate_json: string | null
  record_json: string
}
type Result<T> =
  { ok: true; data: T } | { ok: false; error: { code: BackgroundError['code']; message: string } }
const commonDefaults = {
  enabled: false,
  connectionId: null,
  model: null,
  budget: null,
  version: 0,
  recipientFingerprint: null
}

export class StewardService {
  private stopped = false
  private timer: ReturnType<typeof setTimeout> | undefined
  private running = new Map<string, AbortController>()
  private listeners = new Set<(event: dto.StewardChanged) => void>()
  private revision = 0
  private backlog = false
  private lastGovernanceCheck = 0
  readonly organization: StewardOrganization
  constructor(
    private readonly store: SqliteStore,
    private readonly memory: MemoryService,
    private readonly provider: StewardProvider,
    private readonly clock: () => Date = () => new Date(),
    private readonly fault?: (phase: string) => void
  ) {
    this.organization = new StewardOrganization(store, memory, () => this.emit())
    this.memory.setConflictLookup((id) => this.organization.openConflictIds(id))
    this.store.transaction(() => {
      for (const job of this.jobs())
        if (job.state === 'RUNNING') {
          const row = this.stored(job.id)
          this.update(
            job,
            row.candidate_json ? 'QUEUED' : 'REMOTE_UNKNOWN',
            row.candidate_json
              ? '已有本地候选，恢复前逐项核查'
              : '上次远端结果未知；预算保留，须明确重试'
          )
        }
      this.store.database
        .prepare("UPDATE steward_attempts SET state='UNKNOWN' WHERE state='SENDING'")
        .run()
    })
    this.notify()
  }
  onChanged(listener: (event: dto.StewardChanged) => void) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  private emit() {
    for (const listener of this.listeners) listener({ revision: ++this.revision })
  }
  private handle<T>(operation: () => T): Result<T> {
    try {
      if (this.stopped) throw new BackgroundError('STORAGE_UNAVAILABLE')
      return { ok: true, data: operation() }
    } catch (error) {
      return {
        ok: false,
        error: {
          code:
            error instanceof z.ZodError
              ? 'INVALID_INPUT'
              : error instanceof BackgroundError
                ? error.code
                : error instanceof MemoryError && error.code !== 'INTEGRITY'
                  ? 'PERMISSION_DENIED'
                  : 'STORAGE_UNAVAILABLE',
          message:
            error instanceof MemoryError && error.code === 'INTEGRITY'
              ? '已接受正文缺失或与接受版本不一致，已停止读取和导出；请检查并重新载入'
              : '仓储操作未完成；请刷新核查来源、权限、版本和原作业'
        }
      }
    }
  }
  configuration(): dto.StewardConfiguration {
    const row = this.store.database
      .prepare('SELECT record_json FROM steward_configs WHERE singleton=1')
      .get()
    return row
      ? dto.stewardConfigurationSchema.parse(JSON.parse(String(row.record_json)))
      : {
          ...commonDefaults,
          role: 'steward',
          assistantIds: [],
          allowAcceptedMemories: false,
          allowSharedCandidates: false,
          allowWrite: false,
          allowInferences: false
        }
  }
  discovery(assistantId: string): dto.DiscoveryConfiguration {
    const row = this.store.database
      .prepare('SELECT record_json FROM discovery_configs WHERE assistant_id=?')
      .get(assistantId)
    return row
      ? dto.discoveryConfigurationSchema.parse(JSON.parse(String(row.record_json)))
      : {
          ...commonDefaults,
          role: 'assistant',
          feature: 'shared-candidates',
          assistantId,
          allowOwnCompletedRounds: false
        }
  }
  private stored(id: string): StoredJob {
    const row = this.store.database.prepare('SELECT * FROM steward_jobs WHERE id=?').get(id)
    if (!row) throw new BackgroundError('NOT_FOUND')
    return row as unknown as StoredJob
  }
  private job(id: string): dto.StewardJob {
    return dto.stewardJobSchema.parse(JSON.parse(this.stored(id).record_json))
  }
  private jobs(): dto.StewardJob[] {
    return this.store.database
      .prepare('SELECT record_json FROM steward_jobs ORDER BY rowid')
      .all()
      .map((r) => dto.stewardJobSchema.parse(JSON.parse(String(r.record_json))))
  }
  private update(job: dto.StewardJob, state: dto.StewardJob['state'], reason: string) {
    job.state = state
    job.reason = reason
    job.version++
    job.updatedAt = this.clock().toISOString()
    this.store.database
      .prepare('UPDATE steward_jobs SET record_json=? WHERE id=?')
      .run(JSON.stringify(dto.stewardJobSchema.parse(job)), job.id)
  }
  private config(job: dto.StewardJob): Config {
    return job.role === 'steward' ? this.configuration() : this.discovery(job.authorityAssistantId)
  }
  private actor(job: dto.StewardJob) {
    return job.role === 'steward' ? 'steward' : 'discovery:' + job.authorityAssistantId
  }
  usage(actor: string): BackgroundUsage {
    const result: BackgroundUsage = {
      windowId: this.clock().toISOString().slice(0, 10),
      calls: 0,
      inputCharacters: 0,
      knownPromptTokens: 0,
      knownCompletionTokens: 0,
      knownTotalTokens: 0,
      unknownAttempts: 0
    }
    for (const row of this.store.database
      .prepare(
        'SELECT input_characters,usage_json FROM steward_attempts WHERE actor_key=? AND window_id=?'
      )
      .all(actor, result.windowId)) {
      result.calls++
      result.inputCharacters += Number(row.input_characters)
      if (row.usage_json) {
        const usage = JSON.parse(String(row.usage_json)) as TransportUsage
        result.knownPromptTokens += usage.promptTokens
        result.knownCompletionTokens += usage.completionTokens
        result.knownTotalTokens += usage.totalTokens
      } else result.unknownAttempts++
    }
    return result
  }
  private authority(
    config: Config,
    assistantId: string,
    requireCredential = true
  ): BackgroundRecipient {
    assertAssistant(this.store, assistantId)
    if (!config.enabled || !config.connectionId || !config.model || !config.budget)
      throw new BackgroundError('CONFIGURATION')
    const recipient = this.provider.resolve(config, requireCredential)
    if (recipient.fingerprint !== config.recipientFingerprint)
      throw new BackgroundError('PERMISSION_DENIED')
    if (config.role === 'assistant') {
      if (!config.allowOwnCompletedRounds || config.assistantId !== assistantId)
        throw new BackgroundError('PERMISSION_DENIED')
      const read = this.store.database
        .prepare('SELECT read_history FROM history_permissions WHERE assistant_id=?')
        .get(assistantId)
      const receive = this.store.database
        .prepare(
          'SELECT send_history FROM history_recipient_grants WHERE assistant_id=? AND endpoint_fingerprint=?'
        )
        .get(assistantId, recipient.fingerprint)
      if (read?.read_history === 0 || receive?.send_history !== 1)
        throw new BackgroundError('PERMISSION_DENIED')
    } else {
      const grant = this.memory.permissionState(assistantId, 'global', recipient.fingerprint)
      if (
        !config.assistantIds.includes(assistantId) ||
        !config.allowWrite ||
        !grant.read ||
        !grant.receive ||
        !grant.write
      )
        throw new BackgroundError('PERMISSION_DENIED')
    }
    return recipient
  }
  configure(input: unknown) {
    return this.handle(() => {
      const value = dto.stewardConfigureInputSchema.parse(input)
      assertAssistant(this.store, value.assistantId)
      this.store.transaction(() => {
        const prior =
          value.role === 'steward' ? this.configuration() : this.discovery(value.assistantId)
        if (prior.version !== value.expectedVersion) throw new BackgroundError('STALE_WRITE')
        const next: Config =
          value.role === 'steward'
            ? ({
                ...prior,
                ...value.settings,
                role: 'steward',
                version: prior.version + 1
              } as dto.StewardConfiguration)
            : ({
                ...prior,
                ...value.settings,
                role: 'assistant',
                feature: 'shared-candidates',
                assistantId: value.assistantId,
                version: prior.version + 1
              } as dto.DiscoveryConfiguration)
        if (next.role === 'steward')
          for (const id of next.assistantIds) assertAssistant(this.store, id)
        if (value.grantSelectedRecipient) {
          const recipient = this.provider.resolve(next)
          next.recipientFingerprint = recipient.fingerprint
          const ids = next.role === 'steward' ? next.assistantIds : [value.assistantId]
          for (const id of ids) {
            this.store.database
              .prepare(
                'INSERT INTO history_recipient_grants VALUES(?,?,1) ON CONFLICT(assistant_id,endpoint_fingerprint) DO UPDATE SET send_history=1'
              )
              .run(id, recipient.fingerprint)
            if (next.role === 'steward')
              this.store.database
                .prepare(
                  "INSERT INTO memory_recipients VALUES(?,'global',?,1) ON CONFLICT(assistant_id,scope,fingerprint) DO UPDATE SET allowed=1"
                )
                .run(id, recipient.fingerprint)
          }
        }
        // Saving configuration is not a capability grant. Missing rights remain visible blockers.
        if (next.role === 'steward')
          this.store.database
            .prepare(
              'INSERT INTO steward_configs VALUES(1,?) ON CONFLICT(singleton) DO UPDATE SET record_json=excluded.record_json'
            )
            .run(JSON.stringify(dto.stewardConfigurationSchema.parse(next)))
        else
          this.store.database
            .prepare(
              'INSERT INTO discovery_configs VALUES(?,?) ON CONFLICT(assistant_id) DO UPDATE SET record_json=excluded.record_json'
            )
            .run(value.assistantId, JSON.stringify(dto.discoveryConfigurationSchema.parse(next)))
      })
      for (const [id, controller] of this.running) {
        const job = this.job(id)
        if (
          job.role === value.role &&
          (value.role === 'steward' || job.authorityAssistantId === value.assistantId)
        )
          controller.abort()
      }
      this.notify()
      this.emit()
      return this.snapshot(value.assistantId, 0)
    })
  }
  query(input: unknown) {
    return this.handle(() => {
      const value = dto.stewardQueryInputSchema.parse(input)
      return this.snapshot(value.assistantId, value.cursor)
    })
  }
  private pendingRow(id: string): PendingRow {
    const row = this.store.database
      .prepare('SELECT * FROM memory_pending WHERE object_id=?')
      .get(id)
    if (!row) throw new BackgroundError('NOT_FOUND')
    return row as unknown as PendingRow
  }
  private localEntry(
    row: PendingRow,
    assistantId: string
  ): { entry: dto.StewardPending; markdown: string } {
    let title = '来源已变化或不可用',
      markdown = '',
      nature: dto.StewardPending['nature'] = 'faithful-summary',
      sources: MemorySource[] = [],
      available = false
    try {
      if (row.entry_kind === 'accepted-memory') {
        const record = this.memory.acceptedBackgroundMemory(assistantId, row.object_id, row.version)
        title = record.title
        markdown = record.markdown
        nature = record.nature
        sources = record.sources
        available = record.scope === 'global'
      } else {
        assertAssistant(this.store, row.authority_assistant)
        const config = this.discovery(row.authority_assistant)
        if (!config.recipientFingerprint) throw new BackgroundError('PERMISSION_DENIED')
        const source = roundSource(
          this.store,
          row.authority_assistant,
          JSON.parse(row.sources_json)[0].id
        )
        if (source.hash !== row.source_digest) throw new BackgroundError('STALE_WRITE')
        assertRoundSources(
          this.memory,
          row.authority_assistant,
          config.recipientFingerprint,
          source.requestIds
        )
        const candidate = discoveryOutputSchema.shape.sharedCandidates.element.parse(
          JSON.parse(row.candidate_json!)
        )
        title = candidate.title
        markdown = candidate.markdown
        nature = candidate.nature
        sources = memorySourceSchema.array().parse(JSON.parse(row.sources_json))
        available = true
      }
    } catch {
      /* Show only a body-free unavailable identity. */
    }
    return {
      entry: {
        id: row.object_id,
        version: row.version,
        entryKind: row.entry_kind,
        authorityAssistantId: row.authority_assistant,
        state:
          row.state === 'dismissed'
            ? 'dismissed'
            : available
              ? (row.state as dto.StewardPending['state'])
              : 'stale',
        title,
        nature,
        createdAt: row.created_at,
        sources,
        available
      },
      markdown: available ? markdown : ''
    }
  }
  private snapshot(assistantId: string, cursor: number): dto.StewardSnapshot {
    assertAssistant(this.store, assistantId)
    const pendingRows = this.store.database
      .prepare('SELECT * FROM memory_pending ORDER BY rowid DESC LIMIT 101 OFFSET ?')
      .all(cursor) as unknown as PendingRow[]
    const jobs = this.jobs()
      .reverse()
      .slice(cursor, cursor + 101)
    const branches = this.organization.branches(cursor, 101)
    const conflicts = this.organization.conflicts(assistantId, undefined, cursor, 101)
    return {
      configuration: this.configuration(),
      discovery: this.discovery(assistantId),
      usage: this.usage('steward'),
      discoveryUsage: this.usage('discovery:' + assistantId),
      pending: pendingRows.slice(0, 100).map((r) => this.localEntry(r, assistantId).entry),
      jobs: jobs.slice(0, 100),
      branches: branches.slice(0, 100),
      conflicts: conflicts.slice(0, 100),
      nextCursor:
        pendingRows.length > 100 ||
        jobs.length > 100 ||
        branches.length > 100 ||
        conflicts.length > 100
          ? cursor + 100
          : null
    }
  }
  pending(input: unknown) {
    return this.handle(() => {
      const value = dto.stewardPendingInputSchema.parse(input)
      assertAssistant(this.store, value.assistantId)
      this.store.transaction(() => {
        const row = this.pendingRow(value.id)
        if (row.version !== value.expectedVersion) throw new BackgroundError('STALE_WRITE')
        if (value.action === 'dismiss' && !this.controlled(value.commandId, value)) {
          this.store.database
            .prepare(
              "UPDATE memory_pending SET state='dismissed',candidate_json=CASE WHEN entry_kind='shared-candidate' THEN NULL ELSE candidate_json END WHERE object_id=? AND version=?"
            )
            .run(row.object_id, row.version)
          for (const job of this.jobs())
            if (
              job.role === 'steward' &&
              job.entryId === row.object_id &&
              job.entryVersion === row.version &&
              job.state !== 'COMPLETED'
            )
              this.update(
                job,
                job.slots.some((s) => s.state === 'COMPLETED') ? 'PARTIAL' : 'CANCELLED',
                '用户已拒绝来源增量；不会重建'
              )
          this.saveControl(value.commandId, value)
        }
      })
      this.emit()
      return this.localEntry(this.pendingRow(value.id), value.assistantId)
    })
  }
  branch(input: unknown) {
    return this.handle(() => {
      const value = dto.stewardBranchInputSchema.parse(input)
      assertAssistant(this.store, value.assistantId)
      const branch = this.organization.branch(value.id)
      if (branch.version !== value.expectedVersion) throw new BackgroundError('STALE_WRITE')
      const page = this.organization.members(value.assistantId, value.id, value.cursor),
        members = page.members
      const conflicts = this.organization.conflicts(
        value.assistantId,
        undefined,
        value.cursor,
        101,
        branch.id
      )
      return {
        branch,
        members,
        nextCursor: page.nextCursor ?? (conflicts.length > 100 ? value.cursor + 100 : null),
        conflicts: conflicts.slice(0, 100),
        markdown: members.map((m) => `## ${m.title}\n\n${m.markdown}\n`).join('\n')
      }
    })
  }
  private controlled(id: string, input: unknown) {
    const prior = this.store.database
      .prepare('SELECT arguments_json FROM steward_controls WHERE id=?')
      .get(id)
    if (!prior) return false
    if (prior.arguments_json !== JSON.stringify(input)) throw new BackgroundError('CONFLICT')
    return true
  }
  private saveControl(id: string, input: unknown) {
    this.store.database
      .prepare('INSERT INTO steward_controls VALUES(?,?)')
      .run(id, JSON.stringify(input))
  }
  organize(input: unknown) {
    return this.handle(() => {
      const value = dto.stewardOrganizeInputSchema.parse(input)
      assertAssistant(this.store, value.assistantId)
      this.store.transaction(() => {
        if (this.controlled(value.commandId, value)) return
        let branch: dto.StewardBranch
        if (value.branchId) {
          branch = this.organization.branch(value.branchId)
          if (branch.version !== value.expectedVersion) throw new BackgroundError('STALE_WRITE')
          branch.title = value.title
          branch.version++
          this.store.database
            .prepare('UPDATE memory_branches SET version=?,record_json=? WHERE id=?')
            .run(branch.version, JSON.stringify(branch), branch.id)
        } else {
          if (value.expectedVersion !== 0) throw new BackgroundError('STALE_WRITE')
          branch = this.organization.ensure(value.title)
        }
        if (value.memoryId) {
          if (!value.memoryVersion) throw new BackgroundError('INVALID_INPUT')
          const record = this.memory.acceptedBackgroundMemory(
            value.assistantId,
            value.memoryId,
            value.memoryVersion
          )
          if (record.scope !== 'global') throw new BackgroundError('PERMISSION_DENIED')
          this.organization.link(
            branch,
            {
              type: 'memory',
              id: record.id,
              version: record.objectVersion,
              assistantId: record.ownerAssistantId
            },
            'member',
            []
          )
        }
        this.saveControl(value.commandId, value)
      })
      this.emit()
      return this.snapshot(value.assistantId, 0)
    })
  }
  resolveConflict(input: unknown) {
    return this.handle(() => {
      const value = dto.stewardResolveInputSchema.parse(input)
      assertAssistant(this.store, value.assistantId)
      this.store.transaction(() => {
        if (this.controlled(value.commandId, value)) return
        const row = this.store.database
          .prepare('SELECT record_json FROM memory_conflicts WHERE id=?')
          .get(value.conflictId)
        if (!row) throw new BackgroundError('NOT_FOUND')
        const conflict = dto.stewardConflictSchema.parse(JSON.parse(String(row.record_json)))
        if (conflict.version !== value.expectedVersion || conflict.state !== 'OPEN')
          throw new BackgroundError('STALE_WRITE')
        const side = [conflict.left, conflict.right].find((s) => s.id === value.resolutionMemoryId)
        if (!side || value.resolutionMemoryVersion <= side.version)
          throw new BackgroundError('CONFLICT')
        const record = this.memory.acceptedBackgroundMemory(
          value.assistantId,
          value.resolutionMemoryId,
          value.resolutionMemoryVersion
        )
        const proof = this.store.database
          .prepare(
            "SELECT 1 FROM memory_commands WHERE state='SUCCEEDED' AND json_extract(intent_json,'$.actor')='user' AND json_extract(intent_json,'$.mutation.action')='correct' AND json_extract(intent_json,'$.mutation.targetId')=? AND json_extract(receipt_json,'$.objectVersion')=?"
          )
          .get(record.id, record.objectVersion)
        if (!proof) throw new BackgroundError('CONFLICT')
        for (const other of [conflict.left, conflict.right])
          if (other.id !== side.id)
            this.memory.acceptedBackgroundMemory(value.assistantId, other.id, other.version)
        conflict.state = 'RESOLVED'
        conflict.version++
        conflict.resolution = {
          type: 'memory',
          id: record.id,
          version: record.objectVersion,
          assistantId: record.ownerAssistantId
        }
        this.store.database
          .prepare('UPDATE memory_conflicts SET version=?,record_json=? WHERE id=?')
          .run(conflict.version, JSON.stringify(conflict), conflict.id)
        for (const member of this.store.database
          .prepare('SELECT branch_id FROM branch_members WHERE memory_id=?')
          .all(record.id))
          this.organization.link(
            this.organization.branch(String(member.branch_id)),
            conflict.resolution,
            'member',
            []
          )
        this.saveControl(value.commandId, value)
      })
      this.emit()
      return this.snapshot(value.assistantId, 0)
    })
  }
  run(input: unknown) {
    return this.handle(() => {
      const value = dto.stewardRunInputSchema.parse(input)
      assertAssistant(this.store, value.assistantId)
      if (value.role === 'assistant') this.scanDiscovery(this.discovery(value.assistantId))
      else this.scanPending()
      for (const job of this.jobs())
        if (job.role === value.role && job.state === 'BUDGET_PAUSED')
          this.update(job, 'QUEUED', '等待预算检查')
      this.notify()
      return this.snapshot(value.assistantId, 0)
    })
  }
  control(input: unknown) {
    return this.handle(() => {
      const value = dto.stewardControlInputSchema.parse(input)
      assertAssistant(this.store, value.assistantId)
      this.store.transaction(() => {
        if (this.controlled(value.commandId, value)) return
        const job = this.job(value.jobId)
        if (job.version !== value.expectedVersion) throw new BackgroundError('STALE_WRITE')
        if (job.role === 'assistant' && job.authorityAssistantId !== value.assistantId)
          throw new BackgroundError('PERMISSION_DENIED')
        if (value.action === 'cancel') {
          this.running.get(job.id)?.abort()
          this.update(
            job,
            job.slots.some((s) => s.state === 'COMPLETED') ? 'PARTIAL' : 'CANCELLED',
            '已取消未完成部分；保留已提交回执与预算'
          )
        } else if (value.action !== 'inspect') {
          if (
            job.state === 'COMPLETED' ||
            job.state === 'CANCELLED' ||
            (job.state === 'REMOTE_UNKNOWN' && value.action !== 'retry-unknown')
          )
            throw new BackgroundError('CONFLICT')
          const config = this.config(job)
          if (job.configurationVersion !== config.version && this.stored(job.id).candidate_json)
            throw new BackgroundError('STALE_WRITE')
          if (!this.stored(job.id).candidate_json) {
            // No accepted model plan exists: explicit retry may refresh a previously blocked input.
            if (job.role === 'assistant' && !this.stored(job.id).source_digest) {
              const source = roundSource(this.store, job.authorityAssistantId, job.entryId)
              this.store.database
                .prepare('UPDATE steward_jobs SET source_digest=? WHERE id=?')
                .run(source.hash, job.id)
            }
            this.store.database
              .prepare('UPDATE steward_jobs SET inputs_json=NULL WHERE id=?')
              .run(job.id)
          }
          job.configurationVersion = config.version
          this.update(job, 'QUEUED', '明确重试；先核查本地回执与当前权限')
        }
        this.saveControl(value.commandId, value)
      })
      this.notify()
      this.emit()
      return this.snapshot(value.assistantId, 0)
    })
  }
  private addJob(
    role: dto.StewardJob['role'],
    assistantId: string,
    entryId: string,
    entryVersion: number,
    key: string,
    sourceDigest: string,
    configurationVersion: number
  ) {
    const now = this.clock().toISOString()
    const job: dto.StewardJob = {
      id: randomUUID(),
      version: 1,
      role,
      authorityAssistantId: assistantId,
      entryId,
      entryVersion,
      configurationVersion,
      state: 'QUEUED',
      attempts: 0,
      createdAt: now,
      updatedAt: now,
      reason: '等待预算内整理',
      slots: []
    }
    this.store.database
      .prepare('INSERT OR IGNORE INTO steward_jobs VALUES(?,?,?,NULL,NULL,?)')
      .run(job.id, key, sourceDigest, JSON.stringify(job))
  }
  private scanDiscovery(config: dto.DiscoveryConfiguration) {
    if (!config.enabled || !config.allowOwnCompletedRounds) return
    const rows = this.store.database
      .prepare(
        "SELECT request_id FROM timeline_messages WHERE assistant_id=? AND role='assistant' AND status='completed' AND source_session_id IS NULL AND NOT EXISTS(SELECT 1 FROM steward_jobs WHERE source_key='discovery:'||timeline_messages.assistant_id||':'||timeline_messages.request_id) ORDER BY sequence LIMIT 32"
      )
      .all(config.assistantId)
    if (rows.length === 32) this.backlog = true
    for (const row of rows) {
      let hash = ''
      try {
        hash = roundSource(this.store, config.assistantId, String(row.request_id)).hash
      } catch {
        /* queued blocker preserves fairness */
      }
      this.addJob(
        'assistant',
        config.assistantId,
        String(row.request_id),
        1,
        'discovery:' + config.assistantId + ':' + row.request_id,
        hash,
        config.version
      )
    }
  }
  private anchor(row: PendingRow, config: dto.StewardConfiguration): string {
    try {
      assertAssistant(this.store, row.authority_assistant)
      if (config.assistantIds.includes(row.authority_assistant)) return row.authority_assistant
    } catch {
      /* accepted global owner may be deleted */
    }
    if (
      row.entry_kind === 'accepted-memory' &&
      this.store.database
        .prepare('SELECT 1 FROM assistant_tombstones WHERE id=?')
        .get(row.authority_assistant)
    ) {
      for (const id of config.assistantIds)
        try {
          assertAssistant(this.store, id)
          return id
        } catch {
          /* find explicit active anchor */
        }
    }
    return row.authority_assistant
  }
  private pendingKey(row: PendingRow) {
    return `${row.entry_kind}:${row.object_id}:${row.version}:${row.source_digest}`
  }
  private scanPending() {
    const config = this.configuration()
    if (!config.enabled) return
    // A deleted owner's never-applied global job can be handed to a new explicit anchor.
    // The old job retains its fixed actor/anchor and audit identity; no accepted slot is replayed.
    for (const old of this.jobs())
      if (
        old.role === 'steward' &&
        ['CANCELLED', 'PERMISSION_BLOCKED', 'STALE'].includes(old.state) &&
        !old.slots.some((s) => s.state === 'COMPLETED') &&
        this.store.database
          .prepare('SELECT 1 FROM assistant_tombstones WHERE id=?')
          .get(old.authorityAssistantId)
      ) {
        try {
          const entry = this.pendingRow(old.entryId)
          const anchor = this.anchor(entry, config)
          if (
            entry.entry_kind === 'accepted-memory' &&
            entry.state === 'pending' &&
            anchor !== old.authorityAssistantId &&
            config.assistantIds.includes(anchor)
          ) {
            this.authority(config, anchor)
            this.store.database
              .prepare('UPDATE steward_jobs SET source_key=? WHERE id=?')
              .run('retired-anchor:' + old.id, old.id)
          }
        } catch {
          /* remains a visible authorization blocker */
        }
      }
    const rows = this.store.database
      .prepare(
        "SELECT * FROM memory_pending p WHERE state='pending' AND NOT EXISTS(SELECT 1 FROM steward_jobs j WHERE j.source_key=p.entry_kind||':'||p.object_id||':'||p.version||':'||p.source_digest) ORDER BY rowid LIMIT 32"
      )
      .all() as unknown as PendingRow[]
    if (rows.length === 32) this.backlog = true
    for (const row of rows)
      this.addJob(
        'steward',
        this.anchor(row, config),
        row.object_id,
        row.version,
        this.pendingKey(row),
        row.source_digest,
        config.version
      )
  }
  private grantsDigest(): string {
    return digest(
      JSON.stringify(
        [
          'memory_permissions',
          'memory_recipients',
          'history_permissions',
          'history_recipient_grants'
        ].map((table) =>
          this.store.database.prepare('SELECT * FROM ' + table + ' ORDER BY rowid').all()
        )
      )
    )
  }
  private sourceInput(job: dto.StewardJob, recipient: BackgroundRecipient): FrozenInput {
    const epoch = Number(
      this.store.database
        .prepare('SELECT generation AS epoch FROM retention_state WHERE singleton=1')
        .get()!.epoch
    )
    if (job.role === 'assistant') {
      const source = roundSource(this.store, job.authorityAssistantId, job.entryId)
      if (source.hash !== this.stored(job.id).source_digest)
        throw new BackgroundError('STALE_WRITE')
      const sources = assertRoundSources(
        this.memory,
        job.authorityAssistantId,
        recipient.fingerprint,
        source.requestIds
      )
      return {
        identity: recipient.identity,
        fingerprint: recipient.fingerprint,
        epoch,
        grantsDigest: this.grantsDigest(),
        entry: {
          handle: 'source0',
          source: sources[0]!,
          title: '当前完整正常轮',
          markdown: source.body,
          nature: 'faithful-summary',
          hash: source.hash
        },
        targets: [],
        sources
      }
    }
    const row = this.pendingRow(job.entryId),
      config = this.configuration()
    if (
      row.state !== 'pending' ||
      row.version !== job.entryVersion ||
      row.source_digest !== this.stored(job.id).source_digest
    )
      throw new BackgroundError('STALE_WRITE')
    if (
      (row.entry_kind === 'shared-candidate' && !config.allowSharedCandidates) ||
      (row.entry_kind === 'accepted-memory' && !config.allowAcceptedMemories)
    )
      throw new BackgroundError('PERMISSION_DENIED')
    let entry: FrozenInput['entry'], sources: MemorySource[]
    if (row.entry_kind === 'accepted-memory') {
      const record = this.memory.acceptedBackgroundMemory(
        job.authorityAssistantId,
        row.object_id,
        row.version
      )
      if (record.scope !== 'global') throw new BackgroundError('PERMISSION_DENIED')
      const source: MemorySource = {
        type: 'memory',
        id: record.id,
        version: record.objectVersion,
        assistantId: record.ownerAssistantId
      }
      this.memory.assertSource(source, job.authorityAssistantId, recipient.fingerprint)
      if (digest(record.markdown) !== row.source_digest) throw new BackgroundError('STALE_WRITE')
      sources = [source]
      entry = {
        handle: 'entry',
        source,
        title: record.title,
        markdown: record.markdown,
        nature: record.nature,
        kind: record.kind,
        event: record.event,
        hash: row.source_digest
      }
    } else {
      if (
        row.authority_assistant !== job.authorityAssistantId ||
        !config.assistantIds.includes(row.authority_assistant)
      )
        throw new BackgroundError('PERMISSION_DENIED')
      sources = memorySourceSchema.array().parse(JSON.parse(row.sources_json))
      for (const source of sources) {
        if (source.assistantId !== job.authorityAssistantId || source.type !== 'round')
          throw new BackgroundError('PERMISSION_DENIED')
        const actual = roundSource(this.store, job.authorityAssistantId, source.id)
        if (actual.hash !== row.source_digest) throw new BackgroundError('STALE_WRITE')
        assertRoundSources(
          this.memory,
          job.authorityAssistantId,
          recipient.fingerprint,
          actual.requestIds
        )
      }
      const candidate = discoveryOutputSchema.shape.sharedCandidates.element.parse(
        JSON.parse(row.candidate_json!)
      )
      entry = {
        handle: 'entry',
        source: sources[0]!,
        title: candidate.title,
        markdown: candidate.markdown,
        nature: candidate.nature,
        hash: digest(row.candidate_json!)
      }
    }
    if (
      entry.nature === 'inference' &&
      (!config.allowInferences ||
        !this.memory.permissionState(job.authorityAssistantId, 'global', recipient.fingerprint)
          .writeInferences)
    )
      throw new BackgroundError('PERMISSION_DENIED')
    const targets: FrozenInput['targets'] = []
    let characters = entry.markdown.length
    const queryText = entry.title + ' ' + entry.markdown
    const terms = [
      ...new Set(queryText.match(/[A-Za-z0-9_]{2,}|[\p{Script=Han}]{2}/gu) ?? [])
    ].slice(0, 128)
    // The rebuildable index ranks candidates only; every provided object is subsequently
    // authorized recursively and reread from its exact accepted Markdown hash.
    const ranked = config.allowAcceptedMemories
      ? this.store.database
          .prepare(
            'SELECT o.record_json,i.body AS indexed_body FROM memory_objects o LEFT JOIN memory_index i ON i.object_id=o.id ORDER BY o.rowid DESC'
          )
          .all()
          .map((r) => {
            const record = memoryRecordSchema.parse(JSON.parse(String(r.record_json)))
            const indexed = record.title + ' ' + String(r.indexed_body ?? '')
            return {
              record,
              score: terms.reduce(
                (sum, term) => sum + (indexed.includes(term) ? term.length : 0),
                0
              )
            }
          })
          .sort((a, b) => b.score - a.score)
      : []
    for (const { record } of ranked) {
      if (
        record.id === row.object_id ||
        record.scope !== 'global' ||
        record.state !== 'active' ||
        record.retention === 'trash'
      )
        continue
      const source: MemorySource = {
        type: 'memory',
        id: record.id,
        assistantId: record.ownerAssistantId,
        version: record.objectVersion
      }
      try {
        this.memory.assertSource(source, job.authorityAssistantId, recipient.fingerprint)
        const accepted = this.memory.acceptedBackgroundMemory(
          job.authorityAssistantId,
          record.id,
          record.objectVersion
        )
        if (characters + accepted.markdown.length > 20000) continue
        characters += accepted.markdown.length
        targets.push({
          handle: 'target' + targets.length,
          source,
          title: accepted.title,
          markdown: accepted.markdown,
          nature: accepted.nature,
          kind: accepted.kind,
          event: accepted.event,
          hash: digest(accepted.markdown)
        })
      } catch {
        /* Filter before providing any title or content. */
      }
      if (targets.length === 20) break
    }
    sources = [...sources, ...targets.map((t) => t.source)]
    return {
      identity: recipient.identity,
      fingerprint: recipient.fingerprint,
      epoch,
      grantsDigest: this.grantsDigest(),
      entry,
      targets,
      sources
    }
  }
  private current(
    job: dto.StewardJob,
    controller: AbortController,
    expected?: FrozenInput
  ): FrozenInput {
    if (this.stopped || controller.signal.aborted) throw new BackgroundError('STALE_WRITE')
    const latest = this.job(job.id)
    if (!['RUNNING', 'QUEUED'].includes(latest.state)) throw new BackgroundError('STALE_WRITE')
    const config = this.config(job)
    if (config.version !== job.configurationVersion) throw new BackgroundError('STALE_WRITE')
    const recipient = this.authority(
      config,
      job.authorityAssistantId,
      !this.stored(job.id).candidate_json
    )
    if (!expected) return this.sourceInput(job, recipient)
    if (
      expected.grantsDigest !== this.grantsDigest() ||
      expected.identity !== recipient.identity ||
      expected.fingerprint !== recipient.fingerprint ||
      expected.epoch !==
        Number(
          this.store.database
            .prepare('SELECT generation AS epoch FROM retention_state WHERE singleton=1')
            .get()!.epoch
        )
    )
      throw new BackgroundError('STALE_WRITE')
    // Recheck the exact frozen input, never broaden target discovery after a partial write.
    if (job.role === 'assistant') {
      const source = roundSource(this.store, job.authorityAssistantId, job.entryId)
      if (source.hash !== expected.entry.hash) throw new BackgroundError('STALE_WRITE')
      assertRoundSources(
        this.memory,
        job.authorityAssistantId,
        recipient.fingerprint,
        source.requestIds
      )
    } else {
      const row = this.pendingRow(job.entryId),
        c = this.configuration()
      if (
        row.state !== 'pending' ||
        row.version !== job.entryVersion ||
        row.source_digest !== this.stored(job.id).source_digest
      )
        throw new BackgroundError('STALE_WRITE')
      if (
        (row.entry_kind === 'shared-candidate' && !c.allowSharedCandidates) ||
        (row.entry_kind === 'accepted-memory' && !c.allowAcceptedMemories)
      )
        throw new BackgroundError('PERMISSION_DENIED')
      if (
        row.entry_kind === 'shared-candidate' &&
        (row.authority_assistant !== job.authorityAssistantId ||
          !row.candidate_json ||
          digest(row.candidate_json) !== expected.entry.hash)
      )
        throw new BackgroundError('STALE_WRITE')
      if (row.entry_kind === 'shared-candidate')
        for (const source of memorySourceSchema.array().parse(JSON.parse(row.sources_json))) {
          if (
            source.assistantId !== job.authorityAssistantId ||
            source.type !== 'round' ||
            roundSource(this.store, job.authorityAssistantId, source.id).hash !== row.source_digest
          )
            throw new BackgroundError('STALE_WRITE')
          assertRoundSources(this.memory, job.authorityAssistantId, recipient.fingerprint, [
            source.id
          ])
        }
      for (const item of [expected.entry, ...expected.targets])
        if (item.source.type === 'memory') {
          const record = this.memory.acceptedBackgroundMemory(
            job.authorityAssistantId,
            item.source.id,
            item.source.version
          )
          if (digest(record.markdown) !== item.hash) throw new BackgroundError('STALE_WRITE')
        }
    }
    for (const source of expected.sources)
      this.memory.assertSource(source, job.authorityAssistantId, recipient.fingerprint)
    return expected
  }
  private async execute(job: dto.StewardJob) {
    const controller = new AbortController()
    this.running.set(job.id, controller)
    let attemptId: string | undefined
    try {
      let stored = this.stored(job.id)
      const inputs = stored.inputs_json
        ? frozenInputSchema.parse(JSON.parse(stored.inputs_json))
        : this.current(job, controller)
      this.current(job, controller, inputs)
      if (!stored.candidate_json) {
        const messages: ProtocolMessage[] = [
          { role: 'system', content: job.role === 'assistant' ? discoveryPrompt : stewardPrompt },
          {
            role: 'user',
            content: JSON.stringify({ entry: inputs.entry, targets: inputs.targets })
          }
        ]
        const characters = messages.reduce((sum, m) => sum + (m.content?.length ?? 0), 0)
        const reserved = this.store.transaction(() => {
          this.current(job, controller, inputs)
          const config = this.config(job),
            usage = this.usage(this.actor(job))
          if (
            usage.calls >= config.budget!.calls ||
            usage.inputCharacters + characters > config.budget!.inputCharacters
          ) {
            this.update(job, 'BUDGET_PAUSED', '当前UTC日调用或输入字符预算不足')
            return false
          }
          attemptId = randomUUID()
          this.store.database
            .prepare('INSERT INTO steward_attempts VALUES(?,?,?,?,?,?,NULL)')
            .run(attemptId, job.id, this.actor(job), usage.windowId, characters, 'SENDING')
          this.store.database
            .prepare('UPDATE steward_jobs SET inputs_json=? WHERE id=?')
            .run(JSON.stringify(inputs), job.id)
          job.attempts++
          this.update(job, 'RUNNING', '已预留独立预算，正在调用所选角色')
          return true
        })
        if (!reserved) return
        this.current(job, controller, inputs)
        const recipient = this.authority(this.config(job), job.authorityAssistantId)
        const result = await this.provider.send(recipient, messages, controller.signal, {
          feature: job.role === 'steward' ? 'steward' : 'shared-candidates',
          assistantId: job.authorityAssistantId,
          chainId: job.id,
          attemptId
        })
        if (this.stopped) return
        const usage =
          result.usage &&
          [
            result.usage.promptTokens,
            result.usage.completionTokens,
            result.usage.totalTokens
          ].every((n) => Number.isSafeInteger(n) && n >= 0)
            ? result.usage
            : null
        this.store.database
          .prepare("UPDATE steward_attempts SET state='SETTLED',usage_json=? WHERE id=?")
          .run(usage ? JSON.stringify(usage) : null, attemptId!)
        this.current(job, controller, inputs)
        if (result.status !== 'completed' || !result.text || result.text.length > 40000) {
          this.update(
            this.job(job.id),
            result.status === 'failed' ? 'FAILED_CONFIRMED' : 'REMOTE_UNKNOWN',
            '未得到完整角色结果；保留已用预算'
          )
          return
        }
        const candidate =
          job.role === 'assistant'
            ? discoveryOutputSchema.parse(JSON.parse(result.text))
            : stewardOutputSchema.parse(JSON.parse(result.text))
        const handles = new Set([inputs.entry.handle, ...inputs.targets.map((t) => t.handle)])
        if ('sharedCandidates' in candidate) {
          for (const c of candidate.sharedCandidates)
            if (c.sourceHandles.some((h) => !handles.has(h)))
              throw new BackgroundError('INVALID_INPUT')
        } else
          for (const slot of candidate.slots) {
            if (
              slot.sourceHandles.some((h) => !handles.has(h)) ||
              !slot.sourceHandles.includes('entry') ||
              (slot.action === 'remember'
                ? slot.targetHandle !== null
                : !inputs.targets.some((t) => t.handle === slot.targetHandle))
            )
              throw new BackgroundError('INVALID_INPUT')
          }
        this.store.transaction(() => {
          this.current(job, controller, inputs)
          this.store.database
            .prepare('UPDATE steward_jobs SET candidate_json=? WHERE id=?')
            .run(JSON.stringify(candidate), job.id)
        })
        this.fault?.('candidate-saved')
        stored = this.stored(job.id)
      }
      if (this.job(job.id).state === 'QUEUED')
        this.update(job, 'RUNNING', '恢复本地候选；无额外模型调用')
      if (job.role === 'assistant')
        this.acceptDiscovery(
          job,
          inputs,
          discoveryOutputSchema.parse(JSON.parse(stored.candidate_json!)),
          controller
        )
      else
        this.acceptSlots(
          job,
          inputs,
          stewardOutputSchema.parse(JSON.parse(stored.candidate_json!)),
          controller
        )
    } catch (error) {
      if (!this.stopped) {
        const current = this.job(job.id)
        if (!['COMPLETED', 'CANCELLED', 'PARTIAL'].includes(current.state)) {
          const unknown =
            attemptId &&
            this.store.database
              .prepare("SELECT 1 FROM steward_attempts WHERE id=? AND state='SENDING'")
              .get(attemptId)
          if (unknown)
            this.store.database
              .prepare("UPDATE steward_attempts SET state='UNKNOWN' WHERE id=?")
              .run(attemptId!)
          const state = current.slots.some((s) => s.state === 'COMPLETED')
            ? 'PARTIAL'
            : unknown
              ? 'REMOTE_UNKNOWN'
              : error instanceof BackgroundError
                ? error.code === 'CONFIGURATION'
                  ? 'CONFIGURATION_BLOCKED'
                  : error.code === 'STALE_WRITE'
                    ? 'STALE'
                    : error.code === 'INVALID_INPUT'
                      ? 'FAILED_CONFIRMED'
                      : 'PERMISSION_BLOCKED'
                : error instanceof MemoryError
                  ? 'PERMISSION_BLOCKED'
                  : 'FAILED_CONFIRMED'
          this.update(current, state, '未完成部分等待核查；已有回执和预算保留')
        }
      }
    } finally {
      this.running.delete(job.id)
      if (!this.stopped) this.emit()
    }
  }
  private acceptDiscovery(
    job: dto.StewardJob,
    inputs: FrozenInput,
    candidate: z.infer<typeof discoveryOutputSchema>,
    controller: AbortController
  ) {
    this.store.transaction(() => {
      this.current(job, controller, inputs)
      candidate.sharedCandidates.forEach((item, index) => {
        const id = stableId('shared:' + job.id + ':' + index)
        this.store.database
          .prepare(
            "INSERT OR IGNORE INTO memory_pending(object_id,version,state,entry_kind,authority_assistant,source_digest,sources_json,candidate_json,created_at) VALUES(?,1,'pending','shared-candidate',?,?,?,?,?)"
          )
          .run(
            id,
            job.authorityAssistantId,
            inputs.entry.hash,
            JSON.stringify(inputs.sources),
            JSON.stringify({ ...item, nature: this.nature(item, inputs) }),
            this.clock().toISOString()
          )
      })
      this.consume(job, 'discovered')
      this.update(
        this.job(job.id),
        'COMPLETED',
        candidate.sharedCandidates.length
          ? '共享候选已进入待整理；尚未接受为记忆'
          : '本轮没有适合共享的长期增量'
      )
    })
  }
  private consume(job: dto.StewardJob, outcome: string) {
    this.store.database
      .prepare('INSERT OR IGNORE INTO steward_consumptions VALUES(?,?,?)')
      .run(this.stored(job.id).source_key, job.id, outcome)
  }
  private nature(
    plan: Pick<SlotPlan, 'nature' | 'markdown'>,
    inputs: FrozenInput
  ): 'faithful-summary' | 'inference' {
    // Model assertions of faithfulness cannot promote unsupported numbers or inference inputs.
    const sourceText = [inputs.entry, ...inputs.targets].map((i) => i.markdown).join('\n')
    const unsupportedNumbers = (plan.markdown.match(/\d+(?:\.\d+)?/g) ?? []).some(
      (n) => !sourceText.includes(n)
    )
    return plan.nature === 'inference' ||
      inputs.entry.nature === 'inference' ||
      inputs.targets.some((t) => t.nature === 'inference') ||
      unsupportedNumbers ||
      /人格|心理诊断|抑郁症|躁郁|精神疾病/.test(plan.markdown)
      ? 'inference'
      : 'faithful-summary'
  }
  private acceptSlots(
    job: dto.StewardJob,
    inputs: FrozenInput,
    output: z.infer<typeof stewardOutputSchema>,
    controller: AbortController
  ) {
    this.store.transaction(() => {
      this.current(job, controller, inputs)
      output.slots.forEach((plan, index) => {
        const id = stableId(job.id + ':slot:' + index),
          commandId = stableId(job.id + ':command:' + index)
        this.store.database
          .prepare('INSERT OR IGNORE INTO steward_slots VALUES(?,?,?,?,?,NULL)')
          .run(job.id, id, commandId, digest(JSON.stringify(plan)), JSON.stringify(plan))
      })
      const latest = this.job(job.id)
      if (!latest.slots.length) {
        latest.slots = output.slots.map((plan, index) => ({
          id: stableId(job.id + ':slot:' + index),
          commandId: stableId(job.id + ':command:' + index),
          action: plan.action,
          state: 'PENDING',
          memoryId: null,
          memoryVersion: null,
          branchId: null,
          conflictId: null,
          reason: '等待本地逐项提交'
        }))
        this.update(latest, 'RUNNING', '已冻结有限slot计划')
      }
    })
    for (const row of this.store.database
      .prepare('SELECT * FROM steward_slots WHERE job_id=? ORDER BY rowid')
      .all(job.id)) {
      if (row.receipt_json) continue
      this.current(job, controller, inputs)
      const plan = slotPlanSchema.parse(JSON.parse(String(row.plan_json)))
      if (digest(JSON.stringify(plan)) !== row.arguments_hash) throw new BackgroundError('CONFLICT')
      const target = inputs.targets.find((t) => t.handle === plan.targetHandle)
      const complete = (source: MemorySource) => {
        this.current(job, controller, inputs)
        const branch = this.organization.ensure(plan.branchTitle)
        this.organization.link(
          branch,
          source,
          plan.action === 'equivalent' ? 'equivalent' : 'member',
          inputs.sources
        )
        const conflictId =
          plan.action === 'conflict'
            ? this.organization.createConflict(target!.source, source, branch.id)
            : null
        const latest = this.job(job.id),
          slot = latest.slots.find((s) => s.id === row.slot_id)!
        Object.assign(slot, {
          state: 'COMPLETED',
          memoryId: source.id,
          memoryVersion: source.version,
          branchId: branch.id,
          conflictId,
          providedSources: inputs.sources,
          citedSources: [inputs.entry, ...inputs.targets]
            .filter((item) => plan.sourceHandles.includes(item.handle))
            .map((item) => item.source),
          reason:
            plan.action === 'equivalent'
              ? '同义引用已建立，源资料保留'
              : plan.action === 'conflict'
                ? '冲突双方已保留，等待用户纠正'
                : '分支Markdown已接受'
        })
        this.store.database
          .prepare('UPDATE steward_slots SET receipt_json=? WHERE job_id=? AND slot_id=?')
          .run(JSON.stringify(slot), job.id, String(row.slot_id))
        this.update(latest, 'RUNNING', '逐项接受回执已保存')
      }
      if (plan.action === 'equivalent') this.store.transaction(() => complete(target!.source))
      else {
        const nature = this.nature(plan, inputs),
          config = this.configuration()
        if (
          nature === 'inference' &&
          (!config.allowInferences ||
            !this.memory.permissionState(job.authorityAssistantId, 'global', inputs.fingerprint)
              .writeInferences)
        )
          throw new BackgroundError('PERMISSION_DENIED')
        this.memory.backgroundMutation(
          {
            assistantId: job.authorityAssistantId,
            jobId: job.id,
            commandId: String(row.command_id),
            actor: 'steward',
            fingerprint: inputs.fingerprint,
            sources: inputs.sources,
            assertCurrent: () => {
              this.current(job, controller, inputs)
            },
            commitReceipt: (receipt) => {
              if (receipt.state !== 'SUCCEEDED') throw new BackgroundError('CONFLICT')
              complete({
                type: 'memory',
                id: receipt.objectId,
                version: receipt.objectVersion,
                assistantId: job.authorityAssistantId
              })
            }
          },
          {
            action: 'remember',
            targetId: null,
            expectedVersion: null,
            kind: 'user',
            scope: 'global',
            title: plan.title,
            markdown: plan.markdown,
            nature,
            event: null
          }
        )
      }
      this.fault?.('slot-committed')
    }
    this.store.transaction(() => {
      this.current(job, controller, inputs)
      const latest = this.job(job.id)
      if (latest.slots.some((s) => s.state !== 'COMPLETED')) throw new BackgroundError('CONFLICT')
      this.consume(job, 'organized')
      const changed = this.store.database
        .prepare(
          "UPDATE memory_pending SET state='completed' WHERE object_id=? AND version=? AND state='pending'"
        )
        .run(job.entryId, job.entryVersion)
      if (changed.changes !== 1) throw new BackgroundError('STALE_WRITE')
      this.update(latest, 'COMPLETED', '仓储整理完成；来源和逐项回执可查')
    })
  }
  notify() {
    if (this.stopped || this.timer) return
    this.timer = setTimeout(() => {
      this.timer = undefined
      void this.pump()
    }, 0)
    this.timer.unref?.()
  }
  private async pump() {
    if (this.stopped || this.running.size) return
    try {
      this.backlog = false
      if (Date.now() - this.lastGovernanceCheck >= 1000) {
        this.lastGovernanceCheck = Date.now()
        this.organization.refreshGovernance()
      }
      for (const row of this.store.database
        .prepare('SELECT record_json FROM discovery_configs')
        .all())
        try {
          this.scanDiscovery(
            dto.discoveryConfigurationSchema.parse(JSON.parse(String(row.record_json)))
          )
        } catch {
          /* configuration remains blocked */
        }
      this.scanPending()
      const next = this.jobs().find((j) => j.state === 'QUEUED')
      if (next) await this.execute(next)
      if (this.jobs().some((j) => j.state === 'QUEUED')) this.backlog = true
    } catch {
      /* No raw source or path reaches logs. */
    } finally {
      if (!this.stopped && !this.timer) {
        this.timer = setTimeout(
          () => {
            this.timer = undefined
            void this.pump()
          },
          this.backlog ? 0 : 50
        )
        this.timer.unref?.()
      }
    }
  }
  abort(assistantId?: string) {
    for (const [id, controller] of this.running)
      if (!assistantId || this.job(id).authorityAssistantId === assistantId) controller.abort()
  }
  close() {
    this.stopped = true
    if (this.timer) clearTimeout(this.timer)
    this.abort()
    this.listeners.clear()
  }
  inspectOriginal(assistantId: string, requestIds: string[]) {
    const pending = this.store.database
      .prepare(
        "SELECT sources_json FROM memory_pending WHERE state='pending' AND entry_kind='shared-candidate' AND authority_assistant=?"
      )
      .all(assistantId)
      .some((r) =>
        memorySourceSchema
          .array()
          .parse(JSON.parse(String(r.sources_json)))
          .some((s) => requestIds.includes(s.id))
      )
    return {
      blockers:
        pending ||
        this.jobs().some(
          (j) =>
            j.authorityAssistantId === assistantId &&
            requestIds.includes(j.entryId) &&
            !['COMPLETED', 'CANCELLED', 'STALE'].includes(j.state)
        )
          ? ['共享识别或仓储候选仍未结算']
          : [],
      accepted: []
    }
  }
  inspectAssistant(assistantId: string) {
    return {
      blockers: this.jobs().some(
        (j) => j.authorityAssistantId === assistantId && j.state === 'RUNNING'
      )
        ? ['仓储任务在途；先取消并核查']
        : []
    }
  }
  purgeAssistant(assistantId: string) {
    this.abort(assistantId)
    this.store.database
      .prepare('DELETE FROM discovery_configs WHERE assistant_id=?')
      .run(assistantId)
    this.store.database
      .prepare(
        "UPDATE memory_pending SET candidate_json=NULL,sources_json='[]',state='dismissed' WHERE authority_assistant=? AND entry_kind='shared-candidate'"
      )
      .run(assistantId)
    for (const job of this.jobs())
      if (job.authorityAssistantId === assistantId) {
        this.update(
          job,
          job.slots.some((s) => s.state === 'COMPLETED') ? 'PARTIAL' : 'CANCELLED',
          '来源助手已删除；只保留预算与回执身份'
        )
        this.store.database
          .prepare('UPDATE steward_jobs SET inputs_json=NULL,candidate_json=NULL WHERE id=?')
          .run(job.id)
        this.store.database
          .prepare("UPDATE steward_slots SET plan_json='{}' WHERE job_id=?")
          .run(job.id)
      }
  }
}
