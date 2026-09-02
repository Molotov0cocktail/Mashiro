import { contextBridge, ipcRenderer } from 'electron'
import { assistantChannels } from '../shared/assistant-channels.js'
import type { AssistantApi } from '../shared/assistant-contract.js'

const assistants: AssistantApi = {
  list: () => ipcRenderer.invoke(assistantChannels.list, { protocolVersion: 1 }),
  create: (input) => ipcRenderer.invoke(assistantChannels.create, input),
  switch: (input) => ipcRenderer.invoke(assistantChannels.switch, input),
  rename: (input) => ipcRenderer.invoke(assistantChannels.rename, input),
  setPrimary: (input) => ipcRenderer.invoke(assistantChannels.setPrimary, input),
  archive: (input) => ipcRenderer.invoke(assistantChannels.archive, input)
}

contextBridge.exposeInMainWorld('mashiro', { assistants })
