import { app, type BrowserWindow } from 'electron'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AssistantSnapshot } from '../../shared/assistant-contract.js'
import type { ProviderSnapshot } from '../../shared/provider-contract.js'
import type { TransportRequest, TransportResult } from '../provider/chat-completions-transport.js'
import type { DataRoot } from '../data/data-root.js'
import { secureWebPreferences } from '../app/create-window.js'

export async function e2eProviderTransport(request: TransportRequest): Promise<TransportResult> {
  if (
    request.baseUrl !== 'https://open.bigmodel.cn/api/paas/v4' ||
    request.model !== 'GLM-5.3-FLASH' ||
    !request.apiKey.startsWith('e2e-')
  ) {
    return { status: 'failed', text: '', usage: null, error: 'configuration' }
  }
  const text = `messages=${request.messages.length}`
  if (request.stream) request.onDelta?.(text)
  return {
    status: 'completed',
    text,
    usage: { promptTokens: 2, completionTokens: 1, totalTokens: 3 }
  }
}

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

  const provider = window.mashiro.provider
  let providerResult = await provider.saveConnection({
    protocolVersion: 1,
    displayName: 'BigModel synthetic',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    enabled: true
  })
  if (!providerResult.ok) throw new Error(providerResult.error.code)
  const connectionId = providerResult.data.connections[0].id
  providerResult = await provider.setCredential({
    protocolVersion: 1,
    connectionId,
    apiKey: 'e2e-persistent-key',
    persistence: 'persistent'
  })
  if (!providerResult.ok) throw new Error(providerResult.error.code)
  providerResult = await provider.bindAssistant({
    protocolVersion: 1,
    assistantId: second.id,
    connectionId,
    model: 'GLM-5.3-FLASH',
    expectedVersion: null
  })
  if (!providerResult.ok) throw new Error(providerResult.error.code)
  providerResult = await provider.setCredential({
    protocolVersion: 1,
    connectionId,
    apiKey: 'e2e-temporary-key',
    persistence: 'temporary'
  })
  if (!providerResult.ok) throw new Error(providerResult.error.code)
  const chat = await provider.startChat({
    protocolVersion: 1,
    requestId: crypto.randomUUID(),
    assistantId: second.id,
    text: 'synthetic seed',
    stream: true
  })
  if (!chat.ok) throw new Error(chat.error.code)
  return { assistant: result.data, provider: providerResult.data, chat: chat.data }
})()
`

const verifyScript = `
(async () => {
  const assistant = await window.mashiro.assistants.list()
  if (!assistant.ok) return { failure: { stage: 'assistant-list', code: assistant.error.code } }
  const provider = await window.mashiro.provider.list()
  if (!provider.ok) return { failure: { stage: 'provider-list', code: provider.error.code } }
  const chat = await window.mashiro.provider.startChat({
    protocolVersion: 1,
    requestId: crypto.randomUUID(),
    assistantId: assistant.data.currentAssistantId,
    text: 'synthetic verify',
    stream: false
  })
  if (!chat.ok) return { failure: { stage: 'chat', code: chat.error.code } }
  return { assistant: assistant.data, provider: provider.data, chat: chat.data }
})()
`

type E2eEvidence =
  | {
      assistant: AssistantSnapshot
      provider: ProviderSnapshot
      chat: { status: string; text: string; usage: unknown }
    }
  | { failure: { stage: string; code: string } }

export async function runE2ePhase(window: BrowserWindow, dataRoot: DataRoot): Promise<void> {
  if (!dataRoot.resultsDirectory || !dataRoot.runId || !dataRoot.phase) return
  let evidence: E2eEvidence
  try {
    evidence = (await window.webContents.executeJavaScript(
      dataRoot.phase === 'seed' ? seedScript : verifyScript,
      false
    )) as E2eEvidence
  } catch {
    evidence = { failure: { stage: 'execute', code: 'FAILED' } }
  }
  let captureFailure: { stage: string; code: string } | undefined
  if (dataRoot.phase === 'verify' && !('failure' in evidence)) {
    try {
      await window.webContents.executeJavaScript(
        `document.querySelector('.provider-panel')?.scrollIntoView({ block: 'start' })`,
        false
      )
      await new Promise((resolve) => setTimeout(resolve, 500))
      const image = await window.webContents.capturePage()
      writeFileSync(join(dataRoot.resultsDirectory, 'provider-ui.png'), image.toPNG(), {
        flag: 'wx'
      })
    } catch {
      captureFailure = { stage: 'capture', code: 'FAILED' }
    }
  }
  const result = {
    runId: dataRoot.runId,
    phase: dataRoot.phase,
    pid: process.pid,
    processType: process.type,
    electron: process.versions.electron,
    node: process.versions.node,
    sqlite: process.versions.sqlite,
    security: secureWebPreferences,
    ...('failure' in evidence
      ? { failure: evidence.failure }
      : {
          snapshot: evidence.assistant,
          provider: evidence.provider,
          chat: evidence.chat,
          ...(captureFailure ? { failure: captureFailure } : {})
        })
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
