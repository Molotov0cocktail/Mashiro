import process from 'node:process'
import { mkdtempSync, writeFileSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import { randomUUID, createHash } from 'node:crypto'
import { build } from 'esbuild'

const preflight = process.argv[2] === '--preflight'
if (!preflight && process.argv[2] !== '--run') throw new Error('EXPLICIT_MODE_REQUIRED')
const key = preflight ? 'synthetic-no-network' : process.env.MASHIRO_PROVIDER_TEST_KEY
delete process.env.MASHIRO_PROVIDER_TEST_KEY
if (!key || /\s/.test(key)) throw new Error('PROCESS_CREDENTIAL_UNAVAILABLE')
const root = mkdtempSync(join(tmpdir(), 'mashiro-reminders-live-'))
const canonical = realpathSync(root)
const child = relative(realpathSync(tmpdir()), canonical)
if (!child || child.startsWith('..') || /[/\\]/.test(child)) throw new Error('INVALID_SYNTHETIC_ROOT')
const ensure = (value, code) => { if (!value) throw new Error(code) }
const checked = result => { ensure(result.ok, 'PRODUCT_' + (result.error?.code ?? 'ERROR')); return result.data }
const originalFetch = globalThis.fetch
const wire = []
const rounds = []
let service
let assistants
let calls = 0
let phase = 'setup'
let retain = false
let bundleSha256 = null
let now = Date.now()
const clock = () => new Date(now)
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
  const snapshot = checked(assistants.create({ protocolVersion: 1, displayName: '合成提醒验证', expectedStateRevision: 0 }))
  const assistantId = snapshot.assistants[0].id
  assistants.close()
  assistants = undefined
  const protector = { isEncryptionAvailable: () => false, encryptString: () => { throw new Error('NO_PERSISTENCE') }, decryptString: () => { throw new Error('NO_PERSISTENCE') } }
  const open = () => ProviderService.open(databasePath, join(root, 'credentials'), protector, undefined, { clock })
  service = open()
  ensure(service.reminders, 'REMINDER_SERVICE_MISSING')
  const connectionId = checked(service.saveConnection({ protocolVersion: 1, displayName: '合成提醒端点',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4', enabled: true })).connections[0].id
  checked(service.setCredential({ protocolVersion: 1, connectionId, apiKey: key, persistence: 'temporary' }))
  checked(service.bindAssistant({ protocolVersion: 1, assistantId, connectionId, model: 'GLM-5.3-FLASH', expectedVersion: null }))
  const history = checked(service.permissions({ protocolVersion: 1, assistantId }))
  checked(service.setPermissions({ protocolVersion: 1, assistantId, connectionId: history.connectionId,
    endpointFingerprint: history.endpointFingerprint, expectedVersion: history.version, readHistory: true, sendHistory: true }))
  const permission = checked(service.items.permissions({ protocolVersion: 1, assistantId }))
  checked(service.items.setPermissions({ protocolVersion: 1, assistantId, expectedVersion: permission.version, read: true, write: true, propose: true, receive: true }))
  checked(service.items.mutate({ protocolVersion: 1, assistantId, commandId: randomUUID(), mutation: {
    action: 'create', content: { kind: 'task', title: '合成提醒事项', description: '仅合成验证', status: 'open',
      dueAt: null, timeZone: null, parentId: null, relatedIds: [], counterpart: '' }
  } }))
  const item = checked(service.items.query({ protocolVersion: 1, assistantId, limit: 100 })).items[0]
  const query = () => checked(service.reminders.query({ protocolVersion: 1, assistantId, itemId: item.id }))
  ensure(query().records.length === 0, 'PREEXISTING_REMINDER')
  globalThis.fetch = async (url, options) => {
    ensure(!preflight, 'PREFLIGHT_NETWORK_DENIED')
    ensure(String(url) === 'https://open.bigmodel.cn/api/paas/v4/chat/completions', 'ENDPOINT_MISMATCH')
    ensure(calls < 6, 'REQUEST_CEILING')
    const body = JSON.parse(options.body)
    ensure(body.model === 'GLM-5.3-FLASH' && body.max_tokens <= 2048, 'ADAPTER_MISMATCH')
    ensure(body.tools?.some(tool => tool.function.name === 'prepare_reminder'), 'REMINDER_TOOL_MISSING')
    for (const result of body.messages.filter(message => message.role === 'tool')) {
      ensure(body.messages.some(message => message.role === 'assistant' && message.tool_calls?.some(call => call.id === result.tool_call_id)), 'UNMATCHED_TOOL_RESULT')
    }
    const observation = { request: ++calls, phase, stream: body.stream === true, reminderToolPresent: true }
    wire.push(observation)
    const response = await originalFetch(url, options)
    observation.httpStatus = response.status
    return response
  }
  let preview
  if (!preflight) {
    phase = 'natural-language-preview'
    const tomorrow = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now + 86400000))
    const expectedTime = tomorrow + 'T09:00:00+08:00'
    const result = await service.startChat({ protocolVersion: 1, requestId: randomUUID(), assistantId,
      text: '我使用Asia/Shanghai时区，请明天上午九点提醒我处理当前选中的事项。请准备提醒供本机确认，不要改事项期限。',
      mode: 'normal', context: { kind: 'none' }, tools: 'items', stream: true,
      itemContext: { type: 'item', id: item.id, expectedVersion: item.version } }, () => {})
    rounds.push({ phase, ok: result.ok, status: result.ok ? result.data.status : null,
      usage: result.ok ? result.data.usage : null, errorCode: result.ok ? null : result.error.code })
    ensure(result.ok && result.data.status === 'completed', 'CHAT_INCOMPLETE')
    const operations = checked(service.tools({ protocolVersion: 1, assistantId, mode: 'normal' })).operations
    const candidates = operations.filter(operation => operation.toolName === 'prepare_reminder' && operation.reminderPreview?.state === 'PENDING')
    ensure(candidates.length === 1, 'PREVIEW_NOT_UNIQUE')
    preview = checked(service.reminders.preview({ protocolVersion: 1, assistantId, confirmationId: candidates[0].reminderPreview.confirmationId }))
    ensure(preview.mutation.action === 'create' && Date.parse(preview.mutation.dueAt) === Date.parse(expectedTime) && preview.mutation.timeZone === 'Asia/Shanghai', 'NATURAL_TIME_MISMATCH')
    ensure(query().records.length === 0, 'PREVIEW_ALREADY_SCHEDULED')
    phase = 'local-confirm'
    const receipt = checked(service.reminders.confirm({ protocolVersion: 1, assistantId, confirmationId: preview.confirmationId, accept: true }))
    const duplicate = checked(service.reminders.confirm({ protocolVersion: 1, assistantId, confirmationId: preview.confirmationId, accept: true }))
    ensure(receipt.state === 'SUCCEEDED' && JSON.stringify(receipt) === JSON.stringify(duplicate) && query().records.length === 1, 'CONFIRM_NOT_IDEMPOTENT')
  } else {
    phase = 'preflight-local-plan'
    checked(service.reminders.mutate({ protocolVersion: 1, assistantId, commandId: randomUUID(), mutation: {
      action: 'create', itemId: item.id, expectedItemVersion: item.version, dueAt: new Date(now + 60000).toISOString(), timeZone: 'UTC'
    } }))
  }
  const planned = query().records[0]
  ensure(planned?.state === 'SCHEDULED', 'PLAN_NOT_SAVED')
  const beforeReopen = calls
  service.close()
  service = open()
  ensure(calls === beforeReopen && query().records[0]?.id === planned.id, 'REOPEN_CHANGED_PLAN')
  ensure(!checked(service.list({ protocolVersion: 1 })).connections[0].hasCredential, 'TEMPORARY_CREDENTIAL_SURVIVED')
  phase = 'offline-synthetic-dispatch'
  let shown = 0
  service.reminders.attach({
    notificationSupported: () => true, loginStartupSupported: () => false,
    getLoginStartup: () => false, setLoginStartup: () => { throw new Error('NO_LOGIN_REGISTRATION') },
    show: (_input, event) => { shown++; event('show'); return { close() {} } }
  }, () => {})
  const runtime = checked(service.reminders.runtime({ protocolVersion: 1 }))
  // Explicit synthetic policy, not a product default or user REM-002 decision.
  checked(service.reminders.configure({ protocolVersion: 1, expectedVersion: runtime.version, policy: { mode: 'EXPLICIT', catchUpMinutes: 1, merge: false }, loginStartup: false }))
  now = Date.parse(planned.dueAt) + 500
  service.reminders.tick(true)
  service.reminders.tick(true)
  ensure(shown === 1 && query().records[0].state === 'DISPLAY_OBSERVED' && calls === beforeReopen, 'OFFLINE_DISPATCH_FAILED')
  service.close()
  service = open()
  service.reminders.recover()
  ensure(query().records[0].state === 'DISPLAY_OBSERVED' && calls === beforeReopen, 'RESTORE_REDISPATCHED')
  process.stdout.write(JSON.stringify({ outcome: preflight ? 'LOCAL_PREFLIGHT_PASS' : 'SUPPORTED', bundleSha256,
    requestsAttempted: calls, wire, rounds, naturalChineseTimeChecked: !preflight, previewDidNotSchedule: !preflight,
    confirmationIdempotent: !preflight, sameReminderAfterReopen: true, reopenCalls: 0, keyAbsentAfterReopen: true,
    syntheticNotifications: shown, repeatedTickNoDuplicate: true,
    disclosure: { rendererDriven: false, processRestart: false, nativeNotification: false, injectedClock: true,
      explicitFixturePolicyNotProductDefault: true, credentialPersisted: false, bodyLogged: false } }) + '\n')
} catch (error) {
  retain = true
  process.stdout.write(JSON.stringify({ outcome: 'INCONCLUSIVE', phase, bundleSha256, requestsAttempted: calls, wire, rounds,
    retainedSyntheticRoot: canonical, reason: error instanceof Error && /^[A-Z][A-Z_]{1,70}$/.test(error.message) ? error.message : 'LOCAL_OR_PRODUCT_FAILURE' }) + '\n')
  process.exitCode = 1
} finally {
  service?.close()
  assistants?.close()
  globalThis.fetch = originalFetch
  if (!retain && realpathSync(root) === canonical) rmSync(root, { recursive: true })
}
