import { runStewardE2e } from './e2e-steward.js'
import { runBackgroundE2e } from './e2e-background.js'
import {
  canUseE2eReminderPlatform,
  createE2eReminderPlatform,
  runReminderE2e
} from './e2e-reminder.js'
export { canUseE2eReminderPlatform, createE2eReminderPlatform }
import { runDailyE2e } from './e2e-daily.js'
import { app, type BrowserWindow } from 'electron'
import { seedProfileUiScript, verifyProfileUiScript } from './e2e-profile-scripts.js'
import { seedItemsScript, restoreItemsScript, verifyItemsUiScript } from './e2e-item-scripts.js'
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
    messages: request.messages.map((message) => ({ role: message.role, content: message.content }))
  })
  if (request.messages[0]?.content.startsWith('你是当前助手的共享增量识别角色。')) {
    if (request.maxOutputTokens !== 2048) throw Error('steward-output-limit')
    return {
      status: 'completed',
      text: JSON.stringify({
        sharedCandidates: [
          {
            title: 'E2E仓储候选',
            markdown: 'E2E_STEWARD_ACCEPTED：合成正常对话偏好。',
            nature: 'faithful-summary',
            sourceHandles: ['source0']
          }
        ]
      }),
      usage: { promptTokens: 14, completionTokens: 6, totalTokens: 20 }
    }
  }
  if (request.messages[0]?.content.startsWith('你是内置仓储员。')) {
    if (request.maxOutputTokens !== 2048) throw Error('steward-output-limit')
    const input = JSON.parse(request.messages[1]!.content)
    if (input.targets.length !== 0 || !input.entry.markdown.includes('E2E_STEWARD_ACCEPTED'))
      throw Error('steward-source-range')
    return {
      status: 'completed',
      text: JSON.stringify({
        slots: [
          {
            action: 'remember',
            title: 'E2E仓储结果',
            markdown: input.entry.markdown,
            nature: 'faithful-summary',
            branchTitle: 'E2E仓储分支',
            targetHandle: null,
            sourceHandles: ['entry']
          }
        ]
      }),
      usage: { promptTokens: 15, completionTokens: 7, totalTokens: 22 }
    }
  }
  if (
    request.messages[0]?.content.startsWith('你是现有助手的受限后台功能角色') &&
    request.messages[0]?.content.includes('当前功能 observation')
  ) {
    if (request.maxOutputTokens !== 1200 || request.stream || request.tools !== undefined)
      throw Error('daily-transport-boundary')
    const input = JSON.parse(request.messages[1]!.content) as {
      sources: { handle: string; content: string; independentRoots: number }[]
    }
    if (
      input.sources.length !== 2 ||
      input.sources.some(
        (source, index) =>
          source.handle !== `source${index}` ||
          source.independentRoots !== 1 ||
          !input.sources.some((candidate) =>
            candidate.content.includes(`E2E_DAILY_EVENT_${index + 1}`)
          )
      )
    )
      throw Error('daily-source-range')
    return {
      status: 'completed',
      text: JSON.stringify({
        sections: [
          {
            title: 'E2E日常报告',
            markdown: 'E2E_DAILY_REPORT：两条独立合成事件已进入本次观察。',
            nature: 'inference',
            sourceHandles: ['source0', 'source1']
          }
        ],
        observations: [
          {
            title: 'E2E_DAILY_INFERENCE',
            markdown: '两条合成事件可能反映一个仍需用户核验的共同点。',
            nature: 'inference',
            sourceHandles: ['source0', 'source1']
          }
        ],
        proposals: []
      }),
      usage: { promptTokens: 18, completionTokens: 6, totalTokens: 24 }
    }
  }
  if (request.messages[0]?.content.startsWith('你是当前助手的章节整理角色。')) {
    if (request.maxOutputTokens !== 2048) throw Error('background-output-limit')
    return {
      status: 'completed',
      text: JSON.stringify({
        title: 'E2E章节',
        summary: 'E2E_BACKGROUND_ACCEPTED：用户与助手的合成正常对话记录。',
        unfinishedTopics: []
      }),
      usage: { promptTokens: 12, completionTokens: 8, totalTokens: 20 }
    }
  }
  if (request.messages.at(-1)?.content === 'E2E_BACKGROUND_CONTEXT') {
    if (
      !request.messages.some(
        (message) =>
          message.role === 'system' && message.content.includes('E2E_BACKGROUND_ACCEPTED')
      )
    )
      throw Error('background-selected-summary')
    const text = 'E2E_BACKGROUND_CONTEXT_REPLY'
    if (request.stream) request.onDelta?.(text)
    return {
      status: 'completed',
      text,
      usage: { promptTokens: 12, completionTokens: 8, totalTokens: 20 }
    }
  }
  if (request.tools && request.tools !== 'off') {
    const last = request.messages.at(-1)
    if (last?.role === 'tool') {
      const previous = request.messages.at(-2)
      if (
        previous?.reasoning_content !== 'E2E_TOOL_PRIVATE_REASONING' ||
        previous.tool_calls?.[0]?.id !== last.tool_call_id
      )
        throw new Error('tool-protocol')
      const clock = JSON.parse(last.content) as { utc: string }
      if (!Number.isFinite(Date.parse(clock.utc))) throw new Error('tool-clock')
      if (request.stream) request.onDelta?.('E2E_TOOL_REPLY')
      return {
        status: 'completed',
        text: 'E2E_TOOL_REPLY',
        usage: null,
        toolCalls: [],
        finishReason: 'stop'
      }
    }
    return {
      status: 'completed',
      text: '',
      usage: null,
      reasoning: 'E2E_TOOL_PRIVATE_REASONING',
      toolCalls: [
        {
          id: 'e2e-clock',
          type: 'function',
          function: { name: 'get_current_time', arguments: '{}' }
        }
      ],
      finishReason: 'tool_calls'
    }
  }
  const input = request.messages.at(-1)?.content
  if (input === 'E2E_VERIFY_USER') {
    const index = request.messages.findIndex((message) => message.role === 'tool')
    if (
      index < 1 ||
      request.messages[index - 1]?.tool_calls?.[0]?.id !== request.messages[index]?.tool_call_id ||
      request.messages.some((message) => message.reasoning_content !== undefined)
    )
      throw new Error('closed-tool-context')
  }
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
  result = await api.rename({ protocolVersion: 1, assistantId: second.id, displayName: '雪', persona: 'E2E_PROFILE_BEFORE', avatarKey: 'leaf', expectedAssistantVersion: 1, expectedStateRevision: 3 })
  if (!result.ok) throw new Error(result.error.code)
  result = await api.setPrimary({ protocolVersion: 1, assistantId: second.id, expectedAssistantVersion: 2, expectedStateRevision: 4 })
  if (!result.ok) throw new Error(result.error.code)
  result = await api.switch({ protocolVersion: 1, assistantId: firstId, expectedStateRevision: 5 })
  if (!result.ok) throw new Error(result.error.code)
  result = await api.archive({ protocolVersion: 1, assistantId: firstId, expectedAssistantVersion: 1, expectedStateRevision: 6 })
  if (!result.ok) throw new Error(result.error.code)


  result = await api.create({protocolVersion:1,displayName:'清理测试助手',expectedStateRevision:result.data.stateRevision})
  if(!result.ok) throw new Error('retention-assistant')
  const cleanupAssistant=result.data.assistants.find(item=>item.id!==firstId&&item.id!==second.id)
  const retention=window.mashiro.retention
  const retentionMemory=window.mashiro.memory
  const cleanupMemory=await retentionMemory.mutate({protocolVersion:1,assistantId:cleanupAssistant.id,commandId:crypto.randomUUID(),mutation:{action:'remember',targetId:null,expectedVersion:null,kind:'continuity',scope:'assistant',title:'待清理的合成记录',markdown:'E2E_RETENTION_REMOVED_BODY',nature:'user-statement',event:null}})
  if(!cleanupMemory.ok) throw new Error('retention-memory')
  let cleanupVersion=1
  for(const zone of ['staging','trash','persistent']) {
    const meter=await retention.overview({protocolVersion:1,assistantId:cleanupAssistant.id})
    if(!meter.ok)throw new Error('retention-meter')
    const moved=await retention.move({protocolVersion:1,assistantId:cleanupAssistant.id,commandId:crypto.randomUUID(),id:cleanupMemory.data.objectId,expectedVersion:cleanupVersion,expectedEpoch:meter.data.epoch,zone})
    if(!moved.ok)throw new Error('retention-move')
    cleanupVersion=moved.data.objectVersion
  }
  const priorPreview=await retention.preview({protocolVersion:1,assistantId:cleanupAssistant.id,intent:'delete-representation',target:{type:'memories',objects:[{id:cleanupMemory.data.objectId,version:cleanupVersion}]}})
  if(!priorPreview.ok||priorPreview.data.blockers.length)throw new Error('retention-prior-preview')
  const priorCleanup=await retention.confirm({protocolVersion:1,assistantId:cleanupAssistant.id,commandId:crypto.randomUUID(),previewId:priorPreview.data.id,nonce:priorPreview.data.nonce,accept:true})
  if(!priorCleanup.ok)throw new Error('retention-prior-confirm')
  let priorJobs
  for(let n=0;n<100;n++){
    priorJobs=await retention.jobs({protocolVersion:1})
    if(!priorJobs.ok)throw new Error('retention-prior-jobs')
    if(priorJobs.data.jobs.find(job=>job.id===priorCleanup.data.jobId)?.state==='COMPLETED')break
    await new Promise(resolve=>setTimeout(resolve,20))
  }
  if(priorJobs.data.jobs.find(job=>job.id===priorCleanup.data.jobId)?.state!=='COMPLETED')throw new Error('retention-prior-drain')
  const cleanupPreview=await retention.preview({protocolVersion:1,assistantId:cleanupAssistant.id,intent:'purge-assistant',target:{type:'assistant',replacementAssistantId:second.id}})
  if(!cleanupPreview.ok||cleanupPreview.data.blockers.length||!cleanupPreview.data.memoryIds.includes(cleanupMemory.data.objectId))throw new Error('retention-preview')
  const cleanupConfirmed=await retention.confirm({protocolVersion:1,assistantId:cleanupAssistant.id,commandId:crypto.randomUUID(),previewId:cleanupPreview.data.id,nonce:cleanupPreview.data.nonce,accept:true})
  if(!cleanupConfirmed.ok)throw new Error('retention-confirm')
  let cleanupJobs
  for(let attempt=0;attempt<100;attempt++){
    cleanupJobs=await retention.jobs({protocolVersion:1})
    if(!cleanupJobs.ok)throw new Error('retention-jobs')
    if(cleanupJobs.data.jobs.find(job=>job.id===cleanupConfirmed.data.jobId)?.state==='COMPLETED')break
    await new Promise(resolve=>setTimeout(resolve,20))
  }
  if(cleanupJobs.data.jobs.find(job=>job.id===cleanupConfirmed.data.jobId)?.state!=='COMPLETED')throw new Error('retention-drain')
  const retentionEvidence={assistantId:cleanupAssistant.id,memoryId:cleanupMemory.data.objectId,jobId:cleanupConfirmed.data.jobId,priorJobId:priorCleanup.data.jobId,movedVersion:cleanupVersion,state:'COMPLETED'}
  result=await api.list()
  if(!result.ok||result.data.assistants.some(item=>item.id===cleanupAssistant.id))throw new Error('retention-tombstone')

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

  const toolRequestId=crypto.randomUUID()
  const toolChat=await provider.startChat({protocolVersion:1,requestId:toolRequestId,assistantId:second.id,text:'E2E_TOOL_NORMAL',mode:'normal',context:{kind:'none'},tools:'clock',stream:true})
  if(!toolChat.ok||toolChat.data.text!=='E2E_TOOL_REPLY')throw new Error('tool-chat')
  const toolOperations=await provider.tools({protocolVersion:1,assistantId:second.id,mode:'normal',requestId:toolRequestId})
  if(!toolOperations.ok||toolOperations.data.operations.length!==1||toolOperations.data.operations[0].state!=='SUCCEEDED')throw new Error('tool-operations')
  const temporaryTool=await provider.startChat({protocolVersion:1,requestId:crypto.randomUUID(),assistantId:second.id,text:'E2E_TOOL_TEMP_UNSAVED',mode:'temporary',tools:'clock',stream:false})
  if(!temporaryTool.ok)throw new Error('temporary-tool')
  const memory = window.mashiro.memory
  for (const scope of ['global','assistant']) {
    const permission = await memory.permissions({protocolVersion:1,assistantId:second.id,scope})
    if(!permission.ok) throw new Error('memory-permission')
    const saved = await memory.setPermissions({protocolVersion:1,assistantId:second.id,scope,expectedVersion:permission.data.version,read:true,write:true,writeInferences:true,receive:true})
    if(!saved.ok) throw new Error('memory-grant')
  }
  let retentionPolicy
  for(let attempt=0;attempt<100;attempt++){
    retentionPolicy=await retention.policy({protocolVersion:1,assistantId:second.id})
    if(!retentionPolicy.ok)throw new Error('retention-policy')
    if(retentionPolicy.data.audit.state==='COMPLETE')break
    await new Promise(resolve=>setTimeout(resolve,20))
  }
  if(retentionPolicy.data.audit.state!=='COMPLETE')throw new Error('retention-audit')
  const memoryDraft={action:'remember',targetId:null,expectedVersion:null,kind:'user',scope:'global',title:'E2E_MEMORY',markdown:'E2E_MEMORY_ORIGINAL',nature:'user-statement',event:null}
  const memorySaved=await memory.mutate({protocolVersion:1,assistantId:second.id,commandId:crypto.randomUUID(),mutation:memoryDraft})
  if(!memorySaved.ok) throw new Error('memory-save')
  const memoryCorrected=await memory.mutate({protocolVersion:1,assistantId:second.id,commandId:crypto.randomUUID(),mutation:{...memoryDraft,action:'correct',targetId:memorySaved.data.objectId,expectedVersion:1,markdown:'E2E_MEMORY_CORRECTED'}})
  if(!memoryCorrected.ok) throw new Error('memory-correct')
  const memoryTrash=await memory.mutate({protocolVersion:1,assistantId:second.id,commandId:crypto.randomUUID(),mutation:{...memoryDraft,title:'E2E_MEMORY_TRASH'}})
  if(!memoryTrash.ok) throw new Error('memory-trash-save')
  const memoryDelete=await memory.mutate({protocolVersion:1,assistantId:second.id,commandId:crypto.randomUUID(),mutation:{action:'delete',targetId:memoryTrash.data.objectId,expectedVersion:1}})
  if(!memoryDelete.ok||memoryDelete.data.state!=='PENDING_CONFIRMATION'||!memoryDelete.data.impact) throw new Error('memory-delete-preview')
  const memoryConfirmed=await memory.confirm({protocolVersion:1,assistantId:second.id,confirmationId:memoryDelete.data.confirmationId,accept:true})
  if(!memoryConfirmed.ok||memoryConfirmed.data.state!=='SUCCEEDED') throw new Error('memory-delete-confirm')
  const memoryTemporary=await provider.startChat({protocolVersion:1,requestId:crypto.randomUUID(),assistantId:second.id,text:'E2E_MEMORY_TEMP_UNSAVED',mode:'temporary',tools:'clock-and-memory',stream:false})
  if(memoryTemporary.ok||memoryTemporary.error.code!=='PERMISSION_DENIED') throw new Error('memory-temporary')
  const memoryQuery=await memory.query({protocolVersion:1,assistantId:second.id})
  const memoryInspect=await memory.inspect({protocolVersion:1,assistantId:second.id,id:memorySaved.data.objectId})
  const memoryPermissions=await memory.permissions({protocolVersion:1,assistantId:second.id,scope:'global'})
  if(!memoryQuery.ok||!memoryInspect.ok||!memoryPermissions.ok) throw new Error('memory-inspect')
  const memoryEvidence={query:memoryQuery.data,inspect:memoryInspect.data,permissions:memoryPermissions.data,temporaryRejected:true}

  return {
    assistant: result.data,
    provider: providerResult.data,
    historyPermission: grant.data,
    normalChat: normalChat.data,
    temporarySavedChat: temporarySavedChat.data,
    temporaryUnsavedChat: temporaryUnsavedChat.data,
    savedTemporary: savedTemporary.data,
    retention:retentionEvidence,
    memory:memoryEvidence,
    toolOperations:toolOperations.data.operations
  }
})()
`

const pendingBeforeCloseScript = `
(async () => {
  const assistants = await window.mashiro.assistants.list()
  if (!assistants.ok || !assistants.data.currentAssistantId) throw new Error('pending-assistant')
  const assistantId = assistants.data.currentAssistantId
  const provider = window.mashiro.provider
  const timeline = window.mashiro.timeline
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
    assistantId,
    text: 'E2E_PENDING_NORMAL',
    mode: 'normal',
    stream: true
  })
  pending.catch(() => undefined)
  const pendingPartial = await deltaSeen
  const timelineBeforeClose = await timeline.read({
    protocolVersion: 1,
    assistantId,
    mode: 'normal'
  })
  if (!timelineBeforeClose.ok) throw new Error(timelineBeforeClose.error.code)
  const temporaryBeforeClose = await timeline.read({
    protocolVersion: 1,
    assistantId,
    mode: 'temporary'
  })
  if (!temporaryBeforeClose.ok) throw new Error(temporaryBeforeClose.error.code)
  const pendingRows = timelineBeforeClose.data.messages.filter(
    (message) => message.requestId === pendingRequestId
  )
  if (
    pendingRows.length !== 2 ||
    pendingRows[0].role !== 'user' ||
    pendingRows[0].status !== 'completed' ||
    pendingRows[1].role !== 'assistant' ||
    pendingRows[1].status !== 'pending'
  )
    throw new Error('pending-before-close-state')
  return {
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

  const retentionJobs=await window.mashiro.retention.jobs({protocolVersion:1})
  if(!retentionJobs.ok||retentionJobs.data.jobs.length!==2||retentionJobs.data.jobs.some(job=>job.state!=='COMPLETED')||assistant.data.assistants.some(item=>item.id===retentionJobs.data.jobs[0].assistantId))throw new Error('retention-restart')
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
  const toolOperations=await window.mashiro.provider.tools({protocolVersion:1,assistantId:assistant.data.currentAssistantId,mode:'normal'})
  const temporaryTools=await window.mashiro.provider.tools({protocolVersion:1,assistantId:assistant.data.currentAssistantId,mode:'temporary'})
  if(!toolOperations.ok||!temporaryTools.ok||temporaryTools.data.operations.length!==0)throw new Error('tool-restore')
  const historyPermission=await window.mashiro.timeline.permissions({protocolVersion:1,assistantId:assistant.data.currentAssistantId})
  if(!historyPermission.ok) throw new Error(historyPermission.error.code)
  const historyPage=await window.mashiro.timeline.query({protocolVersion:1,assistantId:assistant.data.currentAssistantId,query:'E2E_NORMAL'})
  if(!historyPage.ok) throw new Error(historyPage.error.code)
  const restoredDaily=await window.mashiro.daily.query({protocolVersion:1,assistantId:assistant.data.currentAssistantId,view:'reports',feature:'observation'})
  const dailyReport=restoredDaily.ok?restoredDaily.data.reports[0]:null
  const dailyDetail=dailyReport?await window.mashiro.daily.inspect({protocolVersion:1,assistantId:assistant.data.currentAssistantId,id:dailyReport.id,expectedVersion:dailyReport.version,governanceVersion:dailyReport.governanceVersion}):null
  if(!dailyReport||!dailyDetail?.ok||dailyDetail.data.providedSources.length!==2)throw new Error('daily-memory-evidence')
  const dailySourceMemoryIds=dailyDetail.data.providedSources.map(value=>value.source.id)
  const dailyAcceptedMemoryIds=dailyDetail.data.observations.map(value=>value.memoryId).filter(Boolean)
  const dailyMemoryIds=new Set([...dailySourceMemoryIds,...dailyAcceptedMemoryIds])
  if(dailyMemoryIds.size!==3)throw new Error('daily-memory-cardinality')
  const allMemory=await window.mashiro.memory.query({protocolVersion:1,assistantId:assistant.data.currentAssistantId})
  const restoredBackground=await window.mashiro.background.query({protocolVersion:1,assistantId:assistant.data.currentAssistantId})
  const restoredSteward=await window.mashiro.steward.query({protocolVersion:1,assistantId:assistant.data.currentAssistantId})
  const stewardMemoryId=restoredSteward.ok?restoredSteward.data.jobs.find(j=>j.role==='steward'&&j.state==='COMPLETED')?.slots[0]?.memoryId:null
  if(!stewardMemoryId||!allMemory.ok||!allMemory.data.records.some(r=>r.id===stewardMemoryId&&r.markdown.includes('E2E_STEWARD_ACCEPTED')))throw Error('steward-restored-memory')
  if(!allMemory.ok||!restoredBackground.ok||allMemory.data.records.length!==3+dailyMemoryIds.size||
    [...dailyMemoryIds].some(id=>!allMemory.data.records.some(record=>record.id===id))||
    restoredBackground.data.chapters.length!==1||
    !allMemory.data.records.some(record=>record.id===restoredBackground.data.chapters[0].memoryId))
    throw new Error('memory-background-cardinality')
  const memoryQuery=await window.mashiro.memory.query({protocolVersion:1,assistantId:assistant.data.currentAssistantId,scope:'global'})
  if(!memoryQuery.ok||memoryQuery.data.records.length!==2+dailySourceMemoryIds.length||
    !memoryQuery.data.records.some(r=>r.id===stewardMemoryId)||
    dailySourceMemoryIds.some(id=>!memoryQuery.data.records.some(record=>record.id===id)))throw new Error('memory-steward-restored-query')
  // Preserve the original memory oracle while separately proving the steward and Daily objects above.
  memoryQuery.data.records=memoryQuery.data.records.filter(r=>r.id!==stewardMemoryId&&!dailyMemoryIds.has(r.id))
  if(memoryQuery.data.records.length!==1)throw new Error('memory-restored-query')
  const memoryInspect=await window.mashiro.memory.inspect({protocolVersion:1,assistantId:assistant.data.currentAssistantId,id:memoryQuery.data.records[0].id})
  const memoryPermissions=await window.mashiro.memory.permissions({protocolVersion:1,assistantId:assistant.data.currentAssistantId,scope:'global'})
  if(!memoryInspect.ok||!memoryPermissions.ok)throw new Error('memory-restored-inspect')
  return {
    retention:{priorJobId:retentionJobs.data.jobs[0].id,jobId:retentionJobs.data.jobs[1].id,assistantId:retentionJobs.data.jobs[1].assistantId,state:retentionJobs.data.jobs[1].state},
    memory:{query:memoryQuery.data,inspect:memoryInspect.data,permissions:memoryPermissions.data,temporaryRejected:true},
    toolOperations:toolOperations.data.operations,
    historyPermission:historyPermission.data,
    historyPage:historyPage.data,
    assistant: assistant.data,
    provider: provider.data,
    timelineRestored: timelineRestored.data,
    temporaryRestored: temporaryRestored.data
  }
})()
`

const verifyMemoryUiScript = `
(async () => {
  const waitFor = async (read) => {
    for(let n=0;n<400;n++) { const value=await read(); if(value)return value; await new Promise(resolve=>setTimeout(resolve,25)) }
    throw new Error('memory-ui-timeout')
  }
  const assistants=await window.mashiro.assistants.list()
  if(!assistants.ok||!assistants.data.currentAssistantId)throw new Error('memory-ui-assistant')
  const assistantId=assistants.data.currentAssistantId
  const memory=window.mashiro.memory
  const before=await memory.query({protocolVersion:1,assistantId})
  if(!before.ok)throw new Error('memory-ui-before')
  const tab=document.querySelector('button[aria-label="记忆"]')
  if(!tab)throw new Error('memory-ui-tab')
  tab.click()
  const form=await waitFor(()=>{const value=document.querySelector('.memory-editor form');return value&&!value.closest('[hidden]')?value:null})
  const title='E2E_UI_MEMORY_DIGEST'
  const markdown='E2E_UI_BODY_'+crypto.randomUUID()
  const titleInput=form.querySelector('input')
  const bodyInput=form.querySelector('textarea')
  if(!titleInput||!bodyInput)throw new Error('memory-ui-fields')
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(titleInput,title)
  titleInput.dispatchEvent(new Event('input',{bubbles:true}))
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(bodyInput,markdown)
  bodyInput.dispatchEvent(new Event('input',{bubbles:true}))
  const submit=await waitFor(()=>{const value=form.querySelector('button[type="submit"]');return value&&!value.disabled?value:null})
  submit.click()
  const saved=await waitFor(async()=>{
    const value=await memory.query({protocolVersion:1,assistantId})
    if(!value.ok)throw new Error('memory-ui-query')
    const matches=value.data.records.filter(record=>record.title===title&&record.markdown===markdown)
    if(matches.length>1)throw new Error('memory-ui-duplicate')
    return matches.length===1?{record:matches[0],count:value.data.records.length}:null
  })
  const inspected=await memory.inspect({protocolVersion:1,assistantId,id:saved.record.id})
  if(!inspected.ok||inspected.data.receipts.length!==1||saved.count!==before.data.records.length+1)throw new Error('memory-ui-receipt')
  await waitFor(()=>Array.from(document.querySelectorAll('.memory-panel article')).some(element=>element.textContent.includes(title)&&element.textContent.includes(markdown)))
  return {enteredViaDom:true,objectsAdded:saved.count-before.data.records.length,receiptCount:inspected.data.receipts.length,objectId:saved.record.id,objectVersion:saved.record.objectVersion}
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
  profileUi: unknown
  items: unknown
  retention: unknown
  memory: unknown
  toolOperations: import('../../shared/tool-contract.js').ToolOperation[]
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
type PendingEvidence = Pick<
  SeedEvidence,
  'timelineBeforeClose' | 'temporaryBeforeClose' | 'pendingPartial'
>
type VerifyEvidence = {
  profileUi: unknown
  items: unknown
  itemsUi: unknown
  memoryUi: {
    enteredViaDom: boolean
    objectsAdded: number
    receiptCount: number
    objectId: string
    objectVersion: number
  }
  retention: unknown
  memory: unknown
  toolOperations: import('../../shared/tool-contract.js').ToolOperation[]
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

export async function runE2ePhase(
  window: BrowserWindow,
  dataRoot: DataRoot,
  restoreFromTray?: () => void
): Promise<void> {
  if (!dataRoot.resultsDirectory || !dataRoot.runId || !dataRoot.phase) return
  let stage = 'seed-core'
  let evidence: SeedEvidence | VerifyEvidence | { failure: { stage: string; code: string } }
  try {
    if (dataRoot.phase === 'seed') {
      evidence = {
        ...(await execute<SeedEvidence>(window, seedScript)),
        items: await (async () => {
          stage = 'seed-items'
          return execute(window, seedItemsScript)
        })()
      }
      stage = 'seed-renderer-refresh'
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(Error('renderer-refresh-timeout')), 10000)
        window.webContents.once('did-finish-load', () => {
          clearTimeout(timer)
          resolve()
        })
        window.webContents.reload()
      })
      stage = 'seed-profile-ui'
      const profile = await execute<{
        assistant: AssistantSnapshot
        profileUi: unknown
        profileFailure?: { phase: string; code: string }
      }>(window, seedProfileUiScript)
      if (profile.profileFailure) {
        writeFileSync(
          join(dataRoot.resultsDirectory, dataRoot.phase + '-profile-failure.json'),
          JSON.stringify(profile.profileFailure, null, 2),
          { flag: 'wx' }
        )
        writeFileSync(
          join(dataRoot.resultsDirectory, dataRoot.phase + '-profile-failure.png'),
          (await window.webContents.capturePage()).toPNG(),
          { flag: 'wx' }
        )
        stage =
          'seed-profile-ui-' + profile.profileFailure.phase + '-' + profile.profileFailure.code
        throw Error('E2E')
      }
      evidence = { ...evidence, ...profile }
    } else {
      stage = 'restore-core'
      const restored = await execute<
        Omit<
          VerifyEvidence,
          'transportBeforeExplicit' | 'chat' | 'timelineAfterSend' | 'memoryUi' | 'itemsUi'
        >
      >(window, verifyRestoreScript)
      stage = 'restore-items'
      const items = await execute(window, restoreItemsScript)
      const transportBeforeExplicit = e2eTransportEvidence()
      stage = 'send-core'
      const sent = await execute<Pick<VerifyEvidence, 'chat' | 'timelineAfterSend'>>(
        window,
        verifySendScript
      )
      stage = 'items-ui'
      const itemsUi = await execute<{ failureStage?: string }>(window, verifyItemsUiScript)
      if (itemsUi.failureStage) {
        stage = 'items-ui-' + itemsUi.failureStage
        throw Error('E2E')
      }
      await execute(
        window,
        `(async()=>{
        const tab=document.querySelector('button[aria-label="事项"]')
        if(!tab)throw Error('item-capture-tab');tab.click()
        for(let i=0;i<400;i++){
          const panel=document.querySelector('.item-panel')
          if(tab.getAttribute('aria-current')==='page' && panel && !panel.closest('[hidden]') && [...panel.querySelectorAll('article')].some(el=>el.textContent.includes('E2E_ITEM_UI_'))){
            panel.querySelectorAll('details').forEach(details=>{details.open=false});panel.scrollIntoView({block:'start'});await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);return true
          }
          await new Promise(r=>setTimeout(r,25))
        }
        throw Error('item-capture-timeout')
      })()`
      )
      writeFileSync(
        join(dataRoot.resultsDirectory, 'items-ui.png'),
        (await window.webContents.capturePage()).toPNG(),
        { flag: 'wx' }
      )
      stage = 'verify-profile-ui'
      const profile = await execute<{
        profileUi: unknown
        profileFailure?: { phase: string; code: string }
      }>(window, verifyProfileUiScript)
      if (profile.profileFailure) {
        writeFileSync(
          join(dataRoot.resultsDirectory, dataRoot.phase + '-profile-failure.json'),
          JSON.stringify(profile.profileFailure, null, 2),
          { flag: 'wx' }
        )
        writeFileSync(
          join(dataRoot.resultsDirectory, dataRoot.phase + '-profile-failure.png'),
          (await window.webContents.capturePage()).toPNG(),
          { flag: 'wx' }
        )
        stage =
          'verify-profile-ui-' + profile.profileFailure.phase + '-' + profile.profileFailure.code
        throw Error('E2E')
      }
      writeFileSync(
        join(dataRoot.resultsDirectory, 'profile-ui.png'),
        (await window.webContents.capturePage()).toPNG(),
        { flag: 'wx' }
      )
      stage = 'memory-ui'
      const memoryUi = await execute<VerifyEvidence['memoryUi']>(window, verifyMemoryUiScript)
      evidence = {
        ...restored,
        transportBeforeExplicit,
        ...sent,
        memoryUi,
        items,
        itemsUi,
        ...profile
      }
    }
  } catch {
    evidence = { failure: { stage, code: 'FAILED' } }
  }
  let captureFailure: { stage: string; code: string } | undefined
  if (dataRoot.phase === 'verify' && !('failure' in evidence)) {
    try {
      const memoryImage = await window.webContents.capturePage()
      writeFileSync(join(dataRoot.resultsDirectory, 'memory-ui.png'), memoryImage.toPNG(), {
        flag: 'wx'
      })
      await window.webContents.executeJavaScript(
        `document.querySelector('button[aria-label="对话"]')?.click()`,
        false
      )
      await new Promise((resolve) => setTimeout(resolve, 100))
      await window.webContents.executeJavaScript(
        `document.querySelector('.provider-panel')?.scrollIntoView({ block: 'start' })`,
        false
      )
      await new Promise((resolve) => setTimeout(resolve, 500))
      const image = await window.webContents.capturePage()
      writeFileSync(join(dataRoot.resultsDirectory, 'provider-ui.png'), image.toPNG(), {
        flag: 'wx'
      })
      await window.webContents.executeJavaScript(
        `(async()=>{document.querySelector('button[aria-label="设置"]')?.click();for(let n=0;n<80;n++){const target=[...document.querySelectorAll('[aria-label="设置类别"] button')].find(element=>element.textContent.trim()==='数据与存储');if(target){target.click();return true}await new Promise(resolve=>setTimeout(resolve,25))}throw Error('retention-navigation-timeout')})()`,
        false
      )
      await new Promise((resolve) => setTimeout(resolve, 500))
      const retentionImage = await window.webContents.capturePage()
      writeFileSync(join(dataRoot.resultsDirectory, 'retention-ui.png'), retentionImage.toPNG(), {
        flag: 'wx'
      })
    } catch {
      captureFailure = { stage: 'capture', code: 'FAILED' }
    }
  }
  let reminders: Awaited<ReturnType<typeof runReminderE2e>> | undefined
  if (!('failure' in evidence) && !captureFailure && restoreFromTray) {
    try {
      reminders = await runReminderE2e(window, dataRoot, restoreFromTray)
    } catch {
      captureFailure = { stage: 'reminder-native-runtime', code: 'FAILED' }
    }
  }
  // Preserve the established explicit-chat observation before the separate background scenario.
  const transportAfterExplicit = e2eTransportEvidence()
  let reportedTransportAfterExplicit = transportAfterExplicit
  let background: Awaited<ReturnType<typeof runBackgroundE2e>> | undefined
  if (!('failure' in evidence) && !captureFailure) {
    try {
      background = await runBackgroundE2e(window, dataRoot)
    } catch {
      captureFailure = { stage: 'background-dom-lifecycle', code: 'FAILED' }
    }
  }
  const transportAfterBackground = e2eTransportEvidence().count
  let steward: Awaited<ReturnType<typeof runStewardE2e>> | undefined
  if (!('failure' in evidence) && !captureFailure) {
    try {
      steward = await runStewardE2e(window, dataRoot)
    } catch {
      captureFailure = { stage: 'steward-dom-lifecycle', code: 'FAILED' }
    }
  }
  const transportAfterSteward = e2eTransportEvidence().count
  let daily: Awaited<ReturnType<typeof runDailyE2e>> | undefined
  if (!('failure' in evidence) && !captureFailure) {
    try {
      daily = await runDailyE2e(window, dataRoot)
    } catch (error) {
      const diagnostic =
        error instanceof Error
          ? error.message.match(/daily-[a-z-]+(?::\{[^\r\n]*\})?/u)?.[0]
          : undefined
      captureFailure = { stage: 'daily-dom-lifecycle', code: diagnostic ?? 'FAILED' }
    }
  }
  const transportAfterDaily = e2eTransportEvidence().count
  if (dataRoot.phase === 'seed' && !('failure' in evidence) && !captureFailure) {
    try {
      evidence = {
        ...evidence,
        ...(await execute<PendingEvidence>(window, pendingBeforeCloseScript))
      }
      const pendingRequests = e2eTransportEvidence().requests.filter((request) =>
        request.messages.some((message) => message.content === 'E2E_PENDING_NORMAL')
      )
      if (pendingRequests.length !== 1) throw Error('pending-transport-evidence')
      reportedTransportAfterExplicit = {
        count: transportAfterExplicit.count + 1,
        requests: [...transportAfterExplicit.requests, pendingRequests[0]!]
      }
    } catch {
      captureFailure = { stage: 'pending-after-daily', code: 'FAILED' }
    }
  }
  const result = {
    daily,
    dailyTransportCalls: transportAfterDaily - transportAfterSteward,
    steward,
    stewardTransportCalls: transportAfterSteward - transportAfterBackground,
    background,
    backgroundTransportCalls: transportAfterBackground - transportAfterExplicit.count,
    reminders,
    runId: dataRoot.runId,
    phase: dataRoot.phase,
    pid: process.pid,
    processType: process.type,
    electron: process.versions.electron,
    node: process.versions.node,
    sqlite: process.versions.sqlite,
    security: secureWebPreferences,
    transportAfterExplicit: reportedTransportAfterExplicit,
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
