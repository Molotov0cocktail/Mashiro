import { app, type BrowserWindow } from 'electron'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AssistantSnapshot } from '../../shared/assistant-contract.js'
import type { ProviderSnapshot } from '../../shared/provider-contract.js'
import type { TimelineSnapshot } from '../../shared/timeline-contract.js'
import type { TransportRequest, TransportResult } from '../provider/chat-completions-transport.js'
import type { DataRoot } from '../data/data-root.js'
import { secureWebPreferences } from '../app/create-window.js'

type TransportEvidence = {
  count: number
  requests: {
    credential: 'temporary' | 'persistent'
    stream: boolean
    messages: { role: string; content: string }[]
  }[]
}
const transportRequests: TransportEvidence['requests'] = []

export function e2eTransportEvidence(): TransportEvidence {
  return {
    count: transportRequests.length,
    requests: transportRequests.map((request) => ({
      credential: request.credential,
      stream: request.stream,
      messages: request.messages.map((message) => ({ ...message }))
    }))
  }
}

export async function e2eProviderTransport(request: TransportRequest): Promise<TransportResult> {
  if (
    request.baseUrl !== 'https://open.bigmodel.cn/api/paas/v4' ||
    request.model !== 'GLM-5.3-FLASH' ||
    !request.apiKey.startsWith('e2e-')
  ) {
    return { status: 'failed', text: '', usage: null, error: 'configuration' }
  }
  const credential =
    request.apiKey === 'e2e-temporary-key'
      ? 'temporary'
      : request.apiKey === 'e2e-persistent-key'
        ? 'persistent'
        : null
  if (!credential) return { status: 'failed', text: '', usage: null, error: 'configuration' }
  transportRequests.push({
    credential,
    stream: request.stream,
    messages: request.messages.map((message) => ({ ...message }))
  })
  const input = request.messages.at(-1)?.content
  if (input === 'E2E_PENDING_NORMAL') {
    request.onDelta?.('E2E_PARTIAL_NORMAL')
    return await new Promise((resolve) => {
      const interrupted = (): void =>
        resolve({
          status: 'interrupted',
          text: 'E2E_PARTIAL_NORMAL',
          usage: null,
          error: 'temporary'
        })
      if (request.signal?.aborted) interrupted()
      else request.signal?.addEventListener('abort', interrupted, { once: true })
    })
  }
  const responses: Record<string, string> = {
    E2E_NORMAL_USER: 'E2E_NORMAL_ASSISTANT',
    E2E_SAVED_TEMP_USER: 'E2E_SAVED_TEMP_ASSISTANT',
    E2E_UNSAVED_TEMP_MARKER: 'E2E_UNSAVED_TEMP_REPLY_MARKER',
    E2E_VERIFY_USER: 'E2E_VERIFY_ASSISTANT'
  }
  const text = input ? responses[input] : undefined
  if (!text) return { status: 'failed', text: '', usage: null, error: 'configuration' }
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
  const timeline = window.mashiro.timeline
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

  const permission = await timeline.permissions({protocolVersion:1,assistantId:second.id})
  if(!permission.ok) throw new Error(permission.error.code)
  const grant=await timeline.setPermissions({
    protocolVersion:1,assistantId:second.id,
    connectionId:permission.data.connectionId,endpointFingerprint:permission.data.endpointFingerprint,
    expectedVersion:permission.data.version,readHistory:true,sendHistory:true
  })
  if(!grant.ok) throw new Error(grant.error.code)
  const normalChat = await provider.startChat({
    protocolVersion: 1,
    requestId: crypto.randomUUID(),
    assistantId: second.id,
    text: 'E2E_NORMAL_USER',
    mode: 'normal',
    stream: false
  })
  if (!normalChat.ok) throw new Error(normalChat.error.code)
  const temporarySavedChat = await provider.startChat({
    protocolVersion: 1,
    requestId: crypto.randomUUID(),
    assistantId: second.id,
    text: 'E2E_SAVED_TEMP_USER',
    mode: 'temporary',
    stream: false
  })
  if (!temporarySavedChat.ok) throw new Error(temporarySavedChat.error.code)
  const savedTemporary = await timeline.saveTemporary({
    protocolVersion: 1,
    assistantId: second.id
  })
  if (!savedTemporary.ok) throw new Error(savedTemporary.error.code)
  const temporaryUnsavedChat = await provider.startChat({
    protocolVersion: 1,
    requestId: crypto.randomUUID(),
    assistantId: second.id,
    text: 'E2E_UNSAVED_TEMP_MARKER',
    mode: 'temporary',
    stream: false
  })
  if (!temporaryUnsavedChat.ok) throw new Error(temporaryUnsavedChat.error.code)

  const pendingRequestId = crypto.randomUUID()
  const deltaSeen = new Promise((resolve) => {
    const remove = provider.onEvent((event) => {
      if (event.type === 'delta' && event.requestId === pendingRequestId) {
        remove()
        resolve(event.text)
      }
    })
  })
  const pending = provider.startChat({
    protocolVersion: 1,
    requestId: pendingRequestId,
    assistantId: second.id,
    text: 'E2E_PENDING_NORMAL',
    mode: 'normal',
    stream: true
  })
  pending.catch(() => undefined)
  const pendingPartial = await deltaSeen
  const timelineBeforeClose = await timeline.read({
    protocolVersion: 1,
    assistantId: second.id,
    mode: 'normal'
  })
  if (!timelineBeforeClose.ok) throw new Error(timelineBeforeClose.error.code)
  const temporaryBeforeClose = await timeline.read({
    protocolVersion: 1,
    assistantId: second.id,
    mode: 'temporary'
  })
  if (!temporaryBeforeClose.ok) throw new Error(temporaryBeforeClose.error.code)
  return {
    assistant: result.data,
    provider: providerResult.data,
    historyPermission: grant.data,
    normalChat: normalChat.data,
    temporarySavedChat: temporarySavedChat.data,
    temporaryUnsavedChat: temporaryUnsavedChat.data,
    savedTemporary: savedTemporary.data,
    timelineBeforeClose: timelineBeforeClose.data,
    temporaryBeforeClose: temporaryBeforeClose.data,
    pendingPartial
  }
})()
`

const verifyRestoreScript = `
(async () => {
  const assistant = await window.mashiro.assistants.list()
  if (!assistant.ok) throw new Error(assistant.error.code)
  const provider = await window.mashiro.provider.list()
  if (!provider.ok) throw new Error(provider.error.code)
  const timelineRestored = await window.mashiro.timeline.read({
    protocolVersion: 1,
    assistantId: assistant.data.currentAssistantId,
    mode: 'normal'
  })
  if (!timelineRestored.ok) throw new Error(timelineRestored.error.code)
  const temporaryRestored = await window.mashiro.timeline.read({
    protocolVersion: 1,
    assistantId: assistant.data.currentAssistantId,
    mode: 'temporary'
  })
  if (!temporaryRestored.ok) throw new Error(temporaryRestored.error.code)
  const historyPermission=await window.mashiro.timeline.permissions({protocolVersion:1,assistantId:assistant.data.currentAssistantId})
  if(!historyPermission.ok) throw new Error(historyPermission.error.code)
  const historyPage=await window.mashiro.timeline.query({protocolVersion:1,assistantId:assistant.data.currentAssistantId,query:'E2E_NORMAL'})
  if(!historyPage.ok) throw new Error(historyPage.error.code)
  return {
    historyPermission:historyPermission.data,
    historyPage:historyPage.data,
    assistant: assistant.data,
    provider: provider.data,
    timelineRestored: timelineRestored.data,
    temporaryRestored: temporaryRestored.data
  }
})()
`

const verifySendScript = `
(async () => {
  const assistant = await window.mashiro.assistants.list()
  if (!assistant.ok) throw new Error(assistant.error.code)
  const history=await window.mashiro.timeline.read({protocolVersion:1,assistantId:assistant.data.currentAssistantId,mode:'normal'})
  if(!history.ok)throw new Error(history.error.code)
  const requestIds=history.data.messages.filter(row=>row.role==='assistant' && row.status==='completed').map(row=>row.requestId)
  const chat = await window.mashiro.provider.startChat({
    context:{kind:'selected',requestIds},
    protocolVersion: 1,
    requestId: crypto.randomUUID(),
    assistantId: assistant.data.currentAssistantId,
    text: 'E2E_VERIFY_USER',
    mode: 'normal',
    stream: false
  })
  if (!chat.ok) throw new Error(chat.error.code)
  const timelineAfterSend = await window.mashiro.timeline.read({
    protocolVersion: 1,
    assistantId: assistant.data.currentAssistantId,
    mode: 'normal'
  })
  if (!timelineAfterSend.ok) throw new Error(timelineAfterSend.error.code)
  return { chat: chat.data, timelineAfterSend: timelineAfterSend.data }
})()
`

type SeedEvidence = {
  historyPermission: import('../../shared/timeline-contract.js').HistoryPermissions
  assistant: AssistantSnapshot
  provider: ProviderSnapshot
  normalChat: { status: string; text: string; usage: unknown }
  temporarySavedChat: { status: string; text: string; usage: unknown }
  temporaryUnsavedChat: { status: string; text: string; usage: unknown }
  savedTemporary: TimelineSnapshot
  timelineBeforeClose: TimelineSnapshot
  temporaryBeforeClose: TimelineSnapshot
  pendingPartial: string
}
type VerifyEvidence = {
  historyPermission: import('../../shared/timeline-contract.js').HistoryPermissions
  historyPage: { assistantId: string; messages: unknown[]; nextCursor: number | null }
  assistant: AssistantSnapshot
  provider: ProviderSnapshot
  timelineRestored: TimelineSnapshot
  temporaryRestored: TimelineSnapshot
  transportBeforeExplicit: TransportEvidence
  chat: { status: string; text: string; usage: unknown }
  timelineAfterSend: TimelineSnapshot
}
async function execute<T>(window: BrowserWindow, script: string): Promise<T> {
  return (await window.webContents.executeJavaScript(script, false)) as T
}

export async function runE2ePhase(window: BrowserWindow, dataRoot: DataRoot): Promise<void> {
  if (!dataRoot.resultsDirectory || !dataRoot.runId || !dataRoot.phase) return
  let evidence: SeedEvidence | VerifyEvidence | { failure: { stage: string; code: string } }
  try {
    if (dataRoot.phase === 'seed') {
      evidence = await execute<SeedEvidence>(window, seedScript)
    } else {
      const restored = await execute<
        Omit<VerifyEvidence, 'transportBeforeExplicit' | 'chat' | 'timelineAfterSend'>
      >(window, verifyRestoreScript)
      const transportBeforeExplicit = e2eTransportEvidence()
      const sent = await execute<Pick<VerifyEvidence, 'chat' | 'timelineAfterSend'>>(
        window,
        verifySendScript
      )
      evidence = { ...restored, transportBeforeExplicit, ...sent }
    }
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
    transportAfterExplicit: e2eTransportEvidence(),
    ...('failure' in evidence ? { failure: evidence.failure } : evidence),
    ...(captureFailure ? { failure: captureFailure } : {})
  }
  writeFileSync(
    join(dataRoot.resultsDirectory, `${dataRoot.phase}.json`),
    JSON.stringify(result, null, 2),
    { encoding: 'utf8', flag: 'wx' }
  )
  setImmediate(() => app.quit())
}
