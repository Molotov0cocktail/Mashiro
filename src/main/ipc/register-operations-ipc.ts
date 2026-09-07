import { operationsChannels } from '../../shared/operations-channels.js'
import * as dto from '../../shared/operations-contract.js'
import type { OperationsService } from '../background/operations-service.js'
interface Ipc {
  handle(channel: string, listener: (event: unknown, input: unknown) => unknown): void
  removeHandler(channel: string): void
}
export function registerOperationsIpc(
  ipc: Ipc,
  service: OperationsService,
  trusted: (event: unknown) => boolean
) {
  const methods = { query: dto.operationsQueryResultSchema, usage: dto.operationsUsageResultSchema }
  for (const method of Object.keys(methods) as (keyof typeof methods)[])
    ipc.handle(operationsChannels[method], (event, input) => {
      if (!trusted(event))
        return { ok: false, error: { code: 'PERMISSION_DENIED', message: '运行中心调用来源无效' } }
      try {
        const parsed = methods[method].safeParse(service[method](input))
        if (parsed.success) return parsed.data
      } catch {
        /* Strict output rejection never includes private diagnostics. */
      }
      return { ok: false, error: { code: 'STORAGE_UNAVAILABLE', message: '运行记录暂不可用' } }
    })
  return () => {
    for (const method of Object.keys(methods) as (keyof typeof methods)[])
      ipc.removeHandler(operationsChannels[method])
  }
}
export function emitOperationsChanged(
  send: (channel: string, event: dto.OperationsChanged) => void,
  event: dto.OperationsChanged
) {
  send(operationsChannels.changed, dto.operationsChangedSchema.parse(event))
}
