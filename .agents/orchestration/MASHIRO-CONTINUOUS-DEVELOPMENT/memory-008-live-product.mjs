import process from 'node:process'
import console from 'node:console'
import { mkdtempSync, writeFileSync, rmSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'
import { build } from 'esbuild'
import { observeSyntheticToolStream } from './memory-008-sse-observer.mjs'

const preflight = process.argv[2] === '--preflight'
if (!preflight && process.argv[2] !== '--run') throw new Error('Explicit --run or --preflight required')
const key = preflight ? 'synthetic-no-network' : process.env.MASHIRO_PROVIDER_TEST_KEY
delete process.env.MASHIRO_PROVIDER_TEST_KEY
if (!key || /\s/.test(key)) throw new Error('Process credential unavailable')
const project = resolve('D:/Mashiro')
const root = mkdtempSync(join(tmpdir(), 'mashiro-memory-product-live-'))
const canonical = realpathSync(root)
if (relative(realpathSync(tmpdir()), canonical).startsWith('..')) throw new Error('Invalid temporary root')
const fetchOriginal = globalThis.fetch
const code = `MT-${randomUUID()}`
const observed = []
const responses = []
const observationTasks = []
let service
let phase = 'write'
let calls = 0
let retainSyntheticFailure = false
let recallInitialChecked = false
const requireOk = (result) => {
  if (!result.ok) throw new Error(`Product fixture: ${result.error.code}`)
  return result.data
}
try {
  const bundle = await build({
    stdin: { contents: "export {ProviderService} from './src/main/provider/provider-service.ts';export {AssistantService} from './src/main/assistant/assistant-service.ts';export {memoryCreateToolSchema,memoryCorrectToolSchema,memoryRemovalSchema} from './src/shared/memory-contract.ts';", resolveDir: project, loader: 'ts' },
    bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent'
  })
  const modulePath = join(root, 'product.mjs')
  writeFileSync(modulePath, bundle.outputFiles[0].text, { flag: 'wx' })
  const { ProviderService, AssistantService, memoryCreateToolSchema, memoryCorrectToolSchema, memoryRemovalSchema } = await import(pathToFileURL(modulePath).href)
  const database = join(root, 'synthetic.sqlite')
  const assistant = AssistantService.open(database)
  const created = requireOk(assistant.create({ protocolVersion: 1, displayName: '合成记忆资格', expectedStateRevision: 0 }))
  const assistantId = created.assistants[0].id
  assistant.close()
  globalThis.fetch = async (url, options) => {
    if (String(url) !== 'https://open.bigmodel.cn/api/paas/v4/chat/completions' || calls >= 6) throw new Error('Fixed live request ceiling')
    const body = JSON.parse(options.body)
    if (body.model !== 'GLM-5.3-FLASH' || body.thinking.type !== 'enabled' || body.thinking.clear_thinking !== true || body.reasoning_effort !== 'low' || body.max_tokens !== 2048) throw new Error('Unexpected product adapter')
    if (phase === 'recall' && !recallInitialChecked) {
      // The new user turn carries neither the answer nor the old conversation.
      if (JSON.stringify(body.messages).includes(code) || body.messages.some((message) => message.role === 'assistant' || message.role === 'tool')) throw new Error('Recall answer leaked through initial context')
      recallInitialChecked = true
    }
    const toolResults = body.messages.filter((message) => message.role === 'tool')
    for (const result of toolResults) {
      if (!body.messages.some((message) => message.role === 'assistant' && message.tool_calls?.some((call) => call.id === result.tool_call_id))) throw new Error('Unmatched tool result')
    }
    calls++
    observed.push({ request: calls, phase, toolResultPresent: toolResults.length > 0, recallCodeInToolResult: phase === 'recall' && toolResults.some((result) => result.content.includes(code)), stream: body.stream === true })
    const response = await fetchOriginal(url, options)
    observed.at(-1).httpStatus = response.status
    const contentType = response.headers.get('content-type')?.split(';')[0]
    observed.at(-1).contentType = ['text/event-stream', 'application/json'].includes(contentType) ? contentType : '<other>'
    if (!response.ok) {
      try {
        const rejected = await response.clone().json()
        const errorCode = String(rejected.error?.code ?? rejected.code ?? '')
        if (/^[A-Za-z0-9_-]{1,50}$/.test(errorCode)) observed.at(-1).providerErrorCode = errorCode
      } catch { /* Never emit a provider error body. */ }
    }
    if (response.ok) {
      const observation = observed.at(-1)
      const originalUserText = body.messages.filter(message => message.role === 'user').map(message => message.content).join('\n')
      observationTasks.push(observeSyntheticToolStream(response.clone(), { write_memory: memoryCreateToolSchema, correct_memory: memoryCorrectToolSchema, request_memory_removal: memoryRemovalSchema }, originalUserText).then(summary => { observation.sse = summary }, () => { observation.sse = { incomplete: true } }))
    }
    return response
  }
  const protector = { isEncryptionAvailable: () => false, encryptString: () => { throw new Error('No persistence') }, decryptString: () => { throw new Error('No persistence') } }
  const credentialDirectory = join(root, 'credentials')
  service = ProviderService.open(database, credentialDirectory, protector)
  const connectionId = requireOk(service.saveConnection({ protocolVersion: 1, displayName: '合成固定端点', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', enabled: true })).connections[0].id
  const supplyCredential = () => requireOk(service.setCredential({ protocolVersion: 1, connectionId, apiKey: key, persistence: 'temporary' }))
  supplyCredential()
  requireOk(service.bindAssistant({ protocolVersion: 1, assistantId, connectionId, model: 'GLM-5.3-FLASH', expectedVersion: null }))
  const history = requireOk(service.permissions({ protocolVersion: 1, assistantId }))
  requireOk(service.setPermissions({ protocolVersion: 1, assistantId, connectionId: history.connectionId, endpointFingerprint: history.endpointFingerprint, expectedVersion: history.version, readHistory: true, sendHistory: true }))
  const permission = requireOk(service.memory.permissions({ protocolVersion: 1, assistantId, scope: 'global' }))
  requireOk(service.memory.setPermissions({ protocolVersion: 1, assistantId, scope: 'global', expectedVersion: permission.version, read: true, write: true, writeInferences: false, receive: true }))
  if (preflight) throw new Error('Local preflight complete')
  const writeId = randomUUID()
  const writeResult = await service.startChat({ protocolVersion: 1, requestId: writeId, assistantId, text: `这是合成应用资格测试。请立即记住这条全局用户记忆：我的合成收藏代码是${code}。它是用户陈述，正文原样保存这一句，不要推测，不要调用时钟。只保存一次，成功后简短确认。`, mode: 'normal', context: { kind: 'none' }, tools: 'clock-and-memory', stream: true }, () => {})
  responses.push(writeResult)
  await Promise.allSettled(observationTasks)
  const before = requireOk(service.memory.query({ protocolVersion: 1, assistantId, query: '合成收藏代码' })).records
  if (!writeResult.ok || writeResult.data.status !== 'completed' || before.length !== 1 || !before[0].markdown.includes(code)) throw new Error('Actual business write incomplete')
  const original = { id: before[0].id, version: before[0].objectVersion }
  const beforeOperations = requireOk(service.tools({ protocolVersion: 1, assistantId, mode: 'normal' })).operations
  if (beforeOperations.filter((operation) => operation.toolName === 'write_memory' && operation.state === 'SUCCEEDED').length !== 1) throw new Error('Missing unique trusted write receipt')
  const callsBeforeReopen = calls
  service.close()
  service = ProviderService.open(database, credentialDirectory, protector)
  if (calls !== callsBeforeReopen) throw new Error('Recovery caused an external request')
  supplyCredential()
  phase = 'recall'
  const recallResult = await service.startChat({ protocolVersion: 1, requestId: randomUUID(), assistantId, text: '这是下一轮合成资格测试。请检索记忆中的“合成收藏代码”，回答我保存的完整收藏代码。不要猜测，不要创建或修改记忆，不要调用时钟。', mode: 'normal', context: { kind: 'none' }, tools: 'clock-and-memory', stream: true }, () => {})
  responses.push(recallResult)
  await Promise.allSettled(observationTasks)
  const after = requireOk(service.memory.query({ protocolVersion: 1, assistantId, query: '合成收藏代码' })).records
  const operations = requireOk(service.tools({ protocolVersion: 1, assistantId, mode: 'normal' })).operations
  const inspect = requireOk(service.memory.inspect({ protocolVersion: 1, assistantId, id: original.id }))
  const outcome = recallResult.ok && recallResult.data.status === 'completed' && recallResult.data.text.includes(code) && observed.some((request) => request.recallCodeInToolResult) && after.length === 1 && after[0].id === original.id && after[0].objectVersion === original.version && operations.filter((operation) => operation.toolName === 'write_memory' && operation.state === 'SUCCEEDED').length === 1 ? 'SUPPORTED' : 'INCONCLUSIVE'
  console.log(JSON.stringify({ outcome, endpoint: 'https://open.bigmodel.cn/api/paas/v4', model: 'GLM-5.3-FLASH', requestsAttempted: calls, wire: observed, usages: responses.map((response) => response.ok ? response.data.usage : null), acceptedObjects: after.length, acceptedVersionUnchangedByRecall: after[0]?.objectVersion === original.version, replyUsesExactRetrievedCode: recallResult.ok && recallResult.data.text.includes(code), recoveryRequests: callsBeforeReopen === observed.filter((request) => request.phase === 'write').length ? 0 : null, operationStates: operations.map((operation) => ({ tool: operation.toolName, state: operation.state })), sourceCount: inspect.record.sources.length, changeCount: inspect.changes.length, disclosure: { bodyLogged: false, credentialPersisted: false, rendererDriven: false, processRestart: false, serviceReopened: true } }))
  if (outcome !== 'SUPPORTED') process.exitCode = 1
} catch (error) {
  if (preflight && error instanceof Error && error.message === 'Local preflight complete' && calls === 0) {
    console.log(JSON.stringify({ outcome: 'LOCAL_PREFLIGHT_PASS', requestsAttempted: 0, schemaAndGrantsInitialized: true, noCredentialUsed: true }))
  } else {
  retainSyntheticFailure = true
  console.log(JSON.stringify({ outcome: 'INCONCLUSIVE', retainedSyntheticRoot: canonical, productResults: responses.map(response => ({ ok: response.ok, status: response.ok ? response.data.status : null, errorCode: response.ok ? null : response.error.code })), requestsAttempted: calls, wire: observed, usages: responses.map((response) => response.ok ? response.data.usage : null), reason: error instanceof Error && /^(Product fixture: [A-Z_]+|Fixed live request ceiling|Unexpected product adapter|Recall answer leaked through initial context|Unmatched tool result|Actual business write incomplete|Missing unique trusted write receipt|Recovery caused an external request)$/.test(error.message) ? error.message : 'Fixture or product validation failed; inspect locally without logging bodies' }))
  process.exitCode = 1
  }
} finally {
  try { service?.close() } finally { globalThis.fetch = fetchOriginal; if (!retainSyntheticFailure && realpathSync(root) === canonical) rmSync(root, { recursive: true }) }
}
