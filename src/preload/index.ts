import { contextBridge, ipcRenderer } from 'electron'
import { dailyChannels } from '../shared/daily-channels.js'
import { operationsChannels } from '../shared/operations-channels.js'
import type { DailyApi, DailyChanged } from '../shared/daily-contract.js'
import type { OperationsApi, OperationsChanged } from '../shared/operations-contract.js'
import { stewardChannels } from '../shared/steward-channels.js'
import type { StewardApi, StewardChanged } from '../shared/steward-contract.js'
import { backgroundChannels } from '../shared/background-channels.js'
import type { BackgroundApi, BackgroundChanged } from '../shared/background-contract.js'
import { reminderChannels, reminderChangedChannel } from '../shared/reminder-channels.js'
import type { ReminderApi, ReminderChanged } from '../shared/reminder-contract.js'
import { itemChannels } from '../shared/item-channels.js'
import type { ItemApi } from '../shared/item-contract.js'
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
const items: ItemApi = {
  query: (input) => ipcRenderer.invoke(itemChannels.query, input),
  inspect: (input) => ipcRenderer.invoke(itemChannels.inspect, input),
  mutate: (input) => ipcRenderer.invoke(itemChannels.mutate, input),
  proposalAction: (input) => ipcRenderer.invoke(itemChannels.proposalAction, input),
  operation: (input) => ipcRenderer.invoke(itemChannels.operation, input),
  preview: (input) => ipcRenderer.invoke(itemChannels.preview, input),
  confirm: (input) => ipcRenderer.invoke(itemChannels.confirm, input),
  permissions: (input) => ipcRenderer.invoke(itemChannels.permissions, input),
  setPermissions: (input) => ipcRenderer.invoke(itemChannels.setPermissions, input)
}
const reminders: ReminderApi = {
  query: (input) => ipcRenderer.invoke(reminderChannels.query, input),
  mutate: (input) => ipcRenderer.invoke(reminderChannels.mutate, input),
  operation: (input) => ipcRenderer.invoke(reminderChannels.operation, input),
  runtime: (input) => ipcRenderer.invoke(reminderChannels.runtime, input),
  configure: (input) => ipcRenderer.invoke(reminderChannels.configure, input),
  preview: (input) => ipcRenderer.invoke(reminderChannels.preview, input),
  confirm: (input) => ipcRenderer.invoke(reminderChannels.confirm, input),
  onChanged: (listener) => {
    const handler = (_event: unknown, value: unknown): void => listener(value as ReminderChanged)
    ipcRenderer.on(reminderChangedChannel, handler)
    return () => ipcRenderer.removeListener(reminderChangedChannel, handler)
  }
}
const background: BackgroundApi = {
  query: (input) => ipcRenderer.invoke(backgroundChannels.query, input),
  configure: (input) => ipcRenderer.invoke(backgroundChannels.configure, input),
  run: (input) => ipcRenderer.invoke(backgroundChannels.run, input),
  control: (input) => ipcRenderer.invoke(backgroundChannels.control, input),
  chapter: (input) => ipcRenderer.invoke(backgroundChannels.chapter, input),
  topic: (input) => ipcRenderer.invoke(backgroundChannels.topic, input),
  onChanged: (listener) => {
    const handler = (_event: unknown, value: unknown): void => listener(value as BackgroundChanged)
    ipcRenderer.on(backgroundChannels.changed, handler)
    return () => ipcRenderer.removeListener(backgroundChannels.changed, handler)
  }
}
const steward: StewardApi = {
  query: (input) => ipcRenderer.invoke(stewardChannels.query, input),
  configure: (input) => ipcRenderer.invoke(stewardChannels.configure, input),
  run: (input) => ipcRenderer.invoke(stewardChannels.run, input),
  control: (input) => ipcRenderer.invoke(stewardChannels.control, input),
  pending: (input) => ipcRenderer.invoke(stewardChannels.pending, input),
  branch: (input) => ipcRenderer.invoke(stewardChannels.branch, input),
  organize: (input) => ipcRenderer.invoke(stewardChannels.organize, input),
  resolveConflict: (input) => ipcRenderer.invoke(stewardChannels.resolveConflict, input),
  onChanged: (listener) => {
    const handler = (_event: unknown, value: unknown): void => listener(value as StewardChanged)
    ipcRenderer.on(stewardChannels.changed, handler)
    return () => ipcRenderer.removeListener(stewardChannels.changed, handler)
  }
}
const daily: DailyApi = {
  configure: (input) => ipcRenderer.invoke(dailyChannels.configure, input),
  query: (input) => ipcRenderer.invoke(dailyChannels.query, input),
  preview: (input) => ipcRenderer.invoke(dailyChannels.preview, input),
  inspect: (input) => ipcRenderer.invoke(dailyChannels.inspect, input),
  run: (input) => ipcRenderer.invoke(dailyChannels.run, input),
  control: (input) => ipcRenderer.invoke(dailyChannels.control, input),
  decide: (input) => ipcRenderer.invoke(dailyChannels.decide, input),
  ack: (input) => ipcRenderer.invoke(dailyChannels.ack, input),
  onChanged: (listener) => {
    const handler = (_event: unknown, value: unknown) => listener(value as DailyChanged)
    ipcRenderer.on(dailyChannels.changed, handler)
    return () => ipcRenderer.removeListener(dailyChannels.changed, handler)
  }
}
const operations: OperationsApi = {
  query: (input) => ipcRenderer.invoke(operationsChannels.query, input),
  usage: (input) => ipcRenderer.invoke(operationsChannels.usage, input),
  onChanged: (listener) => {
    const handler = (_event: unknown, value: unknown) => listener(value as OperationsChanged)
    ipcRenderer.on(operationsChannels.changed, handler)
    return () => ipcRenderer.removeListener(operationsChannels.changed, handler)
  }
}
contextBridge.exposeInMainWorld('mashiro', {
  daily,
  operations,
  steward,
  background,
  reminders,
  assistants,
  provider,
  timeline,
  memory,
  retention,
  items
})
