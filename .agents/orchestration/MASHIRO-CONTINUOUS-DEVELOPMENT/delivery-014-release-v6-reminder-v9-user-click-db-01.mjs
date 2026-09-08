import console from 'node:console'
import { createHash } from 'node:crypto'
import { lstatSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const scene = resolve(
  'C:/Users/30910/AppData/Local/Temp/mashiro-install-full-Zbzmgp'
)
const install = join(scene, '安装 旧版本')
const data = join(install, 'data')
const databasePath = join(data, 'mashiro.sqlite')
const reminderId = '70a8cb12-b0e3-42f6-b261-b08e6febcfb6'
const itemId = 'a35ff4f3-2096-477f-8dc2-2ca3d8af355f'
const output = resolve(
  '.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/delivery-014-release-v6-reminder-v9-user-click-db-01.json'
)

for (const path of [scene, install, data, databasePath]) {
  const stat = lstatSync(path)
  if (stat.isSymbolicLink()) throw new Error(`REPARSE_POINT_${path}`)
}
if (realpathSync(databasePath) !== databasePath) {
  throw new Error('DATABASE_REALPATH_MISMATCH')
}

const locationPath =
  'C:/Users/30910/AppData/Roaming/Mashiro/configuration/location.json'
const location = JSON.parse(readFileSync(locationPath, 'utf8'))
const dataset = JSON.parse(readFileSync(join(data, '.mashiro-dataset.json'), 'utf8'))
if (location.dataPath !== data || location.dataSetId !== dataset.dataSetId) {
  throw new Error('LOCATION_DATASET_MISMATCH')
}

const database = new DatabaseSync(databasePath, { readOnly: true })
let report
try {
  const schemaVersion = Number(database.prepare('PRAGMA user_version').get().user_version)
  const integrity = database.prepare('PRAGMA integrity_check').all()
  const foreignKeys = database.prepare('PRAGMA foreign_key_check').all()
  const reminder = database
    .prepare(
      `SELECT id,item_id AS itemId,version,state,due_at AS dueAt,record_json AS recordJson
       FROM reminders WHERE id=?`
    )
    .get(reminderId)
  if (!reminder || reminder.itemId !== itemId || Number(reminder.version) !== 9) {
    throw new Error('REMINDER_V9_IDENTITY_MISMATCH')
  }
  const members = database
    .prepare(
      `SELECT group_id AS groupId,reminder_id AS reminderId,version
       FROM reminder_notification_members
       WHERE reminder_id=? ORDER BY version`
    )
    .all(reminderId)
    .map((row) => ({
      groupId: row.groupId,
      reminderId: row.reminderId,
      version: Number(row.version)
    }))
  const activations = database
    .prepare(
      `SELECT identity FROM reminder_activations
       WHERE identity LIKE ? ORDER BY identity`
    )
    .all(`${reminderId}:%`)
    .map((row) => row.identity)
  report = {
    scope: 'release-v6 synthetic reminder version-9 state after user physical click failure',
    observedAt: new Date().toISOString(),
    scene,
    install,
    data,
    dataSetId: dataset.dataSetId,
    schemaVersion,
    integrity: integrity.map((row) => row.integrity_check),
    foreignKeyViolations: foreignKeys.length,
    reminder: {
      id: reminder.id,
      itemId: reminder.itemId,
      version: Number(reminder.version),
      state: reminder.state,
      dueAt: reminder.dueAt,
      recordJsonSha256: createHash('sha256')
        .update(reminder.recordJson)
        .digest('hex')
        .toUpperCase()
    },
    notificationMembers: members,
    activations,
    expectedCurrentActivationIdentity: `${reminderId}:9`,
    currentActivationPresent: activations.includes(`${reminderId}:9`),
    providerCalls: 0,
    recordBodySaved: false
  }
  if (
    schemaVersion !== 19 ||
    report.integrity.join(',') !== 'ok' ||
    foreignKeys.length !== 0
  ) {
    throw new Error('DATABASE_INTEGRITY_MISMATCH')
  }
} finally {
  database.close()
}

writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, {
  encoding: 'utf8',
  flag: 'wx'
})
console.log(
  JSON.stringify({
    output,
    reminder: report.reminder,
    latestMember: report.notificationMembers.at(-1),
    activations: report.activations,
    currentActivationPresent: report.currentActivationPresent
  })
)

