import { z } from 'zod'
import type { SqliteStore } from '../data/sqlite.js'
import type { MemoryService } from '../memory/memory-service.js'
import type { ItemService } from '../item/item-service.js'
import type { BackgroundRecipient } from './background-service.js'
import type { ProtocolMessage } from '../provider/tool-protocol.js'
import type { TransportResult } from '../provider/chat-completions-transport.js'
import { itemProposalSchema, itemRecordSchema } from '../../shared/item-contract.js'
import type { MemoryReceipt } from '../../shared/memory-contract.js'
import * as dto from '../../shared/daily-contract.js'
import { assertAssistant, digest } from './background-sources.js'
import { DailySources, dailyInputsSchema, type DailyInputs } from './daily-sources.js'
import { previewDaily, dailyPeriod, observationPeriod } from './daily-time.js'
import {
  dailyOutputSchema,
  dailyPrompt,
  validateDailyOutput,
  type DailyOutput
} from './daily-model.js'
import { OperationsService } from './operations-service.js'

export interface DailyProvider {
  resolve(
    configuration: { connectionId: string | null; model: string | null },
    requireCredential?: boolean
  ): BackgroundRecipient
  send(
    recipient: BackgroundRecipient,
    messages: ProtocolMessage[],
    signal: AbortSignal,
    options: { maxOutputTokens: number; attemptId: string }
  ): Promise<TransportResult>
}
class DailyError extends Error {
  constructor(
    readonly code: z.infer<typeof dto.dailyFailureSchema>['code'],
    message: string
  ) {
    super(message)
  }
}
const defaults: dto.DailySettings = {
  enabled: false,
  connectionId: null,
  model: null,
  dataScope: {
    ownRounds: false,
    chapters: false,
    privateMemories: false,
    globalMemories: false,
    events: false,
    items: false,
    proposals: false,
    maxSources: 32,
    lookbackDays: 7
  },
  budget: null,
  schedule: null,
  recovery: { mode: 'UNCONFIGURED' },
  allowSaveObservations: false,
  allowProposals: false,
  deadlineWindowHours: 24,
  changeFields: ['title', 'status', 'dueAt', 'description'],
  mergeChanges: null
}
export class DailyService {
  private sources: DailySources
  private stopped = false
  private timer: ReturnType<typeof setTimeout> | undefined
  private running = new Map<string, AbortController>()
  private revision = 0
  private listeners = new Set<(event: dto.DailyChanged) => void>()
  constructor(
    private readonly store: SqliteStore,
    private readonly memory: MemoryService,
    private readonly items: ItemService,
    private readonly provider: DailyProvider,
    readonly operations: OperationsService,
    private readonly clock = () => new Date(),
    private readonly fault?: (phase: string) => void
  ) {
    this.sources = new DailySources(store, memory, items)
    for (const job of this.jobs())
      if (job.state === 'RUNNING')
        this.update(
          job,
          this.row(job.id).candidate_json ? 'QUEUED' : 'REMOTE_UNKNOWN',
          this.row(job.id).candidate_json
            ? '已有本地候选，恢复前重新核验'
            : '上次请求结果未知，保留成本并等待明确重试'
        )
    this.notify()
  }
  onChanged(listener: (event: dto.DailyChanged) => void) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  private emit(
    assistantId: string | null = null,
    feature: dto.DailyFeature | null = null,
    id: string | null = null,
    version: number | null = null
  ) {
    for (const listener of this.listeners)
      listener({ revision: ++this.revision, assistantId, feature, id, version })
  }
  private handle<T>(fn: () => T) {
    try {
      if (this.stopped) throw Error('CLOSED')
      return { ok: true as const, data: fn() }
    } catch (error) {
      return {
        ok: false as const,
        error: {
          code:
            error instanceof DailyError
              ? error.code
              : error instanceof z.ZodError
                ? ('INVALID_INPUT' as const)
                : ('STORAGE_UNAVAILABLE' as const),
          message:
            error instanceof DailyError
              ? error.message
              : '日常操作未完成；请刷新核查配置、来源和原回执'
        }
      }
    }
  }
  configuration(assistantId: string, feature: dto.DailyFeature): dto.DailyConfiguration {
    const row = this.store.database
      .prepare('SELECT record_json FROM daily_configs WHERE assistant_id=? AND feature=?')
      .get(assistantId, feature)
    return row
      ? dto.dailyConfigurationSchema.parse(JSON.parse(String(row.record_json)))
      : {
          ...defaults,
          id: this.stable(assistantId + ':' + feature),
          assistantId,
          feature,
          version: 0,
          recipientFingerprint: null,
          authorizedRecipient: false
        }
  }
  private stable(value: string) {
    const hash = digest(value)
    return (
      hash.slice(0, 8) +
      '-' +
      hash.slice(8, 12) +
      '-4' +
      hash.slice(13, 16) +
      '-a' +
      hash.slice(17, 20) +
      '-' +
      hash.slice(20, 32)
    )
  }
  private configurations() {
    return this.store.database
      .prepare('SELECT record_json FROM daily_configs')
      .all()
      .map((row) => dto.dailyConfigurationSchema.parse(JSON.parse(String(row.record_json))))
  }
  configure(input: unknown) {
    return this.handle(() => {
      const value = dto.dailyConfigureInputSchema.parse(input)
      assertAssistant(this.store, value.assistantId)
      const prior = this.configuration(value.assistantId, value.feature)
      if (prior.version !== value.expectedVersion)
        throw new DailyError('STALE_WRITE', '配置已改变，请刷新后重试')
      let recipient: BackgroundRecipient | undefined
      if (value.settings.connectionId && value.settings.model)
        recipient = this.provider.resolve(value.settings, false)
      const authorized =
        !!recipient &&
        (value.grantSelectedRecipient ||
          (prior.authorizedRecipient &&
            prior.recipientFingerprint === recipient.fingerprint &&
            prior.connectionId === value.settings.connectionId &&
            prior.model === value.settings.model))
      let preview: dto.DailyPreview | undefined
      if (value.settings.schedule)
        preview = previewDaily(value.feature, value.settings.schedule, this.clock())
      if (
        value.settings.enabled &&
        (!recipient ||
          !authorized ||
          !value.settings.budget ||
          !preview?.nextRun ||
          (value.feature === 'deadline-change' && value.settings.mergeChanges === null))
      )
        throw new DailyError(
          'CONFIGURATION',
          '启用前请选择真实接收方、预算、时间/DST及明确变更策略'
        )
      const record: dto.DailyConfiguration = {
        ...value.settings,
        id: prior.id,
        assistantId: value.assistantId,
        feature: value.feature,
        version: prior.version + 1,
        recipientFingerprint: recipient?.fingerprint ?? null,
        authorizedRecipient: authorized
      }
      this.store.transaction(() => {
        if (this.configuration(value.assistantId, value.feature).version !== prior.version)
          throw new DailyError('STALE_WRITE', '配置已改变')
        if (value.grantSelectedRecipient && recipient) {
          for (const scope of ['global', 'assistant'] as const)
            if (
              scope === 'global'
                ? record.dataScope.globalMemories
                : record.dataScope.privateMemories || record.dataScope.chapters
            )
              this.store.database
                .prepare(
                  'INSERT INTO memory_recipients VALUES(?,?,?,1) ON CONFLICT(assistant_id,scope,fingerprint) DO UPDATE SET allowed=1'
                )
                .run(record.assistantId, scope, recipient.fingerprint)
          if (record.dataScope.ownRounds)
            this.store.database
              .prepare(
                'INSERT INTO history_recipient_grants VALUES(?,?,1) ON CONFLICT(assistant_id,endpoint_fingerprint) DO UPDATE SET send_history=1'
              )
              .run(record.assistantId, recipient.fingerprint)
          if (record.dataScope.items || record.dataScope.proposals || record.allowProposals)
            this.store.database
              .prepare(
                'INSERT INTO item_recipients VALUES(?,?,1) ON CONFLICT(assistant_id,fingerprint) DO UPDATE SET allowed=1'
              )
              .run(record.assistantId, recipient.fingerprint)
        }
        this.store.database
          .prepare(
            'INSERT INTO daily_configs VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET record_json=excluded.record_json,next_run=excluded.next_run,last_tick=excluded.last_tick'
          )
          .run(
            record.id,
            record.assistantId,
            record.feature,
            JSON.stringify(record),
            preview?.nextRun ?? null,
            this.clock().toISOString()
          )
      })
      this.abort(value.assistantId, value.feature)
      for (const job of this.jobs())
        if (
          job.authorityAssistantId === value.assistantId &&
          job.feature === value.feature &&
          job.configurationVersion !== record.version &&
          !['RUNNING', 'COMPLETED', 'CANCELLED', 'STALE'].includes(job.state)
        )
          this.update(job, 'STALE', '配置已改变，旧待处理作业不再派发')
      this.emit(value.assistantId, value.feature)
      this.notify()
      return record
    })
  }
  preview(input: unknown) {
    return this.handle(() => {
      const value = dto.dailyPreviewInputSchema.parse(input)
      assertAssistant(this.store, value.assistantId)
      return previewDaily(
        value.feature,
        value.schedule,
        value.after ? new Date(value.after) : this.clock()
      )
    })
  }
  private row(id: string) {
    const row = this.store.database.prepare('SELECT * FROM daily_jobs WHERE id=?').get(id)
    if (!row) throw new DailyError('NOT_FOUND', '作业不存在')
    return row
  }
  private job(id: string) {
    return dto.dailyJobSchema.parse(JSON.parse(String(this.row(id).record_json)))
  }
  private jobs() {
    return this.store.database
      .prepare('SELECT record_json FROM daily_jobs ORDER BY rowid DESC')
      .all()
      .map((row) => dto.dailyJobSchema.parse(JSON.parse(String(row.record_json))))
  }
  private reports() {
    return this.store.database
      .prepare('SELECT record_json FROM daily_reports ORDER BY rowid DESC')
      .all()
      .map((row) => dto.dailyReportSchema.parse(JSON.parse(String(row.record_json))))
  }
  private owner(job: dto.DailyJob) {
    return { domain: 'daily' as const, id: job.id, assistantId: job.authorityAssistantId }
  }
  private update(job: dto.DailyJob, state: dto.DailyJob['state'], reason: string) {
    job.state = state
    job.reason = reason
    job.version++
    job.updatedAt = this.clock().toISOString()
    this.store.database
      .prepare('UPDATE daily_jobs SET record_json=? WHERE id=?')
      .run(JSON.stringify(job), job.id)
    if (['STALE', 'CANCELLED'].includes(state))
      this.store.database
        .prepare('UPDATE daily_jobs SET inputs_json=?,candidate_json=NULL WHERE id=?')
        .run('{}', job.id)
    this.operations.event(
      this.owner(job),
      job.feature,
      state,
      reason,
      !['COMPLETED', 'CANCELLED', 'STALE'].includes(state)
    )
    this.emit(job.authorityAssistantId, job.feature, job.id, job.version)
  }
  private budget(config: dto.DailyConfiguration) {
    const windowId = this.clock().toISOString().slice(0, 10)
    const attempts = this.operations
      .attempts()
      .filter(
        (attempt) =>
          attempt.feature === config.feature &&
          attempt.assistantId === config.assistantId &&
          attempt.startedAt.slice(0, 10) === windowId
      )
    return {
      windowId,
      callsUsed: attempts.length,
      inputCharactersUsed: attempts.reduce((sum, attempt) => sum + attempt.inputCharacters, 0)
    }
  }
  private enqueue(
    config: dto.DailyConfiguration,
    occurrence: string,
    period: dto.DailyPeriod,
    state: dto.DailyJob['state'] = 'QUEUED'
  ) {
    assertAssistant(this.store, config.assistantId)
    if (!config.enabled || !config.authorizedRecipient || !config.budget || !config.schedule)
      throw new DailyError('CONFIGURATION', '功能尚未完成配置或已关闭')
    if (config.feature === 'observation')
      period = observationPeriod(period, config.dataScope.lookbackDays)
    const recipient = this.provider.resolve(config, false)
    if (recipient.fingerprint !== config.recipientFingerprint)
      throw new DailyError('PERMISSION_DENIED', '接收方已改变，请重新核查并授权')
    const inputs = this.sources.collect(config, period, recipient.identity)
    const key = config.id + ':' + config.version + ':' + occurrence
    const prior = this.store.database
      .prepare('SELECT id FROM daily_jobs WHERE source_key=?')
      .get(key)
    if (prior) return this.job(String(prior.id))
    const now = this.clock().toISOString()
    const job: dto.DailyJob = {
      id: this.stable(key),
      version: 1,
      feature: config.feature,
      authorityAssistantId: config.assistantId,
      configurationId: config.id,
      configurationVersion: config.version,
      occurrence,
      period,
      state,
      reason: state === 'RECOVERY_PENDING' ? '错过周期；请选择补跑或跳过' : '等待来源和预算检查',
      attempts: 0,
      slots: [],
      createdAt: now,
      updatedAt: now,
      reportId: null,
      budget: this.budget(config)
    }
    this.store.database
      .prepare('INSERT INTO daily_jobs VALUES(?,?,?,?,NULL)')
      .run(job.id, key, JSON.stringify(job), JSON.stringify(inputs))
    this.operations.event(this.owner(job), job.feature, state, job.reason, true)
    this.emit(config.assistantId, config.feature, job.id, job.version)
    return job
  }
  run(input: unknown) {
    return this.handle(() => {
      const value = dto.dailyRunInputSchema.parse(input)
      const replay = this.replay<dto.DailyJob>(value.commandId, value)
      if (replay) return this.job(replay.id)
      const config = this.configuration(value.assistantId, value.feature)
      if (!config.schedule) throw new DailyError('CONFIGURATION', '请先配置时区与周期')
      const job = this.enqueue(
        config,
        'manual:' + value.commandId,
        dailyPeriod(value.feature, config.schedule, this.clock())
      )
      this.saveCommand(value.commandId, value, job)
      this.notify()
      return job
    })
  }
  private replay<T>(commandId: string, args: unknown): T | undefined {
    const row = this.store.database
      .prepare('SELECT * FROM daily_commands WHERE id=?')
      .get(commandId)
    if (!row) return
    if (row.arguments_hash !== digest(JSON.stringify(args)))
      throw new DailyError('STALE_WRITE', '同一操作身份不能用于不同参数')
    return JSON.parse(String(row.receipt_json)) as T
  }
  private saveCommand(commandId: string, args: unknown, receipt: unknown) {
    this.store.database
      .prepare('INSERT INTO daily_commands VALUES(?,?,?)')
      .run(commandId, digest(JSON.stringify(args)), JSON.stringify(receipt))
  }
  control(input: unknown) {
    return this.handle(() => {
      const value = dto.dailyControlInputSchema.parse(input)
      assertAssistant(this.store, value.assistantId)
      const replay = this.replay<dto.DailyJob>(value.commandId, value)
      if (replay) return replay
      const job = this.job(value.id)
      if (job.authorityAssistantId !== value.assistantId)
        throw new DailyError('PERMISSION_DENIED', '作业不属于当前助手')
      if (job.version !== value.expectedVersion)
        throw new DailyError('STALE_WRITE', '作业版本已改变')
      if (['COMPLETED', 'CANCELLED', 'STALE'].includes(job.state))
        throw new DailyError('STALE_WRITE', '作业已结束')
      if (value.action === 'retry' && job.state === 'REMOTE_UNKNOWN')
        throw new DailyError('RESULT_UNKNOWN', '远端结果未知，请明确选择未知结果重试')
      if (job.state === 'RUNNING' && !['cancel', 'skip-recovery'].includes(value.action))
        throw new DailyError('STALE_WRITE', '当前调用尚未结束；请等待或取消后建立新作业')
      this.running.get(job.id)?.abort()
      this.store.transaction(() => {
        this.update(
          job,
          ['cancel', 'skip-recovery'].includes(value.action) ? 'CANCELLED' : 'QUEUED',
          ['cancel', 'skip-recovery'].includes(value.action)
            ? '用户取消或跳过未完成工作'
            : '用户明确请求重新检查未完成工作'
        )
        this.saveCommand(value.commandId, value, job)
      })
      this.notify()
      return job
    })
  }
  private report(id: string) {
    const row = this.store.database.prepare('SELECT * FROM daily_reports WHERE id=?').get(id)
    if (!row) throw new DailyError('NOT_FOUND', '报告不存在')
    return { row, report: dto.dailyReportSchema.parse(JSON.parse(String(row.record_json))) }
  }
  private refreshReports() {
    for (const report of this.reports())
      if (report.state === 'ACTIVE') {
        try {
          const inputs = dailyInputsSchema.parse(
            JSON.parse(String(this.row(report.jobId).inputs_json))
          )
          const config = this.configuration(report.assistantId, report.feature)
          this.sources.assert(inputs, config, this.provider.resolve(config, false).identity)
          const content = JSON.parse(String(this.report(report.id).row.content_json)) as {
            observations: dto.DailyObservation[]
            proposalLinks: z.infer<typeof itemProposalSchema>[]
          }
          let linksChanged = false
          content.proposalLinks = content.proposalLinks.map((prior) => {
            const row = this.store.database
              .prepare('SELECT record_json FROM item_proposals WHERE id=?')
              .get(prior.id)
            if (!row) throw Error('PROPOSAL_MISSING')
            const current = itemProposalSchema.parse(JSON.parse(String(row.record_json)))
            this.items.assertSource(
              {
                type: 'proposal',
                id: current.id,
                version: current.version,
                assistantId: current.originAssistantId
              },
              report.assistantId,
              config.recipientFingerprint!
            )
            linksChanged ||= current.version !== prior.version
            return current
          })
          if (linksChanged) {
            report.version++
            this.store.database
              .prepare('UPDATE daily_reports SET record_json=?,content_json=? WHERE id=?')
              .run(JSON.stringify(report), JSON.stringify(content), report.id)
            this.emit(report.assistantId, report.feature, report.id, report.version)
          }
          for (const observation of content.observations)
            if (observation.memoryId && observation.memoryVersion !== null)
              this.memory.acceptedBackgroundMemory(
                report.assistantId,
                observation.memoryId,
                observation.memoryVersion
              )
        } catch {
          report.state = 'STALE'
          report.bodyAvailable = false
          report.version++
          report.governanceVersion++
          this.store.database
            .prepare('UPDATE daily_reports SET record_json=?,content_json=? WHERE id=?')
            .run(JSON.stringify(report), '{}', report.id)
          this.store.database
            .prepare('UPDATE daily_jobs SET inputs_json=?,candidate_json=NULL WHERE id=?')
            .run('{}', report.jobId)
          this.emit(report.assistantId, report.feature, report.id, report.version)
        }
      }
  }
  query(input: unknown) {
    return this.handle(() => {
      const value = dto.dailyQueryInputSchema.parse(input)
      assertAssistant(this.store, value.assistantId)
      this.refreshReports()
      const jobs = this.jobs().filter(
          (job) =>
            job.authorityAssistantId === value.assistantId &&
            (!value.feature || job.feature === value.feature)
        ),
        reports = this.reports().filter(
          (report) =>
            report.assistantId === value.assistantId &&
            (!value.feature || report.feature === value.feature)
        )
      const rows = value.view === 'jobs' ? jobs : reports
      return {
        view: value.view,
        configurations:
          value.view === 'configurations'
            ? dto.dailyFeatureSchema.options
                .filter((feature) => !value.feature || feature === value.feature)
                .map((feature) => this.configuration(value.assistantId, feature))
            : [],
        jobs: value.view === 'jobs' ? jobs.slice(value.cursor, value.cursor + 50) : [],
        reports: value.view === 'reports' ? reports.slice(value.cursor, value.cursor + 50) : [],
        nextCursor:
          value.view !== 'configurations' && rows.length > value.cursor + 50
            ? value.cursor + 50
            : null,
        attention: {
          unread: reports.filter((report) => report.unread && report.state === 'ACTIVE').length,
          currentFailures: jobs.filter((job) =>
            ['FAILED', 'REMOTE_UNKNOWN', 'PARTIAL', 'BUDGET_PAUSED', 'RECOVERY_PENDING'].includes(
              job.state
            )
          ).length
        }
      }
    })
  }
  inspect(input: unknown) {
    return this.handle(() => {
      const value = dto.dailyInspectInputSchema.parse(input)
      assertAssistant(this.store, value.assistantId)
      this.refreshReports()
      const { report, row } = this.report(value.id)
      if (report.assistantId !== value.assistantId)
        throw new DailyError('PERMISSION_DENIED', '报告不属于当前助手')
      if (
        report.version !== value.expectedVersion ||
        report.governanceVersion !== value.governanceVersion ||
        !report.bodyAvailable
      )
        throw new DailyError('STALE_WRITE', '报告来源或版本已改变，旧正文已停止使用')
      const content = JSON.parse(String(row.content_json)) as Omit<
        dto.DailyDetail,
        'report' | 'nextCursor'
      >
      const links = content.proposalLinks
        .map((prior) => {
          const current = this.store.database
            .prepare('SELECT record_json FROM item_proposals WHERE id=?')
            .get(prior.id)
          return current ? itemProposalSchema.parse(JSON.parse(String(current.record_json))) : null
        })
        .filter((proposal) => proposal !== null)
      return {
        ...content,
        report,
        proposalLinks: links,
        providedSources: content.providedSources.slice(value.cursor, value.cursor + 50),
        citedSources: content.citedSources.slice(value.cursor, value.cursor + 50),
        nextCursor:
          Math.max(content.providedSources.length, content.citedSources.length) > value.cursor + 50
            ? value.cursor + 50
            : null
      }
    })
  }
  ack(input: unknown) {
    return this.handle(() => {
      const value = dto.dailyAckInputSchema.parse(input)
      assertAssistant(this.store, value.assistantId)
      const prior = this.replay<z.infer<typeof dto.dailyReceiptSchema>>(value.commandId, value)
      if (prior) return prior
      const { report } = this.report(value.id)
      if (report.assistantId !== value.assistantId || report.version !== value.expectedVersion)
        throw new DailyError('STALE_WRITE', '报告已改变')
      report.unread = false
      report.version++
      const receipt = {
        commandId: value.commandId,
        state: 'SUCCEEDED' as const,
        objectId: report.id,
        objectVersion: report.version,
        memory: null,
        suppressionId: null,
        summary: '已标为已读'
      }
      this.store.transaction(() => {
        this.store.database
          .prepare('UPDATE daily_reports SET record_json=? WHERE id=?')
          .run(JSON.stringify(report), report.id)
        this.saveCommand(value.commandId, value, receipt)
      })
      this.emit(report.assistantId, report.feature, report.id, report.version)
      return receipt
    })
  }
  decide(input: unknown) {
    return this.handle(() => {
      const value = dto.dailyDecideInputSchema.parse(input)
      assertAssistant(this.store, value.assistantId)
      const replay = this.replay<z.infer<typeof dto.dailyReceiptSchema>>(value.commandId, value)
      if (replay) return replay
      this.refreshReports()
      const { report, row } = this.report(value.reportId)
      if (
        report.assistantId !== value.assistantId ||
        report.version !== value.expectedReportVersion ||
        report.governanceVersion !== value.governanceVersion ||
        !report.bodyAvailable
      )
        throw new DailyError('STALE_WRITE', '观察来源或报告已改变')
      const content = JSON.parse(String(row.content_json)) as Omit<
          dto.DailyDetail,
          'report' | 'nextCursor'
        >,
        observation = content.observations.find((entry) => entry.id === value.observationId)
      if (!observation || observation.version !== value.expectedVersion)
        throw new DailyError('STALE_WRITE', '观察已改变')
      if (
        value.action === 'withdraw' ||
        (['reject', 'dispute'].includes(value.action) && observation.memoryId)
      )
        throw new DailyError('CONFIGURATION', '已接受记忆的撤回请到记忆区查看影响并确认')
      const inputs = dailyInputsSchema.parse(
          JSON.parse(String(this.row(report.jobId).inputs_json))
        ),
        config = this.configuration(report.assistantId, report.feature)
      const assertCurrent = () => {
        this.sources.assert(
          inputs,
          this.configuration(report.assistantId, report.feature),
          this.provider.resolve(config, false).identity
        )
        const current = this.report(report.id).report
        if (current.version !== report.version)
          throw new DailyError('STALE_WRITE', '观察决定已改变')
      }
      assertCurrent()
      const acceptedSources = inputs.entries.map((entry) => entry.evidence.source)
      const commit = (memory: MemoryReceipt | null) => {
        observation.version++
        observation.status =
          value.action === 'reject'
            ? 'suppressed'
            : value.action === 'dispute'
              ? 'disputed'
              : 'active'
        if (value.correction) {
          observation.title = value.correction.title
          observation.nature = 'user-statement'
          observation.markdown = value.correction.markdown
        }
        if (memory) {
          observation.memoryId = memory.objectId
          observation.memoryVersion = memory.objectVersion
        }
        if (value.action === 'reject') {
          observation.suppressionId = this.stable(report.id + ':' + observation.id)
          this.store.database
            .prepare('INSERT OR IGNORE INTO daily_suppressions VALUES(?,?)')
            .run(this.observationIdentity(inputs, observation.sourceHandles), value.commandId)
        }
        report.version++
        const receipt = {
          commandId: value.commandId,
          state: value.action === 'reject' ? ('SUPPRESSED' as const) : ('SUCCEEDED' as const),
          objectId: observation.id,
          objectVersion: observation.version,
          memory,
          suppressionId: observation.suppressionId,
          summary:
            value.action === 'reject'
              ? '观察已拒绝；相同依据不会自动重建'
              : value.action === 'dispute'
                ? '未接受观察已标为有争议，等待进一步核验'
                : '观察已保存为真实接受记忆'
        }
        this.store.database
          .prepare('UPDATE daily_reports SET record_json=?,content_json=? WHERE id=?')
          .run(JSON.stringify(report), JSON.stringify(content), report.id)
        this.saveCommand(value.commandId, value, receipt)
        return receipt
      }
      if (['reject', 'dispute'].includes(value.action))
        this.store.transaction(() => {
          assertCurrent()
          commit(null)
        })
      else {
        if (!config.allowSaveObservations)
          throw new DailyError('PERMISSION_DENIED', '未允许保存观察')
        if (value.action === 'correct' && !value.correction)
          throw new DailyError('INVALID_INPUT', '请填写即时纠正内容')
        this.memory.observationMutation(
          {
            assistantId: report.assistantId,
            jobId: report.jobId,
            commandId: value.commandId,
            fingerprint: config.recipientFingerprint!,
            sources: acceptedSources,
            assertCurrent,
            commitReceipt: (receipt) => {
              commit(receipt)
            }
          },
          {
            action: observation.memoryId ? 'correct' : 'remember',
            targetId: observation.memoryId,
            expectedVersion: observation.memoryVersion,
            kind: 'user',
            scope: 'assistant',
            title: value.correction?.title ?? observation.title,
            markdown: value.correction?.markdown ?? observation.markdown,
            nature: value.correction ? 'user-statement' : observation.nature,
            event: null
          }
        )
      }
      this.emit(report.assistantId, report.feature, report.id, report.version)
      return this.replay<z.infer<typeof dto.dailyReceiptSchema>>(value.commandId, value)!
    })
  }
  private observationIdentity(inputs: DailyInputs, handles: string[]) {
    return digest(
      JSON.stringify([
        inputs.configuration.assistantId,
        inputs.configuration.feature,
        [
          ...new Set(
            inputs.entries
              .filter((entry) => handles.includes(entry.evidence.handle))
              .flatMap((entry) => entry.independentRoots)
          )
        ].sort()
      ])
    )
  }
  private assertJob(job: dto.DailyJob, inputs: DailyInputs, controller: AbortController) {
    if (this.stopped || controller.signal.aborted || this.job(job.id).state === 'CANCELLED')
      throw new DailyError('STALE_WRITE', '用户已取消或治理状态改变')
    const config = this.configuration(job.authorityAssistantId, job.feature)
    if (!config.enabled) throw new DailyError('CONFIGURATION', '功能已关闭')
    try {
      this.sources.assert(inputs, config, this.provider.resolve(config, false).identity)
    } catch {
      throw new DailyError('STALE_WRITE', '来源、接收方或权限已改变，旧结果已停止使用')
    }
  }
  private async execute(job: dto.DailyJob) {
    const controller = new AbortController()
    this.running.set(job.id, controller)
    try {
      const row = this.row(job.id),
        inputs = dailyInputsSchema.parse(JSON.parse(String(row.inputs_json)))
      this.assertJob(job, inputs, controller)
      let output: DailyOutput,
        skipped: string | null = null
      const roots = new Set(inputs.entries.flatMap((entry) => entry.independentRoots))
      if (row.candidate_json)
        output = dailyOutputSchema.parse(JSON.parse(String(row.candidate_json)))
      else if (!inputs.entries.length || (job.feature === 'observation' && roots.size < 2)) {
        skipped = inputs.entries.length
          ? '不足两个独立事件依据，未调用模型'
          : inputs.checkpoints.length
            ? '本次仅有已删除事项的无正文变更，已本地记录，不调用模型'
            : '当前授权范围没有可用资料，未调用模型'
        output = { sections: [], observations: [], proposals: [] }
      } else {
        const config = inputs.configuration,
          recipient = this.provider.resolve(config, true)
        const messages: ProtocolMessage[] = [
          { role: 'system', content: dailyPrompt(inputs) },
          {
            role: 'user',
            content: JSON.stringify({
              period: inputs.period,
              range: inputs.range,
              sources: inputs.entries.map(({ evidence, content, independentRoots }) => ({
                ...evidence,
                content,
                independentRoots: independentRoots.length
              })),
              changes: inputs.checkpoints
            })
          }
        ]
        const characters = messages.reduce(
          (sum, message) => sum + (message.content?.length ?? 0),
          0
        )
        let attemptId = ''
        this.store.transaction(() => {
          this.assertJob(job, inputs, controller)
          job.budget = this.budget(config)
          if (
            !config.budget ||
            job.budget.callsUsed >= config.budget.calls ||
            job.budget.inputCharactersUsed + characters > config.budget.inputCharacters
          )
            throw new DailyError('BUDGET_EXHAUSTED', '预算已用尽，待处理工作保留')
          attemptId = this.operations.begin({
            chainId: job.id,
            actor: 'assistant',
            assistantId: job.authorityAssistantId,
            connectionId: recipient.connectionId,
            recipientFingerprint: recipient.fingerprint,
            model: recipient.model,
            feature: job.feature,
            inputCharacters: characters,
            persistent: true,
            owner: this.owner(job)
          })
          job.budget = this.budget(config)
          job.attempts++
          this.update(job, 'RUNNING', '正在生成有来源的日常结果')
        })
        let result: TransportResult
        try {
          result = await this.provider.send(recipient, messages, controller.signal, {
            maxOutputTokens: config.budget!.maxOutputTokens,
            attemptId
          })
          this.operations.settle(attemptId, result.usage)
        } catch (error) {
          this.operations.settle(attemptId, null, '请求未取得可验证用量')
          throw error
        }
        this.assertJob(job, inputs, controller)
        if (result.status !== 'completed')
          throw new DailyError('RESULT_UNKNOWN', '远端结果未完整返回，成本保留；请先核查')
        output = validateDailyOutput(dailyOutputSchema.parse(JSON.parse(result.text)), inputs)
        this.store.database
          .prepare('UPDATE daily_jobs SET candidate_json=? WHERE id=?')
          .run(JSON.stringify(output), job.id)
      }
      this.apply(job, inputs, output, skipped, controller)
    } catch (error) {
      if (this.stopped) return
      const current = this.job(job.id)
      if (current.state !== 'CANCELLED')
        this.update(
          current,
          error instanceof DailyError && error.code === 'BUDGET_EXHAUSTED'
            ? 'BUDGET_PAUSED'
            : error instanceof DailyError && error.code === 'RESULT_UNKNOWN'
              ? 'REMOTE_UNKNOWN'
              : controller.signal.aborted ||
                  (error instanceof DailyError && error.code === 'STALE_WRITE')
                ? 'STALE'
                : current.slots.some((slot) => slot.state === 'COMPLETED')
                  ? 'PARTIAL'
                  : 'FAILED',
          error instanceof DailyError
            ? error.message
            : '生成或接受失败；请核查来源、权限与已有逐项回执'
        )
    } finally {
      this.running.delete(job.id)
    }
  }
  private apply(
    job: dto.DailyJob,
    inputs: DailyInputs,
    output: DailyOutput,
    skipped: string | null,
    controller: AbortController
  ) {
    if (!job.slots.length) {
      job.slots = [
        {
          id: this.stable(job.id + ':report'),
          commandId: this.stable(job.id + ':report-command'),
          state: 'PENDING',
          action: 'report',
          objectId: null,
          objectVersion: null,
          reason: '待提交报告'
        },
        ...output.proposals.map((_, index) => ({
          id: this.stable(job.id + ':proposal:' + index),
          commandId: this.stable(job.id + ':proposal-command:' + index),
          state: 'PENDING' as const,
          action: 'proposal' as const,
          objectId: null,
          objectVersion: null,
          reason: '待提交提案'
        }))
      ]
      this.update(job, 'RUNNING', '候选已验证，逐项接受')
    }
    for (let index = 0; index < output.proposals.length; index++) {
      const slot = job.slots[index + 1]!,
        proposal = output.proposals[index]!
      if (slot.state === 'COMPLETED') continue
      this.assertJob(job, inputs, controller)
      this.items.backgroundProposal(
        {
          assistantId: job.authorityAssistantId,
          jobId: job.id,
          fingerprint: inputs.configuration.recipientFingerprint!,
          sources: inputs.entries.map((entry) => entry.evidence.source),
          assertCurrent: () => this.assertJob(job, inputs, controller),
          commitReceipt: (receipt) => {
            slot.state = 'COMPLETED'
            slot.objectId = receipt.objectId
            slot.objectVersion = receipt.objectVersion
            slot.reason = receipt.summary
            this.update(job, 'PARTIAL', '已有提案回执，继续剩余结果')
          }
        },
        slot.commandId,
        proposal.candidate,
        digest(
          JSON.stringify([
            job.configurationId,
            proposal.candidate,
            inputs.entries.map((entry) => entry.hash)
          ])
        )
      )
      this.fault?.('proposal-committed')
    }
    this.store.transaction(() => {
      this.assertJob(job, inputs, controller)
      const reportId = this.stable(job.id + ':report'),
        existing = this.store.database
          .prepare('SELECT 1 FROM daily_reports WHERE id=?')
          .get(reportId)
      if (!existing) {
        const observations: dto.DailyObservation[] = output.observations
          .filter(
            (observation) =>
              !this.store.database
                .prepare('SELECT 1 FROM daily_suppressions WHERE identity=?')
                .get(this.observationIdentity(inputs, observation.sourceHandles))
          )
          .map((observation, index) => ({
            id: this.stable(reportId + ':observation:' + index),
            version: 1,
            title: observation.title,
            markdown: observation.markdown,
            nature: observation.nature,
            status: 'pending-verification',
            independentRoots: new Set(
              inputs.entries
                .filter((entry) => observation.sourceHandles.includes(entry.evidence.handle))
                .flatMap((entry) => entry.independentRoots)
            ).size,
            sourceHandles: observation.sourceHandles,
            memoryId: null,
            memoryVersion: null,
            suppressionId: null
          }))
        const report: dto.DailyReport = {
          id: reportId,
          version: 1,
          governanceVersion: 1,
          assistantId: job.authorityAssistantId,
          feature: job.feature,
          jobId: job.id,
          period: job.period,
          state: 'ACTIVE',
          unread: true,
          bodyAvailable: true,
          createdAt: this.clock().toISOString(),
          connectionId: inputs.configuration.connectionId!,
          model: inputs.configuration.model!,
          recipientFingerprint: inputs.configuration.recipientFingerprint!,
          range: inputs.range,
          modelSkippedReason: skipped
        }
        const handles = new Set(
          [...output.sections, ...output.observations, ...output.proposals].flatMap(
            (section) => section.sourceHandles
          )
        )
        const proposalLinks = job.slots
          .filter((slot) => slot.action === 'proposal' && slot.objectId)
          .map((slot) => {
            const row = this.store.database
              .prepare('SELECT record_json FROM item_proposals WHERE id=?')
              .get(slot.objectId!)
            return row ? itemProposalSchema.parse(JSON.parse(String(row.record_json))) : null
          })
          .filter((record) => record !== null)
        const content = {
          markdown:
            skipped ??
            output.sections
              .map((section) => '## ' + section.title + '\n\n' + section.markdown)
              .join('\n\n'),
          sections: output.sections,
          observations,
          proposalLinks,
          providedSources: inputs.entries.map((entry) => entry.evidence),
          citedSources: inputs.entries
            .filter((entry) => handles.has(entry.evidence.handle))
            .map((entry) => entry.evidence),
          checkpoints: inputs.checkpoints.map((checkpoint) => ({ ...checkpoint, consumed: true }))
        }
        this.store.database
          .prepare('INSERT INTO daily_reports VALUES(?,?,?,?,?)')
          .run(
            report.id,
            job.id,
            JSON.stringify(report),
            JSON.stringify(content),
            digest(JSON.stringify(inputs.entries.map((entry) => entry.hash)))
          )
        for (const checkpoint of inputs.checkpoints) {
          const accepted = this.store.database
            .prepare('SELECT record_json FROM daily_item_changes WHERE item_id=? AND version=?')
            .get(checkpoint.itemId, checkpoint.toVersion)
          if (!accepted) throw new DailyError('STALE_WRITE', '消费版本不存在')
          const acceptedRecord = JSON.parse(String(accepted.record_json))
          const acceptedContent =
            acceptedRecord.deleted === true ? {} : itemRecordSchema.parse(acceptedRecord).content
          this.store.database
            .prepare(
              'INSERT INTO daily_item_checkpoints VALUES(?,?,?,?) ON CONFLICT(config_id,item_id) DO UPDATE SET version=excluded.version,content_json=excluded.content_json'
            )
            .run(
              job.configurationId,
              checkpoint.itemId,
              checkpoint.toVersion,
              JSON.stringify(acceptedContent)
            )
        }
      }
      job.reportId = reportId
      job.slots[0]!.state = 'COMPLETED'
      job.slots[0]!.objectId = reportId
      job.slots[0]!.objectVersion = 1
      job.slots[0]!.reason = '报告与消费检查点已提交'
      this.update(job, 'COMPLETED', '日常结果已生成，来源与建议回执可查')
      this.store.database
        .prepare('UPDATE daily_jobs SET inputs_json=?,candidate_json=NULL WHERE id=?')
        .run(
          JSON.stringify({
            ...inputs,
            entries: inputs.entries.map((entry) => ({ ...entry, content: '' }))
          }),
          job.id
        )
    })
  }
  tick() {
    this.operations.capture()
    this.refreshReports()
    const now = this.clock()
    for (const job of this.jobs())
      if (job.state === 'BUDGET_PAUSED' && job.budget.windowId !== now.toISOString().slice(0, 10))
        this.update(job, 'QUEUED', '进入新预算窗口，重新核验待处理工作')
    for (const config of this.configurations())
      if (config.enabled && config.schedule) {
        const row = this.store.database
          .prepare('SELECT next_run,last_tick FROM daily_configs WHERE id=?')
          .get(config.id)!
        if (row.next_run && Date.parse(String(row.next_run)) <= now.getTime()) {
          const due = new Date(String(row.next_run)),
            missed =
              now.getTime() - Date.parse(String(row.last_tick)) > 5000 ||
              now.getTime() < Date.parse(String(row.last_tick))
          const expired =
            missed &&
            config.recovery.mode === 'EXPLICIT' &&
            config.recovery.expire &&
            now.getTime() - due.getTime() > config.recovery.catchUpMinutes * 60000
          const state: dto.DailyJob['state'] = expired
            ? 'CANCELLED'
            : missed &&
                (config.recovery.mode === 'UNCONFIGURED' ||
                  now.getTime() - due.getTime() > config.recovery.catchUpMinutes * 60000)
              ? 'RECOVERY_PENDING'
              : 'QUEUED'
          this.enqueue(
            config,
            'scheduled:' + due.toISOString(),
            dailyPeriod(config.feature, config.schedule, due),
            state
          )
          const after =
            missed && config.recovery.mode === 'EXPLICIT' && config.recovery.merge ? now : due
          const next = previewDaily(config.feature, config.schedule, after)
          if (!next.nextRun)
            this.operations.event(
              { domain: 'daily', id: config.id, assistantId: config.assistantId },
              config.feature,
              'WAITING_CONFIGURATION',
              next.reason,
              true
            )
          this.store.database
            .prepare('UPDATE daily_configs SET next_run=? WHERE id=?')
            .run(next.nextRun, config.id)
        }
        this.store.database
          .prepare('UPDATE daily_configs SET last_tick=? WHERE id=?')
          .run(
            new Date(Math.max(now.getTime(), Date.parse(String(row.last_tick)))).toISOString(),
            config.id
          )
      }
  }
  notify() {
    if (this.stopped) return
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = undefined
      void this.pump()
    }, 0)
    this.timer.unref?.()
  }
  private async pump() {
    if (this.stopped) return
    try {
      this.tick()
      if (!this.running.size) {
        const job = this.jobs()
          .reverse()
          .find((job) => job.state === 'QUEUED')
        if (job) await this.execute(job)
      }
    } catch {
      /* Keep body-free state; explicit run exposes configuration errors. */
    } finally {
      if (!this.stopped && !this.timer) {
        this.timer = setTimeout(
          () => {
            this.timer = undefined
            void this.pump()
          },
          !this.running.size && this.jobs().some((job) => job.state === 'QUEUED') ? 0 : 1000
        )
        this.timer.unref?.()
      }
    }
  }
  abort(assistantId?: string, feature?: dto.DailyFeature) {
    for (const [id, controller] of this.running)
      if (
        (!assistantId || this.job(id).authorityAssistantId === assistantId) &&
        (!feature || this.job(id).feature === feature)
      )
        controller.abort()
  }
  inspectOriginal(assistantId: string, requestIds: string[]) {
    const ids = new Set(requestIds)
    return {
      blockers: this.jobs()
        .filter((job) => !['COMPLETED', 'CANCELLED', 'STALE'].includes(job.state))
        .flatMap((job) => {
          const inputs = dailyInputsSchema.parse(JSON.parse(String(this.row(job.id).inputs_json)))
          return inputs.entries.some(
            (entry) =>
              entry.evidence.source.assistantId === assistantId && ids.has(entry.evidence.source.id)
          )
            ? ['日常作业尚有来源依赖:' + job.id]
            : []
        })
    }
  }
  inspectAssistant(assistantId: string) {
    return {
      blockers: this.jobs()
        .filter(
          (job) =>
            job.authorityAssistantId === assistantId &&
            !['COMPLETED', 'CANCELLED', 'STALE'].includes(job.state)
        )
        .map((job) => '日常作业尚未处理:' + job.id)
    }
  }
  purgeAssistant(assistantId: string) {
    this.abort(assistantId)
    for (const report of this.reports().filter((report) => report.assistantId === assistantId)) {
      report.state = 'SUPPRESSED'
      report.bodyAvailable = false
      report.version++
      report.governanceVersion++
      this.store.database
        .prepare('UPDATE daily_reports SET record_json=?,content_json=? WHERE id=?')
        .run(JSON.stringify(report), '{}', report.id)
    }
    for (const job of this.jobs().filter((job) => job.authorityAssistantId === assistantId)) {
      this.update(job, 'CANCELLED', '原助手资料已清理')
      this.store.database
        .prepare('UPDATE daily_jobs SET inputs_json=?,candidate_json=NULL WHERE id=?')
        .run('{}', job.id)
    }
    this.emit(assistantId)
  }
  close() {
    this.stopped = true
    if (this.timer) clearTimeout(this.timer)
    this.abort()
    this.listeners.clear()
  }
}
