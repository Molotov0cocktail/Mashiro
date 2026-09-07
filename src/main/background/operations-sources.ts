import type { SqliteStore } from '../data/sqlite.js'
import { backgroundJobSchema } from '../../shared/background-contract.js'
import { stewardJobSchema } from '../../shared/steward-contract.js'
import { itemReceiptSchema } from '../../shared/item-contract.js'
import { reminderRecordSchema } from '../../shared/reminder-contract.js'
import type { OperationRow } from '../../shared/operations-contract.js'

export function operationSources(store: SqliteStore, now: string): OperationRow[] {
  const rows: OperationRow[] = []
  const jobs = [
    ...store.database
      .prepare('SELECT record_json FROM background_jobs')
      .all()
      .map((row) => {
        const job = backgroundJobSchema.parse(JSON.parse(String(row.record_json)))
        return { ...job, domain: 'background' as const, feature: 'chapter' as const }
      }),
    ...store.database
      .prepare('SELECT record_json FROM steward_jobs')
      .all()
      .map((row) => {
        const job = stewardJobSchema.parse(JSON.parse(String(row.record_json)))
        return {
          ...job,
          assistantId: job.authorityAssistantId,
          domain: 'steward' as const,
          feature: job.role === 'steward' ? ('steward' as const) : ('shared-candidates' as const)
        }
      })
  ]
  for (const job of jobs) {
    const current = !['COMPLETED', 'CANCELLED', 'STALE'].includes(job.state)
    rows.push({
      id: `${job.domain}:${job.id}:${job.version}`,
      owner: { domain: job.domain, id: job.id, assistantId: job.assistantId },
      feature: job.feature,
      state: job.state,
      severity: current ? 'WARN' : 'INFO',
      summary: job.reason,
      firstAt: job.createdAt,
      lastAt: job.updatedAt,
      count: 1,
      current,
      recoveredAt: null
    })
  }
  for (const row of store.database.prepare('SELECT * FROM item_commands').all()) {
    const receipt = itemReceiptSchema.parse(JSON.parse(String(row.receipt_json)))
    const current = ['RESULT_UNKNOWN', 'PENDING_CONFIRMATION'].includes(receipt.state)
    rows.push({
      id: `item:${row.id}:${receipt.state}`,
      owner: {
        domain: 'item',
        id: receipt.objectId ?? String(row.id),
        assistantId: String(row.assistant_id)
      },
      feature: null,
      state: receipt.state === 'SUCCEEDED' ? 'COMPLETED' : receipt.state,
      severity: current ? 'WARN' : 'INFO',
      summary: '事项操作回执：' + receipt.state + '；具体内容在事项区核查',
      firstAt: now,
      lastAt: now,
      count: 1,
      current,
      recoveredAt: null
    })
  }
  for (const row of store.database.prepare('SELECT record_json FROM reminders').all()) {
    const reminder = reminderRecordSchema.parse(JSON.parse(String(row.record_json)))
    const current = !['CANCELLED', 'EXPIRED', 'HANDLED'].includes(reminder.state)
    rows.push({
      id: `reminder:${reminder.id}:${reminder.version}:${reminder.state}`,
      owner: { domain: 'reminder', id: reminder.itemId, assistantId: null },
      feature: null,
      state: reminder.state,
      severity: current && reminder.state !== 'SCHEDULED' ? 'WARN' : 'INFO',
      summary: '正式提醒运行状态：' + reminder.state,
      firstAt: reminder.createdAt,
      lastAt: reminder.updatedAt,
      count: 1,
      current,
      recoveredAt: null
    })
  }
  return rows
}
