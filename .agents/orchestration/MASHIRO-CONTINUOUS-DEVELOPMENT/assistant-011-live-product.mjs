import process from 'node:process'
import { mkdtempSync, writeFileSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import { randomUUID, createHash } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { build } from 'esbuild'

// Explicit synthetic runner; never imported by the application.
const preflight = process.argv[2] === '--preflight'
if (!preflight && process.argv[2] !== '--run') throw new Error('EXPLICIT_MODE_REQUIRED')
const key = preflight ? 'synthetic-no-network' : process.env.MASHIRO_PROVIDER_TEST_KEY
delete process.env.MASHIRO_PROVIDER_TEST_KEY
if (!key || /\s/.test(key)) throw new Error('PROCESS_CREDENTIAL_UNAVAILABLE')
const root = mkdtempSync(join(tmpdir(), 'mashiro-assistant-profile-live-'))
const canonical = realpathSync(root)
const child = relative(realpathSync(tmpdir()), canonical)
if (!child || child.startsWith('..') || /[/\\]/.test(child)) throw new Error('INVALID_SYNTHETIC_ROOT')
const ensure = (ok, code) => { if (!ok) throw new Error(code) }
const checked = result => { ensure(result.ok, 'PRODUCT_' + (result.error?.code ?? 'ERROR')); return result.data }
const originalFetch = globalThis.fetch
const wire = []
const rounds = []
let service
let assistants
let database
let calls = 0
let phase = 'setup'
let retain = false
let bundleSha256 = null
const personaMarker = 'PROFILE_' + randomUUID()
const privateMarker = 'NORMAL_ONLY_' + randomUUID()
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
  let snapshot = checked(assistants.create({ protocolVersion: 1, displayName: '合成人设验证', expectedStateRevision: 0 }))
  const first = snapshot.assistants[0]
  const persona = '请使用中文简洁回答。用户询问人设口令时回答：' + personaMarker + '。这不授予任何业务或资料权限。'
  snapshot = checked(assistants.rename({ protocolVersion: 1, assistantId: first.id, displayName: first.displayName,
    persona, avatarKey: 'moon', expectedAssistantVersion: first.version, expectedStateRevision: snapshot.stateRevision }))
  ensure(snapshot.assistants[0].persona === persona && snapshot.assistants[0].avatarKey === 'moon', 'PROFILE_NOT_SAVED')
  const protector = { isEncryptionAvailable: () => false, encryptString: () => { throw new Error('NO_PERSISTENCE') }, decryptString: () => { throw new Error('NO_PERSISTENCE') } }
  service = ProviderService.open(databasePath, join(root, 'credentials'), protector)
  const connectionId = checked(service.saveConnection({ protocolVersion: 1, displayName: '合成人设端点',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4', enabled: true })).connections[0].id
  checked(service.setCredential({ protocolVersion: 1, connectionId, apiKey: key, persistence: 'temporary' }))
  checked(service.bindAssistant({ protocolVersion: 1, assistantId: first.id, connectionId, model: 'GLM-5.3-FLASH', expectedVersion: null }))
  database = new DatabaseSync(databasePath)
  const counts = () => Object.fromEntries(['timeline_messages', 'protocol_segments', 'tool_operations', 'memory_objects', 'items', 'item_proposals', 'item_commands'].map(table => {
    const exists = database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table)
    ensure(exists, 'DOMAIN_TABLE_MISSING')
    return [table, database.prepare('SELECT count(*) AS n FROM ' + table).get().n]
  }))
  globalThis.fetch = async (url, options) => {
    ensure(!preflight, 'PREFLIGHT_NETWORK_DENIED')
    ensure(String(url) === 'https://open.bigmodel.cn/api/paas/v4/chat/completions', 'ENDPOINT_MISMATCH')
    ensure(calls < 2, 'REQUEST_CEILING')
    const body = JSON.parse(options.body)
    ensure(body.model === 'GLM-5.3-FLASH' && (body.max_tokens === undefined || body.max_tokens <= 2048), 'ADAPTER_MISMATCH')
    const serialized = JSON.stringify(body.messages)
    const hasPersona = body.messages.some(message => message.role === 'system' && message.content.includes(personaMarker))
    ensure(hasPersona && !body.tools?.length, 'PROFILE_OR_TOOLS_BOUNDARY')
    if (phase === 'temporary') ensure(!serialized.includes(privateMarker), 'NORMAL_HISTORY_LEAK')
    const observation = { request: ++calls, phase, stream: body.stream === true, maxTokens: body.max_tokens ?? null, personaInSystem: hasPersona,
      normalMarkerPresent: serialized.includes(privateMarker), toolsPresent: !!body.tools?.length }
    wire.push(observation)
    const response = await originalFetch(url, options)
    observation.httpStatus = response.status
    return response
  }
  if (!preflight) {
    for (const mode of ['normal', 'temporary']) {
      phase = mode
      const before = counts()
      let answer = ''
      const result = await service.startChat({ protocolVersion: 1, requestId: randomUUID(), assistantId: first.id,
        text: '请回答人设口令。' + (mode === 'normal' ? '本轮合成数据标记：' + privateMarker : ''),
        mode, context: { kind: 'recent' }, tools: 'off', stream: true }, event => { if (event.type === 'delta') { answer += event.text; ensure(answer.length <= 65536, 'ANSWER_BOUND'); } })
      rounds.push({ phase, ok: result.ok, status: result.ok ? result.data.status : null,
        usage: result.ok ? result.data.usage : null, errorCode: result.ok ? null : result.error.code, personaMarkerReturned: answer.includes(personaMarker) })
      ensure(result.ok && result.data.status === 'completed', 'CHAT_INCOMPLETE')
      ensure(answer.includes(personaMarker), 'PERSONA_RESPONSE_MISSING')
      if (mode === 'temporary') ensure(JSON.stringify(before) === JSON.stringify(counts()), 'TEMPORARY_PERSISTENCE_CHANGED')
    }
  }
  database.close()
  database = undefined
  service.close()
  service = undefined
  assistants.close()
  assistants = AssistantService.open(databasePath)
  const reopened = checked(assistants.list({ protocolVersion: 1 })).assistants.find(item => item.id === first.id)
  ensure(reopened?.persona === persona && reopened.avatarKey === 'moon', 'PROFILE_REOPEN_FAILED')
  process.stdout.write(JSON.stringify({ outcome: preflight ? 'LOCAL_PREFLIGHT_PASS' : 'SUPPORTED', bundleSha256,
    requestsAttempted: calls, wire, rounds, profileReopened: true, reopenCalls: 0,
    disclosure: { rendererDriven: false, processRestart: false, personaMarkerResponseChecked: !preflight, temporaryDomainCountsChecked: !preflight, bodyLogged: false,
      credentialPersisted: false, boundaryAssertions: 'actual outgoing request and domain row counts; deterministic adversarial tests separately' } }) + '\n')
} catch (error) {
  retain = true
  process.stdout.write(JSON.stringify({ outcome: 'INCONCLUSIVE', phase, bundleSha256, requestsAttempted: calls, wire, rounds,
    retainedSyntheticRoot: canonical, reason: error instanceof Error && /^[A-Z][A-Z_]{1,70}$/.test(error.message) ? error.message : 'LOCAL_OR_PRODUCT_FAILURE' }) + '\n')
  process.exitCode = 1
} finally {
  database?.close()
  service?.close()
  assistants?.close()
  globalThis.fetch = originalFetch
  if (!retain && realpathSync(root) === canonical) rmSync(root, { recursive: true })
}
