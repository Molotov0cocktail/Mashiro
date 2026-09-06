import { randomUUID } from 'node:crypto'
import { timelineChannels } from '../../shared/timeline-channels.js'
import { timelineResultSchema, type TimelineResult } from '../../shared/timeline-contract.js'
import type { ProviderService } from '../provider/provider-service.js'

interface IpcMainLike {
  handle(channel: string, listener: (event: unknown, input: unknown) => unknown): void
  removeHandler(channel: string): void
}

export function registerTimelineIpc(ipcMain: IpcMainLike, service: ProviderService): () => void {
  const safe = (operation: () => unknown): TimelineResult => {
    try {
      const result = timelineResultSchema.safeParse(operation())
      if (result.success) return result.data
    } catch {
      /* No storage details or body text cross a failed trusted boundary. */
    }
    return {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Timeline service failed',
        correlationId: randomUUID(),
        retryable: false
      }
    }
  }
  ipcMain.handle(timelineChannels.read, (_event, input) => safe(() => service.readTimeline(input)))
  ipcMain.handle(timelineChannels.saveTemporary, (_event, input) =>
    safe(() => service.saveTemporary(input))
  )
  return () => {
    for (const channel of Object.values(timelineChannels)) ipcMain.removeHandler(channel)
  }
}
