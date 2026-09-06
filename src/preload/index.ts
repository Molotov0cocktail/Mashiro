import { contextBridge, ipcRenderer } from 'electron'
import { retentionChannels, retentionChangedChannel } from '../shared/retention-channels.js'
import type { RetentionApi, RetentionChanged } from '../shared/retention-contract.js'
import { memoryChannels } from '../shared/memory-channels.js'
import type { MemoryApi } from '../shared/memory-contract.js'
import { timelineChannels } from '../shared/timeline-channels.js'
import type { TimelineApi } from '../shared/timeline-contract.js'
import { assistantChannels } from '../shared/assistant-channels.js'
import { providerChannels } from '../shared/provider-channels.js'
import type { AssistantApi } from '../shared/assistant-contract.js'
import type { ProviderApi, ProviderEvent } from '../shared/provider-contract.js'

const assistants: AssistantApi = {
  list: () => ipcRenderer.invoke(assistantChannels.list, { protocolVersion: 1 }),
  create: (input) => ipcRenderer.invoke(assistantChannels.create, input),
  switch: (input) => ipcRenderer.invoke(assistantChannels.switch, input),
  rename: (input) => ipcRenderer.invoke(assistantChannels.rename, input),
  setPrimary: (input) => ipcRenderer.invoke(assistantChannels.setPrimary, input),
  archive: (input) => ipcRenderer.invoke(assistantChannels.archive, input)
}

const provider: ProviderApi = {
  tools: (input) => ipcRenderer.invoke(providerChannels.tools, input),
  capabilities: (input) => ipcRenderer.invoke(providerChannels.capabilities, input),
  list: () => ipcRenderer.invoke(providerChannels.list, { protocolVersion: 1 }),
  saveConnection: (input) => ipcRenderer.invoke(providerChannels.saveConnection, input),
  setCredential: (input) => ipcRenderer.invoke(providerChannels.setCredential, input),
  deleteCredential: (input) => ipcRenderer.invoke(providerChannels.deleteCredential, input),
  bindAssistant: (input) => ipcRenderer.invoke(providerChannels.bindAssistant, input),
  clearChat: (input) => ipcRenderer.invoke(providerChannels.clearChat, input),
  startChat: (input) => ipcRenderer.invoke(providerChannels.startChat, input),
  cancelChat: (input) => ipcRenderer.invoke(providerChannels.cancelChat, input),
  onEvent: (listener) => {
    const handler = (_event: unknown, value: unknown): void => {
      listener(value as ProviderEvent)
    }
    ipcRenderer.on(providerChannels.event, handler)
    return () => ipcRenderer.removeListener(providerChannels.event, handler)
  }
}

const timeline: TimelineApi = {
  query: (input) => ipcRenderer.invoke(timelineChannels.query, input),
  permissions: (input) => ipcRenderer.invoke(timelineChannels.permissions, input),
  setPermissions: (input) => ipcRenderer.invoke(timelineChannels.setPermissions, input),
  read: (input) => ipcRenderer.invoke(timelineChannels.read, input),
  saveTemporary: (input) => ipcRenderer.invoke(timelineChannels.saveTemporary, input)
}
const memory: MemoryApi = {
  query: (input) => ipcRenderer.invoke(memoryChannels.query, input),
  mutate: (input) => ipcRenderer.invoke(memoryChannels.mutate, input),
  inspect: (input) => ipcRenderer.invoke(memoryChannels.inspect, input),
  permissions: (input) => ipcRenderer.invoke(memoryChannels.permissions, input),
  setPermissions: (input) => ipcRenderer.invoke(memoryChannels.setPermissions, input),
  confirm: (input) => ipcRenderer.invoke(memoryChannels.confirm, input),
  previewReload: (input) => ipcRenderer.invoke(memoryChannels.previewReload, input),
  acceptReload: (input) => ipcRenderer.invoke(memoryChannels.acceptReload, input)
}
const retention: RetentionApi = {
  overview: (input) => ipcRenderer.invoke(retentionChannels.overview, input),
  move: (input) => ipcRenderer.invoke(retentionChannels.move, input),
  preview: (input) => ipcRenderer.invoke(retentionChannels.preview, input),
  confirm: (input) => ipcRenderer.invoke(retentionChannels.confirm, input),
  jobs: (input) => ipcRenderer.invoke(retentionChannels.jobs, input),
  retry: (input) => ipcRenderer.invoke(retentionChannels.retry, input),
  onChanged: (listener) => {
    const handler = (_event: unknown, value: unknown): void => listener(value as RetentionChanged)
    ipcRenderer.on(retentionChangedChannel, handler)
    return () => ipcRenderer.removeListener(retentionChangedChannel, handler)
  }
}
contextBridge.exposeInMainWorld('mashiro', { assistants, provider, timeline, memory, retention })
