import { z } from 'zod'
import type { SqliteStore } from '../data/sqlite.js'
import type { MemoryService } from '../memory/memory-service.js'
import type { ItemService } from '../item/item-service.js'
import {
  memoryRecordSchema,
  memorySourceSchema,
  type MemorySource
} from '../../shared/memory-contract.js'
import { dailyItemChanges } from './daily-item-changes.js'
import {
  itemRecordSchema,
  itemProposalSchema,
  itemContentSchema
} from '../../shared/item-contract.js'
import {
  dailyConfigurationSchema,
  dailyEvidenceSchema,
  dailyCheckpointSchema,
  dailyPeriodSchema,
  dailyRangeSchema,
  type DailyConfiguration,
  type DailyPeriod
} from '../../shared/daily-contract.js'
import { assertRoundSources, digest } from './background-sources.js'

export const dailyInputEntrySchema = z.strictObject({
  evidence: dailyEvidenceSchema,
  content: z.string().max(20000),
  hash: z.string(),
  independentRoots: z.array(z.string()).max(4096)
})
export const dailyInputsSchema = z.strictObject({
  configuration: dailyConfigurationSchema,
  recipientIdentity: z.string(),
  period: dailyPeriodSchema,
  entries: z.array(dailyInputEntrySchema).max(64),
  range: dailyRangeSchema,
  checkpoints: z.array(dailyCheckpointSchema).max(64)
})
export type DailyInputs = z.infer<typeof dailyInputsSchema>
export class DailySources {
  constructor(
    private readonly store: SqliteStore,
    private readonly memory: MemoryService,
    private readonly items: ItemService
  ) {}
  private roots(source: MemorySource, visited = new Set<string>()): string[] {
    const key = source.type + ':' + source.id + ':' + source.version
    if (visited.has(key)) return []
    if (visited.size >= 4096) throw Error('SOURCE_GRAPH_LIMIT')
    visited.add(key)
    const children = [
      ...this.store.database
        .prepare(
          'SELECT * FROM memory_dependencies WHERE node_type=? AND node_id=? AND node_version=?'
        )
        .all(source.type, source.id, source.version),
      ...this.store.database
        .prepare('SELECT * FROM item_sources WHERE node_type=? AND node_id=? AND node_version=?')
        .all(source.type, source.id, source.version)
    ]
    if (!children.length)
      return [
        (['round', 'user-round'].includes(source.type) ? 'round' : source.type) + ':' + source.id
      ]
    return [
      ...new Set(
        children.flatMap((row) =>
          this.roots(
            memorySourceSchema.parse({
              type: row.source_type,
              id: row.source_id,
              version: row.source_version,
              assistantId: row.source_assistant
            }),
            visited
          )
        )
      )
    ]
  }
  read(source: MemorySource, config: DailyConfiguration) {
    const fingerprint = config.recipientFingerprint
    if (!fingerprint) throw Error('RECIPIENT_REQUIRED')
    if (source.type === 'memory') {
      const row = this.store.database
        .prepare('SELECT record_json FROM memory_objects WHERE id=?')
        .get(source.id)
      if (!row) throw Error('SOURCE_MISSING')
      const metadata = memoryRecordSchema.parse(JSON.parse(String(row.record_json)))
      if (
        (metadata.scope === 'global' && !config.dataScope.globalMemories) ||
        (metadata.scope === 'assistant' &&
          !config.dataScope.privateMemories &&
          !(metadata.kind === 'continuity' && config.dataScope.chapters)) ||
        (metadata.kind === 'event' && !config.dataScope.events)
      )
        throw Error('SCOPE_BLOCKED')
      this.memory.assertSource(source, config.assistantId, fingerprint)
      const record = this.memory.acceptedBackgroundMemory(
        config.assistantId,
        source.id,
        source.version
      )
      if (
        (record.scope === 'global' && !config.dataScope.globalMemories) ||
        (record.scope === 'assistant' &&
          !config.dataScope.privateMemories &&
          !(record.kind === 'continuity' && config.dataScope.chapters))
      )
        throw Error('SCOPE_BLOCKED')
      if (record.kind === 'event' && !config.dataScope.events) throw Error('EVENT_SCOPE_BLOCKED')
      const content = JSON.stringify({
        title: record.title,
        markdown: record.markdown,
        nature: record.nature,
        kind: record.kind,
        event: record.event
      })
      return {
        content,
        title: record.title,
        eventStatus: record.event?.status ?? null,
        occurredAt: record.event?.occurredAt ?? null,
        timeZone: record.event?.timeZone ?? null
      }
    }
    if (source.type === 'item' || source.type === 'proposal') {
      if (source.type === 'item' ? !config.dataScope.items : !config.dataScope.proposals)
        throw Error('ITEM_SCOPE_BLOCKED')
      this.items.assertSource(source, config.assistantId, fingerprint)
      const row = this.store.database
        .prepare(
          'SELECT record_json FROM ' +
            (source.type === 'item' ? 'items' : 'item_proposals') +
            ' WHERE id=?'
        )
        .get(source.id)
      if (!row) throw Error('SOURCE_MISSING')
      const record =
        source.type === 'item'
          ? itemRecordSchema.parse(JSON.parse(String(row.record_json)))
          : itemProposalSchema.parse(JSON.parse(String(row.record_json)))
      const content = 'content' in record ? record.content : record.candidate
      return {
        content: JSON.stringify(content),
        title: content.title,
        eventStatus: null,
        occurredAt: null,
        timeZone: null
      }
    }
    if (source.type === 'round' || source.type === 'user-round') {
      if (!config.dataScope.ownRounds || source.assistantId !== config.assistantId)
        throw Error('ROUND_SCOPE_BLOCKED')
      assertRoundSources(this.memory, config.assistantId, fingerprint, [source.id])
      const messages = this.store.database
        .prepare(
          "SELECT role,content FROM timeline_messages WHERE assistant_id=? AND request_id=? AND source_session_id IS NULL AND status='completed' ORDER BY sequence"
        )
        .all(config.assistantId, source.id)
      if (messages.length !== 2) throw Error('ROUND_INCOMPLETE')
      return {
        content: JSON.stringify(messages),
        title: '正常完整对话',
        eventStatus: null,
        occurredAt: null,
        timeZone: null
      }
    }
    throw Error('UNSUPPORTED_SOURCE')
  }
  assert(inputs: DailyInputs, current: DailyConfiguration, recipientIdentity: string) {
    if (
      current.version !== inputs.configuration.version ||
      recipientIdentity !== inputs.recipientIdentity ||
      !current.authorizedRecipient
    )
      throw Error('SOURCE_STALE')
    for (const checkpoint of inputs.checkpoints.filter((row) => row.fields.includes('deleted'))) {
      const permission = this.items.permissionState(
        current.assistantId,
        current.recipientFingerprint!
      )
      const row = this.store.database
        .prepare('SELECT record_json FROM daily_item_changes WHERE item_id=? AND version=?')
        .get(checkpoint.itemId, checkpoint.toVersion)
      if (
        !current.dataScope.items ||
        !permission.read ||
        !permission.receive ||
        !row ||
        JSON.parse(String(row.record_json)).deleted !== true
      )
        throw Error('SOURCE_STALE')
    }
    for (const entry of inputs.entries)
      if (digest(this.read(entry.evidence.source, current).content) !== entry.hash)
        throw Error('SOURCE_STALE')
  }
  collect(config: DailyConfiguration, period: DailyPeriod, recipientIdentity: string): DailyInputs {
    const candidates: MemorySource[] = []
    const cutoff = Date.parse(period.start)
    for (const row of this.store.database
      .prepare('SELECT record_json FROM memory_objects ORDER BY rowid DESC')
      .all()) {
      const record = memoryRecordSchema.parse(JSON.parse(String(row.record_json)))
      if (record.state !== 'active' || record.retention === 'trash') continue
      if (config.feature === 'observation' && record.kind !== 'event') continue
      if (
        record.kind === 'event' &&
        record.event?.occurredAt &&
        (Date.parse(record.event.occurredAt) < cutoff ||
          Date.parse(record.event.occurredAt) >= Date.parse(period.end))
      )
        continue
      candidates.push({
        type: 'memory',
        id: record.id,
        version: record.objectVersion,
        assistantId: record.ownerAssistantId
      })
    }
    if (config.dataScope.items && config.feature !== 'observation')
      for (const row of this.store.database
        .prepare('SELECT record_json FROM items ORDER BY rowid DESC')
        .all()) {
        const record = itemRecordSchema.parse(JSON.parse(String(row.record_json)))
        candidates.push({
          type: 'item',
          id: record.id,
          version: record.version,
          assistantId: record.originAssistantId
        })
      }
    if (config.dataScope.proposals && config.feature !== 'observation')
      for (const row of this.store.database
        .prepare(
          "SELECT record_json FROM item_proposals WHERE origin_assistant_id=? AND state NOT IN('ACCEPTED','REJECTED','STALE') ORDER BY rowid DESC"
        )
        .all(config.assistantId)) {
        const record = itemProposalSchema.parse(JSON.parse(String(row.record_json)))
        candidates.push({
          type: 'proposal',
          id: record.id,
          version: record.version,
          assistantId: record.originAssistantId
        })
      }
    if (config.dataScope.ownRounds && config.feature !== 'observation')
      for (const row of this.store.database
        .prepare(
          "SELECT request_id FROM timeline_messages WHERE assistant_id=? AND role='assistant' AND status='completed' AND source_session_id IS NULL AND created_at>=? AND created_at<? ORDER BY sequence DESC"
        )
        .all(config.assistantId, new Date(cutoff).toISOString(), period.end))
        candidates.push({
          type: 'round',
          id: String(row.request_id),
          assistantId: config.assistantId,
          version: 1
        })
    const entries: DailyInputs['entries'] = [],
      checkpoints: DailyInputs['checkpoints'] = []
    let available = 0
    let changesLimited = false
    if (config.feature === 'deadline-change' && config.dataScope.items) {
      const permission = this.items.permissionState(
        config.assistantId,
        config.recipientFingerprint!
      )
      if (permission.read && permission.receive) {
        for (const row of this.store.database
          .prepare(
            "SELECT d.item_id,d.version FROM daily_item_changes d LEFT JOIN daily_item_checkpoints c ON c.config_id=? AND c.item_id=d.item_id WHERE json_extract(d.record_json,'$.deleted')=1 AND (c.version IS NULL OR c.version<d.version) ORDER BY d.item_id"
          )
          .all(config.id)) {
          if (checkpoints.length >= 64) {
            changesLimited = true
            continue
          }
          checkpoints.push({
            itemId: String(row.item_id),
            fromVersion: Number(row.version) - 1,
            toVersion: Number(row.version),
            fields: ['deleted'],
            before: null,
            after: '正式事项已被用户删除；旧正文不再保留',
            consumed: false
          })
        }
      }
    }
    for (const source of candidates) {
      try {
        const read = this.read(source, config)
        if (read.content.length > 20000) continue
        let selected: DailyInputs['checkpoints'] = []
        if (config.feature === 'deadline-change' && source.type === 'item') {
          const changes = dailyItemChanges(
            this.store,
            config,
            source.id,
            source.version,
            itemContentSchema.parse(JSON.parse(read.content)),
            period,
            64 - checkpoints.length
          )
          changesLimited ||= changes.limited
          if (!changes.relevant && !changes.limited) continue
          selected = changes.checkpoints
          if (!selected.length) {
            available++
            continue
          }
        }
        available++
        if (entries.length >= config.dataScope.maxSources) continue
        entries.push({
          evidence: {
            handle: 'source' + entries.length,
            source,
            title: read.title,
            eventStatus: read.eventStatus,
            occurredAt: read.occurredAt,
            timeZone: read.timeZone
          },
          content: read.content,
          hash: digest(read.content),
          independentRoots: this.roots(source)
        })
        checkpoints.push(...selected)
      } catch (error) {
        if (!(error instanceof Error)) throw error
        const code = 'code' in error ? error.code : error.message
        if (
          ![
            'PERMISSION_DENIED',
            'NOT_FOUND',
            'STALE_WRITE',
            'SCOPE_BLOCKED',
            'EVENT_SCOPE_BLOCKED',
            'ITEM_SCOPE_BLOCKED',
            'ROUND_SCOPE_BLOCKED',
            'ROUND_INCOMPLETE',
            'SOURCE_MISSING'
          ].includes(String(code))
        )
          throw error
      }
    }
    return {
      configuration: config,
      recipientIdentity,
      period,
      entries,
      checkpoints,
      range: {
        included: entries.length,
        available,
        limited: changesLimited || available > entries.length,
        description: changesLimited
          ? '变更超过本次64个消费检查点；未消费版本保留供后续运行，不代表完整变更记录'
          : available > entries.length
            ? '达到你明确选择的资料数量上限；本结果仅覆盖列出的来源，可增加范围或分次运行'
            : '覆盖当前明确授权范围内可用来源，不代表完整生活记录'
      }
    }
  }
}
