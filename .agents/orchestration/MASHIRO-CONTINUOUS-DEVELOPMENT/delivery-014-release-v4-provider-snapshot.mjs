import console from 'node:console'
import process from 'node:process'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const phase = process.argv[2]
if (phase !== 'before' && phase !== 'after') throw new Error('PHASE_REQUIRED')
const databasePath = resolve(
  'C:/Users/30910/AppData/Local/Temp/mashiro-install-full-Zbzmgp/全域 合成数据/mashiro.sqlite'
)
const output = resolve(
  `.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/delivery-014-release-v4-provider-${phase}.json`
)
const database = new DatabaseSync(databasePath, { readOnly: true })
const attempts = database
  .prepare('SELECT id,record_json AS recordJson FROM usage_attempts ORDER BY rowid')
  .all()
  .map((row) => ({ id: String(row.id), ...JSON.parse(String(row.recordJson)) }))
const count = (table) =>
  Number(database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count)
const sum = (field) =>
  attempts.reduce((total, attempt) => total + Number(attempt.actual?.[field] ?? 0), 0)
const report = {
  phase,
  observedAt: new Date().toISOString(),
  schemaVersion: Number(database.prepare('PRAGMA user_version').get().user_version),
  integrity: database.prepare('PRAGMA integrity_check').all().map((row) => row.integrity_check),
  counts: {
    timelineMessages: count('timeline_messages'),
    protocolSegments: count('protocol_segments'),
    toolOperations: count('tool_operations'),
    memoryObjects: count('memory_objects'),
    usageAttempts: attempts.length
  },
  usage: {
    settled: attempts.filter((attempt) => attempt.state === 'SETTLED').length,
    unknown: attempts.filter((attempt) => attempt.state === 'UNKNOWN').length,
    sending: attempts.filter((attempt) => attempt.state === 'SENDING').length,
    promptTokens: sum('promptTokens'),
    completionTokens: sum('completionTokens'),
    totalTokens: sum('totalTokens'),
    inputCharacters: attempts.reduce(
      (total, attempt) => total + Number(attempt.inputCharacters ?? 0),
      0
    )
  },
  attempts: attempts.slice(-12).map((attempt) => ({
    id: attempt.id,
    chainId: attempt.chainId,
    assistantId: attempt.assistantId,
    connectionId: attempt.connectionId,
    model: attempt.model,
    feature: attempt.feature,
    state: attempt.state,
    startedAt: attempt.startedAt,
    finishedAt: attempt.finishedAt,
    inputCharacters: attempt.inputCharacters,
    actual: attempt.actual,
    owner: attempt.owner
  })),
  credentialRead: false,
  messageContentRead: false
}
database.close()
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)
console.log(
  JSON.stringify({
    output,
    schemaVersion: report.schemaVersion,
    counts: report.counts,
    usage: report.usage
  })
)
