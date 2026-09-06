import { contextBridge, ipcRenderer } from 'electron'
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

contextBridge.exposeInMainWorld('mashiro', { assistants, provider })
