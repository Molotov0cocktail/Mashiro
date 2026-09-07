import console from 'node:console'
import process from 'node:process'
import { setTimeout } from 'node:timers'
import { resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const databasePath = resolve(
  'C:/Users/30910/AppData/Local/Temp/mashiro-install-full-Zbzmgp/全域 合成数据/mashiro.sqlite'
)
const reminderId = '70a8cb12-b0e3-42f6-b261-b08e6febcfb6'
const expectedVersion = 6
const deadline = Date.now() + 8 * 60 * 1000
let lastHeartbeat = 0

while (Date.now() < deadline) {
  const database = new DatabaseSync(databasePath, { readOnly: true })
  const reminder = database
    .prepare('SELECT id,version,state,due_at AS dueAt FROM reminders WHERE id=?')
    .get(reminderId)
  const member = database
    .prepare(
      `SELECT reminder_id AS reminderId,version AS reminderVersion,group_id AS groupId
       FROM reminder_notification_members WHERE reminder_id=? ORDER BY version DESC LIMIT 1`
    )
    .get(reminderId)
  database.close()
  if (!reminder || Number(reminder.version) !== expectedVersion) {
    throw new Error('REMINDER_VERSION_CHANGED')
  }
  if (reminder.state !== 'SCHEDULED') {
    console.log(
      JSON.stringify({
        observedAt: new Date().toISOString(),
        reminder: {
          id: reminder.id,
          version: Number(reminder.version),
          state: reminder.state,
          dueAt: reminder.dueAt
        },
        notificationMember: member
          ? {
              reminderId: member.reminderId,
              reminderVersion: Number(member.reminderVersion),
              groupId: member.groupId
            }
          : null
      })
    )
    process.exit(0)
  }
  if (Date.now() - lastHeartbeat >= 45_000) {
    console.log(
      JSON.stringify({
        observedAt: new Date().toISOString(),
        waiting: true,
        version: Number(reminder.version),
        state: reminder.state,
        dueAt: reminder.dueAt
      })
    )
    lastHeartbeat = Date.now()
  }
  await new Promise((resolveWait) => setTimeout(resolveWait, 2000))
}

throw new Error('REMINDER_DISPATCH_TIMEOUT')
