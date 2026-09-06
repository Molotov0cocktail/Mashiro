#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto'
import { lstatSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const PROBE_VERSION = 2
const ENDPOINT = 'https://open.bigmodel.cn/api/paas/v4/chat/completions'
const MODEL = 'GLM-5.3-FLASH'
const TIMEOUT_MS = 90_000
const MAX_RESPONSE_BYTES = 2_000_000
const MAX_VISIBLE_CHARS = 120_000
const MAX_REASONING_CHARS = 240_000
const MAX_TOOL_ARGUMENT_CHARS = 32_000
const SYNTHETIC_NONCE =
  'mashiro-synthetic-fragment-probe-0123456789-ABCDEFGHIJKLMNOPQRSTUVWXYZ-abcdefghijklmnopqrstuvwxyz'

const projectRoot = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '..'))
let requestsAttempted = 0
let stage = 'startup'
const partialEvidence = {}

class ProbeFailure extends Error {
  constructor(category, details = {}) {
    super(category)
    this.category = category
    this.details = details
  }
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function inside(base, candidate) {
  const segment = relative(base, candidate)
  return segment === '' || (!segment.startsWith('..') && !isAbsolute(segment))
}

function requireCondition(condition, category, details) {
  if (!condition) throw new ProbeFailure(category, details)
}

function boundedAppend(current, fragment, limit, category) {
  requireCondition(typeof fragment === 'string', category)
  requireCondition(current.length + fragment.length <= limit, category)
  return current + fragment
}

function safeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null
}

function normalizeUsage(value) {
  if (!isRecord(value)) return null
  const promptDetails = isRecord(value.prompt_tokens_details) ? value.prompt_tokens_details : {}
  const completionDetails = isRecord(value.completion_tokens_details)
    ? value.completion_tokens_details
    : {}
  const normalized = {
    promptTokens: safeInteger(value.prompt_tokens),
    completionTokens: safeInteger(value.completion_tokens),
    totalTokens: safeInteger(value.total_tokens),
    cachedPromptTokens: safeInteger(promptDetails.cached_tokens),
    reasoningTokens: safeInteger(completionDetails.reasoning_tokens)
  }
  return Object.values(normalized).some((item) => item !== null) ? normalized : null
}

function sanitizeProviderCode(value) {
  if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value)
  if (typeof value !== 'string' || value.length > 64 || !/^[A-Za-z0-9_.-]+$/u.test(value)) {
    return null
  }
  return value
}

function safeFinishReason(value) {
  return ['stop', 'tool_calls', 'length', 'content_filter'].includes(value) ? value : 'other'
}

function summarizeStream(value) {
  return {
    finishReason: safeFinishReason(value.finishReason),
    toolCalls: value.toolCalls.length,
    argumentFragments: value.argumentFragments,
    fragmentedArgumentsObserved: value.argumentFragments > 1,
    reasoningObserved: value.reasoning.length > 0,
    reasoningChars: value.reasoning.length,
    reasoningFragments: value.reasoningFragments,
    visibleContentChars: value.content.length,
    usage: value.usage
  }
}

async function readBoundedBody(response, maximum) {
  requireCondition(response.body, 'response-body-missing')
  const reader = response.body.getReader()
  const chunks = []
  let total = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      total += next.value.byteLength
      requireCondition(total <= maximum, 'response-too-large')
      chunks.push(next.value)
    }
  } finally {
    reader.releaseLock()
  }
  const combined = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    combined.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(combined)
  } catch {
    throw new ProbeFailure('response-invalid-utf8')
  }
}

async function providerRequest(
  apiKey,
  body,
  expectedContentType,
  { fetcher = fetch, timeoutMs = TIMEOUT_MS, countRequest = true } = {}
) {
  if (countRequest) requestsAttempted += 1
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let response
  try {
    response = await fetcher(ENDPOINT, {
      method: 'POST',
      redirect: 'error',
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify(body)
    })
    if (!response.ok) {
      let providerCode = null
      try {
        const text = await readBoundedBody(response, 65_536)
        const parsed = JSON.parse(text)
        if (isRecord(parsed)) {
          const nested = isRecord(parsed.error) ? parsed.error.code : null
          providerCode = sanitizeProviderCode(nested ?? parsed.code)
        }
      } catch {
        providerCode = null
      }
      throw new ProbeFailure('http', { httpStatus: response.status, providerCode })
    }

    const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
    requireCondition(contentType.includes(expectedContentType), 'content-type')
    return await readBoundedBody(response, MAX_RESPONSE_BYTES)
  } catch (error) {
    if (controller.signal.aborted) throw new ProbeFailure('timeout')
    if (error instanceof ProbeFailure) throw error
    throw new ProbeFailure(response ? 'response-read' : 'network')
  } finally {
    clearTimeout(timer)
    controller.abort()
  }
}

function parseSseEvents(text) {
  const normalized = text.replaceAll('\r\n', '\n').replaceAll('\r', '\n')
  const events = []
  for (const block of normalized.split('\n\n')) {
    if (!block.trim()) continue
    const data = block
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).replace(/^ /u, ''))
      .join('\n')
    if (data) events.push(data)
  }
  return events
}

async function streamCompletion(apiKey, body) {
  const raw = await providerRequest(apiKey, body, 'text/event-stream')
  const toolCalls = new Map()
  let content = ''
  let reasoning = ''
  let finishReason = null
  let usage = null
  let done = false
  let argumentFragments = 0
  let reasoningFragments = 0

  for (const data of parseSseEvents(raw)) {
    if (data === '[DONE]') {
      done = true
      continue
    }
    requireCondition(!done, 'sse-data-after-done')
    let chunk
    try {
      chunk = JSON.parse(data)
    } catch {
      throw new ProbeFailure('sse-json')
    }
    requireCondition(isRecord(chunk) && Array.isArray(chunk.choices), 'sse-shape')
    const normalizedUsage = normalizeUsage(chunk.usage)
    if (normalizedUsage) usage = normalizedUsage
    requireCondition(chunk.choices.length <= 1, 'sse-choice-count')
    if (chunk.choices.length === 0) continue
    const choice = chunk.choices[0]
    requireCondition(isRecord(choice) && choice.index === 0, 'sse-choice-shape')
    if (choice.finish_reason !== null && choice.finish_reason !== undefined) {
      requireCondition(typeof choice.finish_reason === 'string', 'sse-finish-shape')
      finishReason = choice.finish_reason
    }
    const delta = choice.delta
    requireCondition(isRecord(delta), 'sse-delta-shape')
    if (delta.content !== null && delta.content !== undefined) {
      content = boundedAppend(content, delta.content, MAX_VISIBLE_CHARS, 'content-limit')
    }
    if (delta.reasoning_content !== null && delta.reasoning_content !== undefined) {
      reasoning = boundedAppend(
        reasoning,
        delta.reasoning_content,
        MAX_REASONING_CHARS,
        'reasoning-limit'
      )
      reasoningFragments += 1
    }
    if (delta.tool_calls !== null && delta.tool_calls !== undefined) {
      requireCondition(Array.isArray(delta.tool_calls), 'tool-calls-shape')
      for (const fragment of delta.tool_calls) {
        requireCondition(
          isRecord(fragment) && Number.isSafeInteger(fragment.index) && fragment.index >= 0,
          'tool-call-fragment-shape'
        )
        const existing = toolCalls.get(fragment.index) ?? {
          id: '',
          type: 'function',
          name: '',
          arguments: ''
        }
        if (fragment.id !== null && fragment.id !== undefined && fragment.id !== '') {
          requireCondition(typeof fragment.id === 'string', 'tool-call-id-shape')
          requireCondition(!existing.id || existing.id === fragment.id, 'tool-call-id-changed')
          existing.id = fragment.id
        }
        if (fragment.type !== null && fragment.type !== undefined) {
          requireCondition(fragment.type === 'function', 'tool-call-type')
        }
        if (fragment.function !== null && fragment.function !== undefined) {
          requireCondition(isRecord(fragment.function), 'tool-function-shape')
          if (
            fragment.function.name !== null &&
            fragment.function.name !== undefined &&
            fragment.function.name !== ''
          ) {
            requireCondition(typeof fragment.function.name === 'string', 'tool-name-shape')
            requireCondition(
              !existing.name || existing.name === fragment.function.name,
              'tool-name-changed'
            )
            existing.name = fragment.function.name
          }
          if (fragment.function.arguments !== null && fragment.function.arguments !== undefined) {
            existing.arguments = boundedAppend(
              existing.arguments,
              fragment.function.arguments,
              MAX_TOOL_ARGUMENT_CHARS,
              'tool-arguments-limit'
            )
            argumentFragments += 1
          }
        }
        toolCalls.set(fragment.index, existing)
      }
    }
  }

  requireCondition(done, 'sse-done-missing')
  return {
    content,
    reasoning,
    finishReason,
    usage,
    argumentFragments,
    reasoningFragments,
    toolCalls: [...toolCalls.entries()]
      .sort(([left], [right]) => left - right)
      .map(([, call]) => call)
  }
}

async function jsonCompletion(apiKey, body) {
  const raw = await providerRequest(apiKey, body, 'application/json')
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new ProbeFailure('json-response')
  }
  requireCondition(isRecord(parsed) && Array.isArray(parsed.choices), 'json-shape')
  requireCondition(parsed.choices.length === 1, 'json-choice-count')
  const choice = parsed.choices[0]
  requireCondition(isRecord(choice) && choice.index === 0, 'json-choice-shape')
  requireCondition(choice.finish_reason === 'stop', 'json-finish')
  requireCondition(isRecord(choice.message), 'json-message-shape')
  requireCondition(typeof choice.message.content === 'string', 'json-content-shape')
  requireCondition(choice.message.content.length <= MAX_VISIBLE_CHARS, 'content-limit')
  const reasoning = choice.message.reasoning_content
  requireCondition(
    reasoning === undefined || reasoning === null || typeof reasoning === 'string',
    'json-reasoning-shape'
  )
  requireCondition((reasoning?.length ?? 0) <= MAX_REASONING_CHARS, 'reasoning-limit')
  return {
    content: choice.message.content,
    reasoning: reasoning ?? '',
    usage: normalizeUsage(parsed.usage)
  }
}

function exactObject(value, keys) {
  return (
    isRecord(value) &&
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort())
  )
}

function validateToolArguments(text) {
  let value
  try {
    value = JSON.parse(text)
  } catch {
    throw new ProbeFailure('tool-arguments-json')
  }
  requireCondition(
    exactObject(value, ['include_reserved', 'item_code', 'nonce', 'warehouse']),
    'tool-arguments-properties'
  )
  requireCondition(value.item_code === 'MASHIRO-SYNTH-17', 'tool-argument-item')
  requireCondition(value.warehouse === 'SYNTH-LOCAL', 'tool-argument-warehouse')
  requireCondition(value.include_reserved === true, 'tool-argument-reserved')
  requireCondition(value.nonce === SYNTHETIC_NONCE, 'tool-argument-nonce')
  return value
}

function executeSyntheticInventory(argumentsValue) {
  requireCondition(
    argumentsValue.item_code === 'MASHIRO-SYNTH-17' &&
      argumentsValue.warehouse === 'SYNTH-LOCAL' &&
      argumentsValue.include_reserved === true &&
      argumentsValue.nonce === SYNTHETIC_NONCE,
    'trusted-tool-validation'
  )
  return {
    item_code: 'MASHIRO-SYNTH-17',
    availability: 'available',
    quantity: 7,
    reserved: 2,
    source: 'synthetic-local-fixture'
  }
}

function validateStructuredSummary(text) {
  let value
  try {
    value = JSON.parse(text)
  } catch {
    throw new ProbeFailure('structured-json')
  }
  requireCondition(
    exactObject(value, ['available_quantity', 'item_code', 'source', 'status']),
    'structured-properties'
  )
  requireCondition(value.status === 'qualified', 'structured-status')
  requireCondition(value.item_code === 'MASHIRO-SYNTH-17', 'structured-item')
  requireCondition(value.available_quantity === 7, 'structured-quantity')
  requireCondition(value.source === 'synthetic-local-fixture', 'structured-source')
  return value
}

function loadApiKey() {
  const direct = process.env.MASHIRO_PROVIDER_TEST_KEY
  const requestedFile = process.env.MASHIRO_PROVIDER_TEST_KEY_FILE
  delete process.env.MASHIRO_PROVIDER_TEST_KEY
  delete process.env.MASHIRO_PROVIDER_TEST_KEY_FILE
  requireCondition(!(direct && requestedFile), 'credential-source-conflict')
  let source
  let value
  if (direct) {
    source = 'environment'
    value = direct
  } else if (requestedFile) {
    requireCondition(isAbsolute(requestedFile), 'credential-file-not-absolute')
    let canonical
    try {
      requireCondition(!lstatSync(requestedFile).isSymbolicLink(), 'credential-file-symlink')
      canonical = realpathSync(requestedFile)
      requireCondition(!inside(projectRoot, canonical), 'credential-file-in-repository')
      const bytes = readFileSync(canonical)
      requireCondition(bytes.byteLength <= 8192, 'credential-file-too-large')
      value = new TextDecoder('utf-8', { fatal: true }).decode(bytes).trim()
    } catch (error) {
      if (error instanceof ProbeFailure) throw error
      throw new ProbeFailure('credential-file-unavailable')
    }
    source = 'external-file'
  } else {
    throw new ProbeFailure('credential-missing')
  }
  requireCondition(
    typeof value === 'string' && value.length >= 8 && value.length <= 8192,
    'credential-shape'
  )
  requireCondition(!/\s/u.test(value), 'credential-whitespace')
  return { source, value }
}

function toolDefinition() {
  return {
    type: 'function',
    function: {
      name: 'lookup_synthetic_inventory',
      description: 'Read one deterministic synthetic in-memory inventory fixture.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          item_code: { type: 'string', enum: ['MASHIRO-SYNTH-17'] },
          warehouse: { type: 'string', enum: ['SYNTH-LOCAL'] },
          include_reserved: { type: 'boolean', enum: [true] },
          nonce: { type: 'string', enum: [SYNTHETIC_NONCE] }
        },
        required: ['item_code', 'warehouse', 'include_reserved', 'nonce']
      }
    }
  }
}

function commonRequest() {
  return {
    model: MODEL,
    stream: true,
    tool_stream: true,
    thinking: { type: 'enabled', clear_thinking: false },
    reasoning_effort: 'low',
    max_tokens: 1024,
    request_id: randomUUID()
  }
}

function hashText(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex').toUpperCase()
}

async function runLiveProbe() {
  const credential = loadApiKey()
  const tools = [toolDefinition()]
  const userMessage = {
    role: 'user',
    content:
      'Use lookup_synthetic_inventory exactly once with every required exact value. Do not answer before the tool result. After the tool result, answer with the item code, availability, quantity, and reserved count.'
  }

  stage = 'tool-request'
  const first = await streamCompletion(credential.value, {
    ...commonRequest(),
    messages: [userMessage],
    tools,
    tool_choice: 'auto'
  })
  partialEvidence.toolRequest = summarizeStream(first)
  requireCondition(first.finishReason === 'tool_calls', 'tool-finish')
  requireCondition(first.toolCalls.length === 1, 'tool-call-count')
  const call = first.toolCalls[0]
  requireCondition(call.id.length >= 1 && call.id.length <= 256, 'tool-call-id')
  requireCondition(call.type === 'function', 'tool-call-type')
  requireCondition(call.name === 'lookup_synthetic_inventory', 'tool-call-name')
  const toolArguments = validateToolArguments(call.arguments)

  stage = 'trusted-tool-execution'
  let toolExecutions = 0
  const toolResult = executeSyntheticInventory(toolArguments)
  toolExecutions += 1
  requireCondition(toolExecutions === 1, 'tool-execution-count')
  partialEvidence.trustedTool = { executions: toolExecutions, locallyValidated: true }

  stage = 'tool-continuation'
  const assistantToolMessage = {
    role: 'assistant',
    content: first.content,
    tool_calls: [
      {
        id: call.id,
        type: 'function',
        function: { name: call.name, arguments: call.arguments }
      }
    ]
  }
  if (first.reasoning) assistantToolMessage.reasoning_content = first.reasoning
  const second = await streamCompletion(credential.value, {
    ...commonRequest(),
    messages: [
      userMessage,
      assistantToolMessage,
      { role: 'tool', tool_call_id: call.id, content: JSON.stringify(toolResult) }
    ],
    tools,
    tool_choice: 'auto'
  })
  partialEvidence.toolContinuation = summarizeStream(second)
  requireCondition(second.finishReason === 'stop', 'continuation-finish')
  requireCondition(second.toolCalls.length === 0, 'continuation-extra-tool')
  requireCondition(second.content.length > 0, 'continuation-empty')
  const finalMarkers = {
    itemCode: second.content.includes('MASHIRO-SYNTH-17'),
    availability: second.content.toLowerCase().includes('available'),
    quantity: /(?:^|\D)7(?:\D|$)/u.test(second.content),
    reserved: /(?:^|\D)2(?:\D|$)/u.test(second.content)
  }
  requireCondition(Object.values(finalMarkers).every(Boolean), 'continuation-markers')

  stage = 'structured-summary'
  const third = await jsonCompletion(credential.value, {
    model: MODEL,
    stream: false,
    thinking: { type: 'enabled' },
    reasoning_effort: 'low',
    max_tokens: 1024,
    request_id: randomUUID(),
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          'Return only a JSON object with exactly these keys and values: status="qualified", item_code="MASHIRO-SYNTH-17", available_quantity=7, source="synthetic-local-fixture".'
      },
      {
        role: 'user',
        content: 'Summarize the deterministic synthetic fixture in the required JSON object.'
      }
    ]
  })
  partialEvidence.structuredSummary = {
    responseChars: third.content.length,
    reasoningObserved: third.reasoning.length > 0,
    reasoningChars: third.reasoning.length,
    usage: third.usage
  }
  validateStructuredSummary(third.content)
  requireCondition(requestsAttempted === 3, 'request-count')

  return {
    probeVersion: PROBE_VERSION,
    outcome: 'PASS',
    endpointHost: new URL(ENDPOINT).host,
    model: MODEL,
    credentialSource: credential.source,
    requestsAttempted,
    toolLoop: {
      toolCalls: first.toolCalls.length,
      argumentFragments: first.argumentFragments,
      fragmentedArgumentsObserved: first.argumentFragments > 1,
      firstReasoningPresent: first.reasoning.length > 0,
      firstReasoningChars: first.reasoning.length,
      firstReasoningFragments: first.reasoningFragments,
      trustedExecutions: toolExecutions,
      continuationReasoningPresent: second.reasoning.length > 0,
      continuationReasoningChars: second.reasoning.length,
      finalAnswerChars: second.content.length,
      finalAnswerSha256: hashText(second.content),
      finalMarkers,
      firstUsage: first.usage,
      continuationUsage: second.usage
    },
    structuredOutput: {
      locallyValidated: true,
      responseChars: third.content.length,
      responseSha256: hashText(third.content),
      reasoningPresent: third.reasoning.length > 0,
      reasoningChars: third.reasoning.length,
      usage: third.usage
    },
    disclosure: {
      requestBodiesLogged: false,
      responseBodiesLogged: false,
      toolArgumentsLogged: false,
      toolResultLogged: false,
      reasoningLogged: false,
      credentialLogged: false
    }
  }
}

async function selfCheck() {
  const definition = toolDefinition()
  requireCondition(
    definition.function.parameters.additionalProperties === false,
    'self-check-schema'
  )
  const fixture = executeSyntheticInventory({
    item_code: 'MASHIRO-SYNTH-17',
    warehouse: 'SYNTH-LOCAL',
    include_reserved: true,
    nonce: SYNTHETIC_NONCE
  })
  validateStructuredSummary(
    JSON.stringify({
      status: 'qualified',
      item_code: fixture.item_code,
      available_quantity: fixture.quantity,
      source: fixture.source
    })
  )

  let timeoutOraclePass = false
  const hangingFetcher = async (_url, options) => {
    const body = new ReadableStream({
      start(controller) {
        options.signal.addEventListener(
          'abort',
          () => controller.error(new DOMException('Aborted', 'AbortError')),
          { once: true }
        )
      }
    })
    return new Response(body, { headers: { 'content-type': 'text/event-stream' } })
  }
  try {
    await providerRequest(
      'synthetic-self-check-key',
      { model: 'synthetic-self-check' },
      'text/event-stream',
      { fetcher: hangingFetcher, timeoutMs: 10, countRequest: false }
    )
  } catch (error) {
    timeoutOraclePass = error instanceof ProbeFailure && error.category === 'timeout'
  }
  requireCondition(timeoutOraclePass, 'self-check-body-timeout')

  return {
    probeVersion: PROBE_VERSION,
    outcome: 'SELF_CHECK_PASS',
    networkRequests: 0,
    endpointHost: new URL(ENDPOINT).host,
    model: MODEL,
    plannedLiveRequests: 3,
    bodyTimeoutOracle: true,
    credentialSources: ['MASHIRO_PROVIDER_TEST_KEY', 'MASHIRO_PROVIDER_TEST_KEY_FILE'],
    syntheticOnly: true
  }
}

async function main() {
  const mode = process.argv[2]
  requireCondition(process.argv.length === 3, 'usage')
  if (mode === '--self-check') return selfCheck()
  requireCondition(mode === '--run', 'usage')
  return await runLiveProbe()
}

try {
  const result = await main()
  process.stdout.write(JSON.stringify(result, null, 2) + '\n')
} catch (error) {
  const failure =
    error instanceof ProbeFailure
      ? { category: error.category, ...error.details }
      : { category: 'internal' }
  process.stdout.write(
    JSON.stringify(
      {
        probeVersion: PROBE_VERSION,
        outcome: 'FAIL',
        endpointHost: new URL(ENDPOINT).host,
        model: MODEL,
        stage,
        requestsAttempted,
        failure,
        ...(Object.keys(partialEvidence).length > 0 ? { evidence: partialEvidence } : {})
      },
      null,
      2
    ) + '\n'
  )
  process.exitCode = 1
}
