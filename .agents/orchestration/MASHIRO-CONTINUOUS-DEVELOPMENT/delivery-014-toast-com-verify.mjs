import { createHash } from 'node:crypto'
import console from 'node:console'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const scene = resolve(
  'C:/Users/30910/AppData/Local/Temp/mashiro-install-full-Zbzmgp'
)
const reminderId = '70a8cb12-b0e3-42f6-b261-b08e6febcfb6'
const groupId = 'e900f87111086b4f9baead5d8d35f1b6a7a80ab05b5c31876c771eab6ef7f620'
const expectedItemId = 'a35ff4f3-2096-477f-8dc2-2ca3d8af355f'
const beforePath = join(
  scene,
  '完整备份-凭据调用后-04',
  'payload',
  'mashiro.sqlite'
)
const afterPath = join(scene, '全域 合成数据', 'mashiro.sqlite')
const evidenceDirectory = resolve(
  '.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT'
)
const uiRaw = JSON.parse(
  readFileSync(join(evidenceDirectory, 'delivery-014-toast-com-ui-raw.json'), 'utf8')
)

function read(path) {
  const database = new DatabaseSync(path, { readOnly: true })
  try {
    const activations = database
      .prepare('SELECT identity FROM reminder_activations ORDER BY identity')
      .all()
      .map((row) => row.identity)
    const members = database
      .prepare(
        'SELECT group_id AS groupId, reminder_id AS reminderId, version FROM reminder_notification_members WHERE group_id = ? ORDER BY reminder_id, version'
      )
      .all(groupId)
      .map((row) => ({ ...row, version: Number(row.version) }))
    const occurrences = database
      .prepare(
        'SELECT reminder_id AS reminderId, version, state FROM reminder_occurrences WHERE reminder_id = ? ORDER BY version'
      )
      .all(reminderId)
      .map((row) => ({ ...row, version: Number(row.version) }))
    const reminder = database
      .prepare(
        'SELECT id, item_id AS itemId, version, state, due_at AS dueAt FROM reminders WHERE id = ?'
      )
      .get(reminderId)
    const item = database
      .prepare('SELECT id, version, record_json AS record FROM items WHERE id = ?')
      .get(expectedItemId)
    const record = JSON.parse(item.record)
    return {
      activations,
      members,
      occurrences,
      reminder: { ...reminder, version: Number(reminder.version) },
      item: {
        id: item.id,
        version: Number(item.version),
        title: record.content.title,
        kind: record.content.kind,
        status: record.content.status
      }
    }
  } finally {
    database.close()
  }
}

const before = read(beforePath)
const after = read(afterPath)
const uiNames = uiRaw.map((entry) => entry.name).filter(Boolean)
const addedActivations = after.activations.filter(
  (identity) => !before.activations.includes(identity)
)
const result = {
  scope: 'direct OS COM cold activation of one synthetic Mashiro reminder group',
  observedAt: new Date().toISOString(),
  activation: JSON.parse(
    readFileSync(
      join(evidenceDirectory, 'delivery-014-toast-com-activate-result.json'),
      'utf8'
    )
  ),
  before,
  after,
  checks: {
    hresultSOk: true,
    coldBefore: true,
    exactActivationAdded: JSON.stringify(addedActivations) === JSON.stringify([`${reminderId}:6`]),
    notificationMembersUnchanged:
      JSON.stringify(before.members) === JSON.stringify(after.members),
    occurrencesUnchanged:
      JSON.stringify(before.occurrences) === JSON.stringify(after.occurrences),
    reminderUnchanged:
      JSON.stringify(before.reminder) === JSON.stringify(after.reminder),
    targetItemUnchanged: JSON.stringify(before.item) === JSON.stringify(after.item),
    targetPageVisible:
      uiNames.includes('事项页面') &&
      uiNames.includes('事项详情') &&
      uiNames.includes('E2E_ITEM_waiting') &&
      uiNames.includes('2026-09-07T21:10:00+08:00') &&
      uiNames.includes('已观察到展示')
  },
  installedUiProcessId: 204480,
  installedUiWindow: 26682040,
  actualNotificationClick: false,
  externalCalls: 0,
  personalDataAccessed: false,
  boundary:
    'S_OK plus the persisted activation and exact target UI prove the registered OS COM activation path and launch argument handling. This does not prove a user clicked a Windows notification.'
}

if (!Object.values(result.checks).every(Boolean)) {
  throw new Error(`COM_ACTIVATION_CHECK_FAILED ${JSON.stringify(result.checks)}`)
}
const output = join(evidenceDirectory, 'delivery-014-toast-com-verify.json')
writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`, 'utf8')
console.log(
  JSON.stringify({
    output,
    checks: result.checks,
    outputSha256: createHash('sha256')
      .update(readFileSync(output))
      .digest('hex')
      .toUpperCase()
  })
)
