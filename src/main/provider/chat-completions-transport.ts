import {
  ToolAccumulator,
  ToolProtocolError,
  toolsSupported,
  toolDefinitions,
  type ProtocolMessage,
  type ToolCall
} from './tool-protocol.js'
import type { ToolScope } from '../../shared/tool-contract.js'

// Keep returned text representable in the service session and every delta below IPC limits.
export const MAX_RESPONSE_TEXT_CHARS = 120_000
const MAX_DELTA_TEXT_CHARS = 16_384

function unicodeSliceEnd(value: string, limit: number): number {
  let end = Math.min(value.length, limit)
  const before = value.charCodeAt(end - 1)
  const after = value.charCodeAt(end)
  if (before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff) end -= 1
  return end
}
export type TransportError =
  | 'authentication'
  | 'quota'
  | 'configuration'
  | 'temporary'
  | 'protocol'
  | 'timeout'
  | 'cancelled'
  | 'limit'
export interface TransportUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}
export interface TransportResult {
  status: 'completed' | 'interrupted' | 'cancelled' | 'failed'
  text: string
  usage: TransportUsage | null
  error?: TransportError
  toolCalls?: ToolCall[]
  reasoning?: string
  finishReason?: 'stop' | 'tool_calls'
}
export interface TransportRequest {
  baseUrl: string
  apiKey: string
  model: string
  messages: ProtocolMessage[]
  tools?: ToolScope
  maxOutputTokens?: number
  stream: boolean
  signal?: AbortSignal
  onDelta?: (text: string) => void
}
export interface TransportOptions {
  fetch?: typeof fetch
  timeoutMs?: number
  maxResponseBytes?: number
  maxBufferChars?: number
}

export function validateBaseUrl(baseUrl: string): string {
  try {
    const url = new URL(baseUrl)
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      baseUrl.includes('?') ||
      baseUrl.includes('#')
    )
      throw new Error()
    return url.href.replace(/\/+$/, '')
  } catch {
    throw new Error('Invalid Provider base URL')
  }
}

class Failure extends Error {
  constructor(readonly category: TransportError) {
    super(category)
  }
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Failure('protocol')
  return value as Record<string, unknown>
}
function usageOf(value: unknown): TransportUsage | null {
  if (value == null) return null
  const usage = record(value)
  const values = [usage.prompt_tokens, usage.completion_tokens, usage.total_tokens]
  if (!values.every((n) => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0))
    throw new Failure('protocol')
  return {
    promptTokens: usage.prompt_tokens as number,
    completionTokens: usage.completion_tokens as number,
    totalTokens: usage.total_tokens as number
  }
}
function bounded(value: number | undefined, fallback: number, maximum: number): number {
  return value !== undefined && Number.isSafeInteger(value) && value > 0
    ? Math.min(value, maximum)
    : fallback
}

/** One explicit request, with no retries and no Provider error body exposure. */
export async function chatCompletions(
  request: TransportRequest,
  options: TransportOptions = {}
): Promise<TransportResult> {
  let text = ''
  const toolMode = request.tools !== undefined && request.tools !== 'off'
  const toolAccumulator = new ToolAccumulator()
  let usage: TransportUsage | null = null
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  const controller = new AbortController()
  let timedOut = false
  const cancel = () => controller.abort()
  request.signal?.addEventListener('abort', cancel, { once: true })
  if (request.signal?.aborted) cancel()
  const timer = setTimeout(
    () => {
      timedOut = true
      controller.abort()
    },
    bounded(options.timeoutMs, 120_000, 300_000)
  )
  const maxBytes = bounded(options.maxResponseBytes, 4_194_304, 16_777_216)
  const maxBuffer = bounded(options.maxBufferChars, 262_144, 1_048_576)
  let rejectAbort: (() => void) | undefined
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectAbort = () => reject(new Failure(timedOut ? 'timeout' : 'cancelled'))
    controller.signal.addEventListener('abort', rejectAbort, { once: true })
  })
  // A signal can be pre-aborted before the listener is attached.
  if (controller.signal.aborted) rejectAbort?.()
  const race = <T>(work: Promise<T>): Promise<T> => Promise.race([work, aborted])
  try {
    const baseUrl = validateBaseUrl(request.baseUrl)
    if (controller.signal.aborted) throw new Failure('cancelled')
    if (!request.apiKey || !request.model || request.messages.length === 0)
      throw new Failure('configuration')
    if (
      request.maxOutputTokens !== undefined &&
      (!Number.isSafeInteger(request.maxOutputTokens) ||
        request.maxOutputTokens < 1 ||
        request.maxOutputTokens > 8192)
    )
      throw new Failure('configuration')
    const endpoint = new URL(baseUrl)
    const bigModel =
      endpoint.hostname === 'open.bigmodel.cn' && endpoint.pathname === '/api/paas/v4'
    if (toolMode && !toolsSupported(baseUrl, request.model)) throw new Failure('configuration')
    const response = await race(
      (options.fetch ?? fetch)(`${baseUrl}/chat/completions`, {
        method: 'POST',
        redirect: 'error',
        signal: controller.signal,
        headers: { 'content-type': 'application/json', authorization: `Bearer ${request.apiKey}` },
        body: JSON.stringify({
          model: request.model,
          messages: request.messages,
          stream: request.stream,
          ...(toolMode
            ? {
                tools: toolDefinitions(request.tools!),
                tool_choice: 'auto',
                max_tokens: 2048,
                ...(request.stream ? { tool_stream: true } : {})
              }
            : {}),
          ...(request.maxOutputTokens !== undefined ? { max_tokens: request.maxOutputTokens } : {}),
          ...(bigModel
            ? /^glm-5\.3(?:-flash)?$/i.test(request.model)
              ? {
                  thinking: { type: 'enabled', ...(toolMode ? { clear_thinking: true } : {}) },
                  reasoning_effort: 'low'
                }
              : { thinking: { type: 'disabled' } }
            : {})
        })
      })
    )
    if (!response.ok || response.redirected) {
      void response.body?.cancel().catch(() => undefined)
      throw new Failure(
        response.status === 401 || response.status === 403
          ? 'authentication'
          : response.status === 429 || response.status === 402
            ? 'quota'
            : response.status >= 500
              ? 'temporary'
              : 'configuration'
      )
    }
    const contentType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()
    if (
      contentType !== (request.stream ? 'text/event-stream' : 'application/json') ||
      !response.body
    ) {
      void response.body?.cancel().catch(() => undefined)
      throw new Failure('protocol')
    }
    reader = response.body.getReader()
    const decoder = new TextDecoder('utf-8', { fatal: true })
    let bytes = 0
    let finished = false
    let done = false
    let finishReason: string | undefined
    const consume = (raw: string) => {
      if (raw === '[DONE]') {
        if (!finished) throw new Failure('protocol')
        done = true
        return
      }
      const packet = record(JSON.parse(raw) as unknown)
      if (packet.error) throw new Failure('protocol')
      if (packet.usage != null) usage = usageOf(packet.usage)
      if (!Array.isArray(packet.choices)) throw new Failure('protocol')
      if (packet.choices.length === 0) {
        if (packet.usage == null) throw new Failure('protocol')
        return
      }
      if (packet.choices.length !== 1) throw new Failure('protocol')
      const choice = record(packet.choices[0])
      if (choice.index !== 0) throw new Failure('protocol')
      if (finished) throw new Failure('protocol')
      const message = record(request.stream ? choice.delta : choice.message)
      if (toolMode) toolAccumulator.consume(message, request.stream)
      if (message.content != null && typeof message.content !== 'string')
        throw new Failure('protocol')
      if (typeof message.content === 'string' && message.content.length) {
        const remaining = MAX_RESPONSE_TEXT_CHARS - text.length
        const overflow = message.content.length > remaining
        if (overflow && !request.stream) throw new Failure('limit')
        const accepted = message.content.slice(0, unicodeSliceEnd(message.content, remaining))
        text += accepted
        for (let start = 0; start < accepted.length;) {
          const end = unicodeSliceEnd(accepted, start + MAX_DELTA_TEXT_CHARS)
          request.onDelta?.(accepted.slice(start, end))
          start = end
        }
        if (overflow) throw new Failure('limit')
      }
      if (choice.finish_reason != null) {
        if (typeof choice.finish_reason !== 'string') throw new Failure('protocol')
        finished = true
        finishReason = choice.finish_reason
      }
    }
    let line = ''
    let data = ''
    let dataSeen = false
    let previousCR = false
    const emitLine = () => {
      if (line === '') {
        if (dataSeen) consume(data.slice(0, -1))
        data = ''
        dataSeen = false
      } else if (!line.startsWith(':')) {
        const colon = line.indexOf(':')
        const field = colon < 0 ? line : line.slice(0, colon)
        let value = colon < 0 ? '' : line.slice(colon + 1)
        if (value.startsWith(' ')) value = value.slice(1)
        if (field === 'data') {
          data += value + '\n'
          dataSeen = true
        }
      }
      line = ''
      if (data.length > maxBuffer) throw new Failure('limit')
    }
    const consumeText = (chunk: string) => {
      if (!request.stream) {
        data += chunk
        if (data.length > maxBytes) throw new Failure('limit')
        return
      }
      for (const char of chunk) {
        if (done) break
        if (previousCR && char === '\n') {
          previousCR = false
          continue
        }
        previousCR = false
        if (char === '\r' || char === '\n') {
          emitLine()
          previousCR = char === '\r'
        } else {
          line += char
          if (line.length + data.length > maxBuffer) throw new Failure('limit')
        }
      }
    }
    while (!done) {
      const chunk = await race(reader.read())
      if (chunk.done) {
        consumeText(decoder.decode())
        break
      }
      bytes += chunk.value.byteLength
      if (bytes > maxBytes) throw new Failure('limit')
      consumeText(decoder.decode(chunk.value, { stream: true }))
    }
    if (!request.stream) {
      consume(data)
      done = true
    }
    if (!done || !finished) throw new Failure('protocol')
    if (toolMode) {
      const protocol = toolAccumulator.finish(finishReason)
      return {
        status: 'completed',
        text,
        usage,
        ...protocol,
        finishReason: finishReason as 'stop' | 'tool_calls'
      }
    }
    if (finishReason !== 'stop') throw new Failure('protocol')
    return { status: 'completed', text, usage }
  } catch (error) {
    const category: TransportError = controller.signal.aborted
      ? timedOut
        ? 'timeout'
        : 'cancelled'
      : error instanceof ToolProtocolError
        ? error.category
        : error instanceof Failure
          ? error.category
          : error instanceof SyntaxError || (error instanceof TypeError && reader !== undefined)
            ? 'protocol'
            : error instanceof Error && error.message === 'Invalid Provider base URL'
              ? 'configuration'
              : 'temporary'
    return {
      status: category === 'cancelled' ? 'cancelled' : text ? 'interrupted' : 'failed',
      text,
      usage,
      error: category
    }
  } finally {
    clearTimeout(timer)
    request.signal?.removeEventListener('abort', cancel)
    if (rejectAbort) controller.signal.removeEventListener('abort', rejectAbort)
    // Suppress a pre-abort rejection when configuration failed before the first race.
    void aborted.catch(() => undefined)
    if (reader) void reader.cancel().catch(() => undefined)
    controller.abort()
  }
}
