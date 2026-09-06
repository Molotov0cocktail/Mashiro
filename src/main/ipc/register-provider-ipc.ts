import { randomUUID } from 'node:crypto'
import type { ProviderService } from '../provider/provider-service.js'
import {
  providerChannels,
  toolReadResultSchema,
  capabilityResultSchema,
  providerChatResultSchema,
  providerEventSchema,
  providerResultSchema,
  type ProviderChatResult,
  type ProviderResult
} from '../../shared/provider-contract.js'

interface SenderLike {
  send(channel: string, event: unknown): void
}
interface EventLike {
  sender: SenderLike
}
interface IpcMainLike {
  handle(channel: string, listener: (event: EventLike, input: unknown) => unknown): void
  removeHandler(channel: string): void
}

function internalSettingsError(): ProviderResult {
  return providerResultSchema.parse({
    ok: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Provider service failed',
      correlationId: randomUUID(),
      retryable: false
    }
  })
}
function internalChatError(): ProviderChatResult {
  return providerChatResultSchema.parse(internalSettingsError())
}
function settings(operation: () => unknown): ProviderResult {
  try {
    const parsed = providerResultSchema.safeParse(operation())
    if (parsed.success) return parsed.data
  } catch {
    // Trusted implementation details never cross the IPC boundary.
  }
  return internalSettingsError()
}
async function chat(operation: () => Promise<unknown>): Promise<ProviderChatResult> {
  try {
    const parsed = providerChatResultSchema.safeParse(await operation())
    if (parsed.success) return parsed.data
  } catch {
    // Trusted implementation details never cross the IPC boundary.
  }
  return internalChatError()
}

export function registerProviderIpc(ipcMain: IpcMainLike, service: ProviderService): () => void {
  const safeTools = (
    schema: typeof toolReadResultSchema | typeof capabilityResultSchema,
    operation: () => unknown
  ): unknown => {
    try {
      const parsed = schema.safeParse(operation())
      if (parsed.success) return parsed.data
    } catch {
      /* Sanitized boundary. */
    }
    return internalSettingsError()
  }
  const handlers = {
    [providerChannels.tools]: (_event: EventLike, input: unknown) =>
      safeTools(toolReadResultSchema, () => service.tools(input)),
    [providerChannels.capabilities]: (_event: EventLike, input: unknown) =>
      safeTools(capabilityResultSchema, () => service.capabilities(input)),
    [providerChannels.list]: (_event: EventLike, input: unknown) =>
      settings(() => service.list(input)),
    [providerChannels.saveConnection]: (_event: EventLike, input: unknown) =>
      settings(() => service.saveConnection(input)),
    [providerChannels.setCredential]: (_event: EventLike, input: unknown) =>
      settings(() => service.setCredential(input)),
    [providerChannels.deleteCredential]: (_event: EventLike, input: unknown) =>
      settings(() => service.deleteCredential(input)),
    [providerChannels.bindAssistant]: (_event: EventLike, input: unknown) =>
      settings(() => service.bindAssistant(input)),
    [providerChannels.clearChat]: (_event: EventLike, input: unknown) =>
      settings(() => service.clearChat(input)),
    [providerChannels.startChat]: (event: EventLike, input: unknown) =>
      chat(() =>
        service.startChat(input, (value) => {
          const parsed = providerEventSchema.safeParse(value)
          if (parsed.success) event.sender.send(providerChannels.event, parsed.data)
        })
      ),
    [providerChannels.cancelChat]: (_event: EventLike, input: unknown) =>
      chat(async () => service.cancelChat(input))
  }
  for (const [channel, handler] of Object.entries(handlers)) ipcMain.handle(channel, handler)
  return () => {
    for (const channel of Object.keys(handlers)) ipcMain.removeHandler(channel)
  }
}
