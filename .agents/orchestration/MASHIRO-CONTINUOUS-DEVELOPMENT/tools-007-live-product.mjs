import process from 'node:process'
import console from 'node:console'
import { mkdtempSync, writeFileSync, rmSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'
import { build } from 'esbuild'
import { DatabaseSync } from 'node:sqlite'

if (process.argv[2] !== '--run') throw new Error('Explicit --run required')
const key = process.env.MASHIRO_PROVIDER_TEST_KEY
delete process.env.MASHIRO_PROVIDER_TEST_KEY
if (!key || /\s/.test(key)) throw new Error('Process credential unavailable')
const project = resolve('D:/Mashiro')
const root = mkdtempSync(join(tmpdir(), 'mashiro-tools-product-live-'))
const canonical = realpathSync(root)
if (relative(realpathSync(tmpdir()), canonical).startsWith('..'))
  throw new Error('Invalid temporary root')
let service
const fetchOriginal = globalThis.fetch
const observed = []
let calls = 0
let expectedUtc
try {
  const bundle = await build({
    stdin: {
      contents:
        "export {ProviderService} from './src/main/provider/provider-service.ts';export {AssistantService} from './src/main/assistant/assistant-service.ts';",
      resolveDir: project,
      loader: 'ts'
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
    logLevel: 'silent'
  })
  const modulePath = join(root, 'product.mjs')
  writeFileSync(modulePath, bundle.outputFiles[0].text, { flag: 'wx' })
  const { ProviderService, AssistantService } = await import(pathToFileURL(modulePath).href)
  const db = join(root, 'synthetic.sqlite')
  const assistant = AssistantService.open(db)
  const created = assistant.create({
    protocolVersion: 1,
    displayName: '合成工具资格',
    expectedStateRevision: 0
  })
  if (!created.ok) throw new Error('Fixture')
  const assistantId = created.data.assistants[0].id
  assistant.close()
  globalThis.fetch = async (url, options) => {
    if (String(url) !== 'https://open.bigmodel.cn/api/paas/v4/chat/completions' || calls >= 2)
      throw new Error('Fixed live request ceiling')
    const body = JSON.parse(options.body)
    if (
      body.model !== 'GLM-5.3-FLASH' ||
      body.thinking.type !== 'enabled' ||
      body.thinking.clear_thinking !== true ||
      body.reasoning_effort !== 'low' ||
      body.max_tokens !== 2048
    )
      throw new Error('Unexpected product adapter')
    const final = body.messages.at(-1)
    if (final?.role === 'tool') {
      const previous = body.messages.at(-2)
      if (
        previous?.tool_calls?.length !== 1 ||
        previous.tool_calls[0].id !== final.tool_call_id ||
        previous.tool_calls[0].function.name !== 'get_current_time'
      )
        throw new Error('Tool relationship mismatch')
      const clock = JSON.parse(final.content)
      if (
        Object.keys(clock).sort().join(',') !== 'offsetMinutes,timeZone,utc' ||
        !Number.isFinite(Date.parse(clock.utc))
      )
        throw new Error('Clock result mismatch')
      expectedUtc = clock.utc
    }
    calls++
    observed.push({
      request: calls,
      stream: body.stream,
      toolStream: body.tool_stream === true,
      clearThinking: body.thinking.clear_thinking,
      toolResultPresent: body.messages.some((m) => m.role === 'tool'),
      reasoningPresent: body.messages.some(
        (m) => typeof m.reasoning_content === 'string' && m.reasoning_content.length > 0
      )
    })
    return fetchOriginal(url, options)
  }
  const protector = {
    isEncryptionAvailable: () => false,
    encryptString: () => {
      throw new Error('No persistence')
    },
    decryptString: () => {
      throw new Error('No persistence')
    }
  }
  service = ProviderService.open(db, join(root, 'credentials'), protector)
  const saved = service.saveConnection({
    protocolVersion: 1,
    displayName: '合成固定端点',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    enabled: true
  })
  if (!saved.ok) throw new Error('Fixture')
  const connectionId = saved.data.connections[0].id
  if (
    !service.setCredential({
      protocolVersion: 1,
      connectionId,
      apiKey: key,
      persistence: 'temporary'
    }).ok
  )
    throw new Error('Credential fixture')
  if (
    !service.bindAssistant({
      protocolVersion: 1,
      assistantId,
      connectionId,
      model: 'GLM-5.3-FLASH',
      expectedVersion: null
    }).ok
  )
    throw new Error('Binding fixture')
  const result = await service.startChat(
    {
      protocolVersion: 1,
      requestId: randomUUID(),
      assistantId,
      text: '这是一项合成应用资格测试。请调用 get_current_time 工具获取当前真实时间，然后用中文简短回答，必须原样包含工具结果 utc 字段的完整字符串（保留毫秒与Z）。不要估算或跳过工具。只调用一次。',
      mode: 'normal',
      context: { kind: 'none' },
      tools: 'clock',
      stream: true
    },
    () => {}
  )
  const operations = service.tools({ protocolVersion: 1, assistantId, mode: 'normal' })
  const capability = service.capabilities({ protocolVersion: 1, assistantId })
  const state = operations.ok ? operations.data.operations.map((o) => o.state) : []
  const database = new DatabaseSync(db)
  const segments = database.prepare('SELECT messages_json FROM protocol_segments').all()
  const reasoningMessages = segments
    .flatMap((s) => JSON.parse(s.messages_json))
    .filter((m) => typeof m.reasoning_content === 'string' && m.reasoning_content.length > 0).length
  database.close()
  const outcome =
    result.ok &&
    result.data.status === 'completed' &&
    state.length === 1 &&
    state[0] === 'SUCCEEDED' &&
    calls === 2 &&
    typeof expectedUtc === 'string' &&
    result.data.text.includes(expectedUtc)
      ? 'SUPPORTED'
      : 'INCONCLUSIVE'
  console.log(
    JSON.stringify({
      outcome,
      endpoint: 'https://open.bigmodel.cn/api/paas/v4',
      model: 'GLM-5.3-FLASH',
      adapter: 'glm-5.3-flash-tools-v1',
      requestsAttempted: calls,
      wire: observed,
      operationStates: state,
      replyCharacters: result.ok ? result.data.text.length : 0,
      replyUsesExactToolUtc:
        result.ok && typeof expectedUtc === 'string' && result.data.text.includes(expectedUtc),
      usage: result.ok ? result.data.usage : null,
      error: result.ok ? null : result.error.code,
      reasoningMessagesObserved: reasoningMessages,
      capabilityTools: capability.ok
        ? capability.data.evidence.find((e) => e.capability === 'tools').level
        : null,
      disclosure: { bodyLogged: false, reasoningLogged: false, credentialPersisted: false }
    })
  )
  if (outcome !== 'SUPPORTED') process.exitCode = 1
} finally {
  try {
    service?.close()
  } finally {
    globalThis.fetch = fetchOriginal
    if (realpathSync(root) === canonical) rmSync(root, { recursive: true })
  }
}
