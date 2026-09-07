import type { TransportRequest, TransportResult } from './chat-completions-transport.js'
import type { ToolRepository, ToolSegment } from './tool-repository.js'
import { TOOL_LIMITS } from './tool-protocol.js'
import { ProviderDomainError } from './provider-repository.js'
import { protocolInputCharacters } from './provider-profile.js'

/** A plain thinking turn must retain its actual protocol for a later user-enabled tool turn. */
export async function executeRetainedText(options: {
  request: TransportRequest
  segment: ToolSegment
  ledger: ToolRepository
  transport: (request: TransportRequest) => Promise<TransportResult>
  assertCurrent: () => void
}): Promise<TransportResult> {
  const { request, segment, ledger, assertCurrent } = options
  assertCurrent()
  if (protocolInputCharacters(request.messages) > 120000) throw new ProviderDomainError('LIMIT')
  ledger.create(segment)
  let rejectAbort: (() => void) | undefined
  const cancelled = new Promise<never>((_resolve, reject) => {
    rejectAbort = () => reject(new ProviderDomainError('CANCELLED'))
    request.signal?.addEventListener('abort', rejectAbort, { once: true })
    if (request.signal?.aborted) rejectAbort()
  })
  try {
    const result = await Promise.race([options.transport(request), cancelled])
    assertCurrent()
    if (result.status !== 'completed') return result
    if (
      typeof result.text !== 'string' ||
      result.text.length > 120000 ||
      typeof result.reasoning !== 'string' ||
      result.reasoning.length > TOOL_LIMITS.reasoning ||
      result.finishReason !== 'stop' ||
      (result.toolCalls?.length ?? 0) !== 0
    )
      throw new ProviderDomainError('PROTOCOL')
    ledger.messages(
      segment.id,
      [
        ...request.messages,
        {
          role: 'assistant',
          content: result.text,
          reasoning_content: result.reasoning
        }
      ],
      true
    )
    return result
  } finally {
    if (rejectAbort) request.signal?.removeEventListener('abort', rejectAbort)
    void cancelled.catch(() => undefined)
    try {
      ledger.close(segment.id)
    } catch {
      /* Recovery closes a segment if storage closed during cancellation. */
    }
  }
}
