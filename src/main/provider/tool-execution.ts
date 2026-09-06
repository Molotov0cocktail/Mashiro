import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import {
  historyCitationSchema,
  type ToolScope,
  type ToolOperation
} from '../../shared/tool-contract.js'
import { ToolRepository, type ToolSegment } from './tool-repository.js'
import {
  TOOL_LIMITS,
  validateToolCalls,
  type ProtocolMessage,
  clockArgumentsSchema,
  historyArgumentsSchema
} from './tool-protocol.js'
import type {
  TransportRequest,
  TransportResult,
  TransportUsage
} from './chat-completions-transport.js'
import { ProviderDomainError } from './provider-repository.js'

export const clockResultSchema = z.strictObject({
  utc: z.iso.datetime(),
  timeZone: z.string().min(1).max(100),
  offsetMinutes: z.number().int().min(-840).max(840)
})
export const historyResultSchema = z.strictObject({
  matches: z.array(historyCitationSchema).max(10),
  truncated: z.boolean()
})
export interface ToolExecutionOptions {
  request: TransportRequest
  segment: ToolSegment
  scope: Exclude<ToolScope, 'off'>
  ledger: ToolRepository
  transport: (request: TransportRequest) => Promise<TransportResult>
  assertCurrent: () => void
  clock: () => Date
  history: (query: string, limit: number) => z.infer<typeof historyResultSchema>
  memory?: (
    call: import('./tool-protocol.js').ToolCall,
    operation: ToolOperation
  ) => { body: string; summary: string } | Promise<{ body: string; summary: string }>
  emit: (operation: ToolOperation) => void
}
export async function executeToolChat(options: ToolExecutionOptions): Promise<TransportResult> {
  const { segment, ledger, scope, assertCurrent } = options
  const messages: ProtocolMessage[] = structuredClone(options.request.messages)
  ledger.create(segment)
  const controller = new AbortController()
  const abort = () => controller.abort()
  options.request.signal?.addEventListener('abort', abort, { once: true })
  if (options.request.signal?.aborted) abort()
  let timeout = false
  const timer = setTimeout(() => {
    timeout = true
    controller.abort()
  }, TOOL_LIMITS.timeoutMs)
  let text = ''
  let usage: TransportUsage | null = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
  let rejectAbort: (() => void) | undefined
  const cancelled = new Promise<never>((_resolve, reject) => {
    rejectAbort = () => reject(new ProviderDomainError(timeout ? 'TIMEOUT' : 'CANCELLED'))
    controller.signal.addEventListener('abort', rejectAbort, { once: true })
  })
  if (controller.signal.aborted) rejectAbort!()
  const check = () => {
    if (controller.signal.aborted) throw new ProviderDomainError(timeout ? 'TIMEOUT' : 'CANCELLED')
    assertCurrent()
  }
  try {
    for (let round = 0; round <= TOOL_LIMITS.rounds; round++) {
      check()
      if (Buffer.byteLength(JSON.stringify(messages)) > TOOL_LIMITS.chainBytes)
        throw new ProviderDomainError('LIMIT')
      const modelRequestId = randomUUID()
      let roundText = ''
      const result = await Promise.race([
        options.transport({
          ...options.request,
          messages: structuredClone(messages),
          tools: scope,
          signal: controller.signal,
          onDelta: options.request.stream
            ? (delta) => {
                if (controller.signal.aborted) return
                check()
                if (typeof delta !== 'string' || text.length + delta.length > 120000)
                  throw new ProviderDomainError('LIMIT')
                text += delta
                roundText += delta
                options.request.onDelta?.(delta)
              }
            : undefined
        }),
        cancelled
      ])
      check() // Cancellation / withdrawal wins even over malformed late results.
      if (
        typeof result.text !== 'string' ||
        result.text.length > 120000 ||
        !['completed', 'interrupted', 'cancelled', 'failed'].includes(result.status)
      )
        throw new ProviderDomainError('PROTOCOL')
      if (result.usage === null) usage = null
      else if (result.usage) {
        if (!Object.values(result.usage).every((n) => Number.isSafeInteger(n) && n >= 0))
          throw new ProviderDomainError('PROTOCOL')
        if (usage)
          for (const key of ['promptTokens', 'completionTokens', 'totalTokens'] as const) {
            usage[key] += result.usage[key]
            if (!Number.isSafeInteger(usage[key])) throw new ProviderDomainError('LIMIT')
          }
      } else throw new ProviderDomainError('PROTOCOL')
      if (!options.request.stream) text += result.text
      else {
        if (!result.text.startsWith(roundText)) throw new ProviderDomainError('PROTOCOL')
        const remaining = result.text.slice(roundText.length)
        if (text.length + remaining.length > 120000) throw new ProviderDomainError('LIMIT')
        text += remaining
        if (remaining) options.request.onDelta?.(remaining)
      }
      if (text.length > 120000) throw new ProviderDomainError('LIMIT')
      if (result.status !== 'completed') return { ...result, text, usage }
      if (
        result.reasoning !== undefined &&
        (typeof result.reasoning !== 'string' || result.reasoning.length > TOOL_LIMITS.reasoning)
      )
        throw new ProviderDomainError('PROTOCOL')
      const calls = result.toolCalls ?? []
      if (!Array.isArray(calls)) throw new ProviderDomainError('PROTOCOL')
      if (calls.length) {
        if (result.finishReason !== 'tool_calls' || round === TOOL_LIMITS.rounds)
          throw new ProviderDomainError(round === TOOL_LIMITS.rounds ? 'LIMIT' : 'PROTOCOL')
        let validated
        try {
          validated = validateToolCalls(calls)
        } catch {
          throw new ProviderDomainError('PROTOCOL')
        }
        if (
          validated.some(
            (c) =>
              (c.function.name === 'search_conversation_history' &&
                !['clock-and-history', 'clock-history-and-memory'].includes(scope)) ||
              ([
                'search_memory',
                'write_memory',
                'correct_memory',
                'request_memory_removal',
                'request_retention_cleanup'
              ].includes(c.function.name) &&
                !['clock-and-memory', 'clock-history-and-memory'].includes(scope))
          )
        )
          throw new ProviderDomainError('PERMISSION_DENIED')
        messages.push({
          role: 'assistant',
          content: result.text,
          ...(result.reasoning === undefined ? {} : { reasoning_content: result.reasoning }),
          tool_calls: validated
        })
        check()
        ledger.messages(segment.id, messages)
        for (const call of validated) {
          check()
          const operation = ledger.prepare(segment, modelRequestId, call)
          options.emit(structuredClone(operation))
          if (operation.state !== 'PREPARED') {
            if (operation.state !== 'SUCCEEDED') throw new ProviderDomainError('PROTOCOL')
            const prior = ledger.result(operation.operationId)
            if (prior === undefined) throw new ProviderDomainError('PERMISSION_DENIED')
            check()
            messages.push({ role: 'tool', tool_call_id: call.id, content: prior })
            continue
          }
          const business = ['write_memory', 'correct_memory', 'request_memory_removal'].includes(
            call.function.name
          )
          const update = (state: ToolOperation['state'], summary: string, resultBody?: string) => {
            operation.state = state
            operation.summary = summary
            operation.updatedAt = new Date().toISOString()
            ledger.update(operation, resultBody)
            options.emit(structuredClone(operation))
          }
          try {
            check()
          } catch (error) {
            update(
              controller.signal.aborted ? 'CANCELLED_BEFORE_DISPATCH' : 'BLOCKED_BY_CURRENT_STATE',
              business ? '当前取消或权限状态阻止了业务操作' : '当前取消或权限状态阻止了读取'
            )
            throw error
          }
          update(
            'DISPATCHING',
            business
              ? call.function.name === 'request_memory_removal'
                ? '正在准备操作确认，尚未删除或撤回'
                : '正在提交记忆操作'
              : '正在读取'
          )
          try {
            check()
          } catch (error) {
            update(
              'CONFIRMED_NOT_APPLIED',
              business ? '提交前已取消或撤权，未执行业务操作' : '读取前已取消或撤权，未读取'
            )
            throw error
          }
          let body: string
          try {
            if (call.function.name === 'get_current_time') {
              clockArgumentsSchema.parse(JSON.parse(call.function.arguments))
              const now = options.clock()
              body = JSON.stringify(
                clockResultSchema.parse({
                  utc: now.toISOString(),
                  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                  offsetMinutes: -now.getTimezoneOffset()
                })
              )
              operation.summary = '当前 UTC 时间：' + now.toISOString()
            } else if (call.function.name !== 'search_conversation_history') {
              if (!options.memory) throw new ProviderDomainError('PERMISSION_DENIED')
              const result = await options.memory(call, operation)
              body = result.body
              operation.summary = result.summary
            } else {
              const args = historyArgumentsSchema.parse(JSON.parse(call.function.arguments))
              check()
              const result = historyResultSchema.parse(options.history(args.query, args.limit))
              const matches = result.matches
              body = JSON.stringify(result)
              operation.citations = matches
              operation.summary = matches.length
                ? '已查找到 ' + matches.length + ' 条历史轮次'
                : '未找到匹配的历史轮次'
            }
          } catch (error) {
            if ((operation as ToolOperation).state === 'DISPATCHING')
              update('RESULT_UNKNOWN', '派发后中断，结果待核查；不会自动重做')
            throw error
          }
          try {
            check()
          } catch (error) {
            operation.citations = []
            if ((operation as ToolOperation).state !== 'SUCCEEDED')
              update(
                'SUCCEEDED',
                business
                  ? '业务回执已持久化，随后取消或撤权；结果未外发'
                  : '读取已完成，随后取消或撤权；结果未外发'
              )
            else options.emit(structuredClone(operation))
            throw error
          }
          // Completed read and its protocol result share an atomic local transaction.
          if ((operation as ToolOperation).state !== 'SUCCEEDED')
            update('SUCCEEDED', operation.summary, body)
          else options.emit(structuredClone(operation))
          check()
          if (operation.citations.length)
            ledger.addSources(
              segment.assistantId,
              segment.requestId,
              operation.citations.map((c) => c.requestId)
            )
          messages.push({ role: 'tool', tool_call_id: call.id, content: body })
          check()
          ledger.messages(segment.id, messages)
        }
      } else {
        if (result.finishReason !== 'stop') throw new ProviderDomainError('PROTOCOL')
        messages.push({
          role: 'assistant',
          content: result.text,
          ...(result.reasoning === undefined ? {} : { reasoning_content: result.reasoning })
        })
        check()
        ledger.messages(segment.id, messages, true)
        return { status: 'completed', text, usage }
      }
    }
    throw new ProviderDomainError('LIMIT')
  } finally {
    clearTimeout(timer)
    options.request.signal?.removeEventListener('abort', abort)
    if (rejectAbort) controller.signal.removeEventListener('abort', rejectAbort)
    void cancelled.catch(() => undefined)
    controller.abort()
    try {
      ledger.close(segment.id)
    } catch {
      /* Closing the app may already have closed storage; recovery marks active segments interrupted. */
    }
  }
}
