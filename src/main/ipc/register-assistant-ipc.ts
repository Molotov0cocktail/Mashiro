import { randomUUID } from 'node:crypto'
import type { AssistantService } from '../assistant/assistant-service.js'
import {
  assistantChannels,
  assistantResultSchema,
  type AssistantResult
} from '../../shared/assistant-contract.js'

interface IpcMainLike {
  handle(channel: string, listener: (_event: unknown, input: unknown) => AssistantResult): void
  removeHandler(channel: string): void
}

function internalError(): AssistantResult {
  return assistantResultSchema.parse({
    ok: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Assistant service failed',
      correlationId: randomUUID(),
      retryable: false
    }
  })
}

function validateOutput(operation: () => unknown): AssistantResult {
  try {
    const parsed = assistantResultSchema.safeParse(operation())
    if (parsed.success) return parsed.data
  } catch {
    // Trusted implementation details never cross the IPC boundary.
  }
  return internalError()
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
    ipcMain.handle(channel, (_event, input) => validateOutput(() => handler(input)))
  }
  return () => {
    for (const channel of Object.keys(handlers)) ipcMain.removeHandler(channel)
  }
}
