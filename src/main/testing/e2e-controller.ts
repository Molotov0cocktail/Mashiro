import { app, type BrowserWindow } from 'electron'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AssistantSnapshot } from '../../shared/assistant-contract.js'
import type { DataRoot } from '../data/data-root.js'
import { secureWebPreferences } from '../app/create-window.js'

const seedScript = `
(async () => {
  const api = window.mashiro.assistants
  let result = await api.list()
  if (!result.ok || result.data.stateRevision !== 0) throw new Error('seed-not-empty')
  result = await api.create({ protocolVersion: 1, displayName: 'Mashiro', expectedStateRevision: 0 })
  if (!result.ok) throw new Error(result.error.code)
  const firstId = result.data.assistants[0].id
  result = await api.create({ protocolVersion: 1, displayName: 'Second', expectedStateRevision: 1 })
  if (!result.ok) throw new Error(result.error.code)
  const second = result.data.assistants.find((item) => item.id !== firstId)
  result = await api.switch({ protocolVersion: 1, assistantId: second.id, expectedStateRevision: 2 })
  if (!result.ok) throw new Error(result.error.code)
  result = await api.rename({ protocolVersion: 1, assistantId: second.id, displayName: '雪', expectedAssistantVersion: 1, expectedStateRevision: 3 })
  if (!result.ok) throw new Error(result.error.code)
  result = await api.setPrimary({ protocolVersion: 1, assistantId: second.id, expectedAssistantVersion: 2, expectedStateRevision: 4 })
  if (!result.ok) throw new Error(result.error.code)
  result = await api.switch({ protocolVersion: 1, assistantId: firstId, expectedStateRevision: 5 })
  if (!result.ok) throw new Error(result.error.code)
  result = await api.archive({ protocolVersion: 1, assistantId: firstId, expectedAssistantVersion: 1, expectedStateRevision: 6 })
  if (!result.ok) throw new Error(result.error.code)
  return result.data
})()
`

const verifyScript = `
(async () => {
  const result = await window.mashiro.assistants.list()
  if (!result.ok) throw new Error(result.error.code)
  return result.data
})()
`

export async function runE2ePhase(window: BrowserWindow, dataRoot: DataRoot): Promise<void> {
  if (!dataRoot.resultsDirectory || !dataRoot.runId || !dataRoot.phase) return
  const snapshot = (await window.webContents.executeJavaScript(
    dataRoot.phase === 'seed' ? seedScript : verifyScript,
    false
  )) as AssistantSnapshot
  const result = {
    runId: dataRoot.runId,
    phase: dataRoot.phase,
    pid: process.pid,
    processType: process.type,
    electron: process.versions.electron,
    node: process.versions.node,
    sqlite: process.versions.sqlite,
    security: secureWebPreferences,
    snapshot
  }
  writeFileSync(
    join(dataRoot.resultsDirectory, `${dataRoot.phase}.json`),
    JSON.stringify(result, null, 2),
    {
      encoding: 'utf8',
      flag: 'wx'
    }
  )
  setImmediate(() => app.quit())
}
