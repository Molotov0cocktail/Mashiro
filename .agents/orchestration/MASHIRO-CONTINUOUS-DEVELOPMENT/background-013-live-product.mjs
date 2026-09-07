import process from 'node:process'
import { mkdtempSync, writeFileSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import { randomUUID, createHash } from 'node:crypto'
import { build } from 'esbuild'

// An explicit synthetic product-service runner, never imported by the application.
const preflight = process.argv[2] === '--preflight'
if (!preflight && process.argv[2] !== '--run') throw new Error('EXPLICIT_MODE_REQUIRED')
const key = preflight ? 'synthetic-no-network' : process.env.MASHIRO_PROVIDER_TEST_KEY
delete process.env.MASHIRO_PROVIDER_TEST_KEY
if (!key || /\s/.test(key)) throw new Error('PROCESS_CREDENTIAL_UNAVAILABLE')
const root = mkdtempSync(join(tmpdir(), 'mashiro-background-live-'))
const canonical = realpathSync(root)
const child = relative(realpathSync(tmpdir()), canonical)
if (!child || child.startsWith('..') || /[/\\]/.test(child)) throw new Error('INVALID_SYNTHETIC_ROOT')
const ensure = (ok, code) => { if (!ok) throw new Error(code) }
const checked = result => { ensure(result.ok, 'PRODUCT_' + (result.error?.code ?? 'ERROR')); return result.data }
const pause = milliseconds => new Promise(resolve => globalThis.setTimeout(resolve, milliseconds))
const originalFetch = globalThis.fetch
const wire = []
const chats = []
let service
let assistants
let calls = 0
let phase = 'setup'
let retain = false
let bundleSha256 = null
const marker = 'SYNTHETIC_' + randomUUID()
let chapterReopened
let restoredCalls
let selectedSummarySent = false
let acceptedUsage = null
try {
  const built = await build({
    stdin: { contents: "export {ProviderService} from './src/main/provider/provider-service.ts';export {AssistantService} from './src/main/assistant/assistant-service.ts';", resolveDir: 'D:/Mashiro', loader: 'ts' },
    bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent'
  })
  bundleSha256 = createHash('sha256').update(built.outputFiles[0].text).digest('hex')
  const bundlePath = join(root, 'product.mjs')
  writeFileSync(bundlePath, built.outputFiles[0].text, { flag: 'wx' })
  const { ProviderService, AssistantService } = await import(pathToFileURL(bundlePath).href)
  const databasePath = join(root, 'synthetic.sqlite')
  assistants = AssistantService.open(databasePath)
  const assistantId = checked(assistants.create({ protocolVersion: 1, displayName: '合成章节验证', expectedStateRevision: 0 })).assistants[0].id
  const base = { protocolVersion: 1, assistantId }
  const protector = { isEncryptionAvailable: () => false, encryptString: () => { throw new Error('NO_PERSISTENCE') }, decryptString: () => { throw new Error('NO_PERSISTENCE') } }
  service = ProviderService.open(databasePath, join(root, 'credentials'), protector)
  const connectionId = checked(service.saveConnection({ protocolVersion: 1, displayName: '合成后台端点', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', enabled: true })).connections[0].id
  checked(service.setCredential({ protocolVersion: 1, connectionId, apiKey: key, persistence: 'temporary' }))
  checked(service.bindAssistant({ ...base, connectionId, model: 'GLM-5.3-FLASH', expectedVersion: null }))
  const history = checked(service.permissions(base))
  checked(service.setPermissions({ ...base, connectionId: history.connectionId, endpointFingerprint: history.endpointFingerprint, expectedVersion: history.version, readHistory: true, sendHistory: true }))
  const permission = checked(service.memory.permissions({ ...base, scope: 'assistant' }))
  checked(service.memory.setPermissions({ ...base, scope: 'assistant', expectedVersion: permission.version, read: true, write: true, writeInferences: false, receive: true }))
  globalThis.fetch = async (url, options) => {
    ensure(String(url) === 'https://open.bigmodel.cn/api/paas/v4/chat/completions', 'ENDPOINT_MISMATCH')
    ensure(calls < 3, 'REQUEST_CEILING')
    const body = JSON.parse(options.body)
    ensure(body.model === 'GLM-5.3-FLASH' && !body.tools?.length && body.stream === false, 'ADAPTER_MISMATCH')
    if (phase === 'background') ensure(Number.isInteger(body.max_tokens) && body.max_tokens <= 2048, 'BACKGROUND_OUTPUT_UNBOUNDED')
    const serialized = JSON.stringify(body.messages)
    if (phase === 'background' || phase === 'selected') ensure(serialized.includes(marker), 'SOURCE_MARKER_MISSING')
    if (phase === 'selected') selectedSummarySent = body.messages.some(message => message.role === 'system' && message.content?.includes(marker))
    const observation = { request: ++calls, phase, maxTokens: body.max_tokens ?? null, markerPresent: serialized.includes(marker), httpStatus: null }
    wire.push(observation)
    const text = phase === 'background'
      ? JSON.stringify({ title: '合成记录', summary: '用户确认合成档案代号为 ' + marker + '，无待办要求。', unfinishedTopics: [] })
      : marker
    const response = preflight
      ? new globalThis.Response(JSON.stringify({ id: 'synthetic', choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: text } }], usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } }), { status: 200, headers: { 'content-type': 'application/json' } })
      : await originalFetch(url, options)
    observation.httpStatus = response.status
    return response
  }
  const chat = async (text, context) => {
    const result = await service.startChat({ ...base, requestId: randomUUID(), text, mode: 'normal', context, tools: 'off', stream: false }, () => undefined)
    chats.push({ phase, ok: result.ok, status: result.ok ? result.data.status : null, usage: result.ok ? result.data.usage : null, errorCode: result.ok ? null : result.error.code })
    ensure(result.ok && result.data.status === 'completed', 'CHAT_INCOMPLETE')
    ensure(result.data.text.includes(marker), 'CHAT_MARKER_MISSING')
  }
  ensure(checked(service.background.query(base)).configuration.enabled === false, 'DEFAULT_NOT_DISABLED')
  phase = 'seed'
  await chat('这是纯合成档案事实：本次档案代号为 ' + marker + '。没有待办或提醒要求。请只简短复述代号。', { kind: 'none' })
  ensure(calls === 1 && checked(service.background.query(base)).jobs.length === 0, 'DEFAULT_BACKGROUND_CALLED')
  phase = 'background'
  checked(service.background.configure({ ...base, expectedVersion: 0, grantSelectedRecipient: true, settings: {
    enabled: true, connectionId, model: 'GLM-5.3-FLASH', allowOwnCompletedRounds: true,
    budget: { window: 'utc-day', calls: 1, inputCharacters: 30000 }
  } }))
  checked(service.background.run(base))
  const deadline = Date.now() + 60000
  let snapshot
  do {
    snapshot = checked(service.background.query(base))
    if (snapshot.jobs.some(job => ['COMPLETED', 'FAILED_CONFIRMED', 'REMOTE_UNKNOWN', 'PERMISSION_BLOCKED', 'STALE'].includes(job.state))) break
    await pause(100)
  } while (Date.now() < deadline)
  ensure(snapshot.jobs.length === 1 && snapshot.jobs[0].state === 'COMPLETED', 'BACKGROUND_NOT_ACCEPTED')
  ensure(snapshot.usage.calls === 1, 'BUDGET_NOT_RECORDED')
  const chapter = snapshot.chapters[0]
  ensure(chapter && snapshot.jobs[0].receipt?.memoryId === chapter.memoryId, 'ACCEPTED_RECEIPT_MISSING')
  const accepted = checked(service.background.chapter({ ...base, chapterId: chapter.id, expectedVersion: chapter.version }))
  ensure(accepted.markdown.includes(marker), 'SUMMARY_NOT_FAITHFUL')
  acceptedUsage = snapshot.usage
  // Keep the accepted object and budget, but stop creating further work for the context check.
  checked(service.background.configure({ ...base, expectedVersion: snapshot.configuration.version, grantSelectedRecipient: false, settings: {
    enabled: false, connectionId, model: 'GLM-5.3-FLASH', allowOwnCompletedRounds: true,
    budget: { window: 'utc-day', calls: 1, inputCharacters: 30000 }
  } }))
  phase = 'selected'
  await chat('请只回答所选章节记载的合成档案代号。', { kind: 'chapters', chapters: [{ id: chapter.id, expectedVersion: chapter.version }] })
  ensure(selectedSummarySent && calls === 3, 'SELECTED_CHAPTER_NOT_SENT')
  service.close()
  service = undefined
  const beforeReopen = calls
  phase = 'reopen'
  service = ProviderService.open(databasePath, join(root, 'credentials'), protector)
  const reopened = checked(service.background.chapter({ ...base, chapterId: chapter.id, expectedVersion: chapter.version }))
  chapterReopened = reopened.markdown === accepted.markdown
  await pause(1200)
  restoredCalls = calls - beforeReopen
  ensure(chapterReopened && restoredCalls === 0, 'REOPEN_CONTINUITY_FAILED')
  ensure(checked(service.background.query(base)).usage.calls === 1, 'REOPEN_BUDGET_LOST')
  process.stdout.write(JSON.stringify({ outcome: preflight ? 'LOCAL_PREFLIGHT_PASS' : 'SUPPORTED', bundleSha256, requestsAttempted: preflight ? 0 : calls, syntheticTransportCalls: preflight ? calls : 0, wire, chats, acceptedUsage, chapterReopened, restoredCalls, selectedSummarySent,
    disclosure: { rendererDriven: false, processRestart: false, packaged: false, actualAcceptedMarkdown: true, normalRoundSource: true, bodyLogged: false, credentialPersisted: false } }) + '\n')
} catch (error) {
  retain = true
  process.stdout.write(JSON.stringify({ outcome: 'INCONCLUSIVE', phase, bundleSha256, requestsAttempted: preflight ? 0 : calls, syntheticTransportCalls: preflight ? calls : 0, wire, chats, acceptedUsage, retainedSyntheticRoot: canonical, reason: error instanceof Error && /^[A-Z][A-Z_]{1,70}$/.test(error.message) ? error.message : 'LOCAL_OR_PRODUCT_FAILURE' }) + '\n')
  process.exitCode = 1
} finally {
  service?.close()
  assistants?.close()
  globalThis.fetch = originalFetch
  if (!retain && realpathSync(root) === canonical) rmSync(root, { recursive: true })
}
