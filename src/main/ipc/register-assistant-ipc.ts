import type { AssistantService } from '../assistant/assistant-service.js'
import { assistantChannels } from '../../shared/assistant-contract.js'

interface IpcMainLike {
  handle(channel: string, listener: (_event: unknown, input: unknown) => unknown): void
  removeHandler(channel: string): void
}

export function registerAssistantIpc(ipcMain: IpcMainLike, service: AssistantService): () => void {
  const handlers = {
    [assistantChannels.list]: (input: unknown) => service.list(input),
    [assistantChannels.create]: (input: unknown) => service.create(input),
    [assistantChannels.switch]: (input: unknown) => service.switch(input),
    [assistantChannels.rename]: (input: unknown) => service.rename(input),
    [assistantChannels.setPrimary]: (input: unknown) => service.setPrimary(input),
    [assistantChannels.archive]: (input: unknown) => service.archive(input)
  }
  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, (_event, input) => handler(input))
  }
  return () => {
    for (const channel of Object.keys(handlers)) ipcMain.removeHandler(channel)
  }
}
