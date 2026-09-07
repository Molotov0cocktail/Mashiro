import { createHash } from 'node:crypto'
import { lstatSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const scene = resolve(
  'C:/Users/30910/AppData/Local/Temp/mashiro-install-full-Zbzmgp'
)
const source = join(scene, '全域 合成数据')
const databasePath = join(source, 'mashiro.sqlite')
const output = resolve(
  '.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/delivery-014-notification-attempt-02.json'
)
const reminderId = '70a8cb12-b0e3-42f6-b261-b08e6febcfb6'

const files = []
const visit = (directory) => {
  for (const name of readdirSync(directory).sort()) {
    const path = join(directory, name)
    const stat = lstatSync(path)
    if (stat.isSymbolicLink()) throw new Error('SOURCE_REPARSE_POINT')
    if (stat.isDirectory()) {
      visit(path)
      continue
    }
    if (!stat.isFile()) throw new Error('SOURCE_NON_FILE_ENTRY')
    files.push({
      relative: relative(source, path).replaceAll('\\', '/'),
      length: stat.size,
      sha256: createHash('sha256')
        .update(readFileSync(path))
        .digest('hex')
        .toUpperCase()
    })
  }
}
visit(source)

const dataset = JSON.parse(readFileSync(join(source, '.mashiro-dataset.json'), 'utf8'))
const database = new DatabaseSync(databasePath, { readOnly: true })
const integrity = database.prepare('PRAGMA integrity_check').all()
const schemaVersion = Number(database.prepare('PRAGMA user_version').get().user_version)
const reminder = database
  .prepare('SELECT id,version,state,due_at AS dueAt FROM reminders WHERE id=?')
  .get(reminderId)
const notificationMember = database
  .prepare(
    `SELECT reminder_id AS reminderId,version AS reminderVersion,group_id AS groupId
     FROM reminder_notification_members WHERE reminder_id=? ORDER BY version DESC LIMIT 1`
  )
  .get(reminderId)
const occurrenceCount = Number(
  database
    .prepare('SELECT COUNT(*) AS count FROM reminder_occurrences WHERE reminder_id=?')
    .get(reminderId).count
)
database.close()

const report = {
  scope: 'installed schema-15 synthetic reminder reschedule and exact notification-center observation',
  observedAt: new Date().toISOString(),
  source,
  dataSetId: dataset.dataSetId,
  schemaVersion,
  integrity: integrity.map((row) => row.integrity_check),
  files,
  reminder: {
    id: reminder.id,
    version: Number(reminder.version),
    state: reminder.state,
    dueAt: reminder.dueAt
  },
  notificationMember: notificationMember
    ? {
        reminderId: notificationMember.reminderId,
        reminderVersion: Number(notificationMember.reminderVersion),
        groupId: notificationMember.groupId
      }
    : null,
  occurrenceCount,
  ui: {
    initialVersion: 4,
    initialState: 'DISPLAY_OBSERVED',
    initialDueAt: '2026-09-07T19:26:00+08:00',
    rescheduledAt: '2026-09-07T19:39:31.6163409+08:00',
    rescheduledDueAt: '2026-09-07T19:44:00+08:00',
    observedDisplayAt: '2026-09-07T11:44:27.469Z',
    normalExitAt: '2026-09-07T19:47:35.6592273+08:00',
    installedProcessesAfterExit: 0,
    notificationCenterObservedAt: '2026-09-07T19:45:03.4730011+08:00',
    exactTitleMatches: 0,
    exactBodyMatches: 0,
    boundedSubstringMatchesAt: '2026-09-07T19:45:38.0410180+08:00',
    boundedSubstringMatches: 0,
    appLifecycleDuringQuery: 'RUNNING_IN_TRAY',
    userVisibleNotification: 'NOT_PROVEN',
    warmActivation: 'NOT_PROVEN',
    coldActivation: 'NOT_PROVEN'
  },
  backupBaseline: {
    backupId: 'be252177-5477-4b80-916a-862399a8e04c',
    reminderVersion: 3,
    reminderState: 'DISPLAY_OBSERVED',
    reminderDueAt: '2026-09-07T17:21:00+08:00',
    sourceSqliteSha256:
      'E5381791E8F08847812E983A7E74442A4A45DFCB824A319ABA7A09EC2D5BD46E'
  },
  notificationCenterQuery: {
    exactTitle: 'Mashiro 提醒',
    exactBody: '一项已保存的提醒到时。点击查看当前事项。',
    postRescheduleAppNameOnlyQueryUsed: false,
    priorNameCollisionDiscardedWithoutSaving: true,
    unrelatedNotificationContentSaved: false,
    unrelatedNotificationClickedOrCleared: false
  },
  sourceReparsePoints: 0,
  externalCalls: 0,
  personalDataAccessed: false,
  result: 'REMINDER_STATE_OBSERVED_RUNTIME_NOTIFICATION_AND_ACTIVATION_NOT_PROVEN'
}

writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)
console.log(
  JSON.stringify({
    output,
    dataSetId: report.dataSetId,
    schemaVersion,
    reminder: report.reminder,
    sourceSqliteSha256: files.find((file) => file.relative === 'mashiro.sqlite')?.sha256,
    result: report.result
  })
)
