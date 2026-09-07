import process from 'node:process'
import { mkdtempSync, writeFileSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import { randomUUID, createHash } from 'node:crypto'
import { build } from 'esbuild'

// Explicit synthetic service qualification; this file is not an application dependency.
const preflight = process.argv[2] === '--preflight'
if (!preflight && process.argv[2] !== '--run') throw new Error('EXPLICIT_MODE_REQUIRED')
const key = preflight ? 'synthetic-no-network' : process.env.MASHIRO_PROVIDER_TEST_KEY
delete process.env.MASHIRO_PROVIDER_TEST_KEY
if (!key || /\s/.test(key)) throw new Error('PROCESS_CREDENTIAL_UNAVAILABLE')
const root = mkdtempSync(join(tmpdir(), 'mashiro-steward-live-'))
const canonical = realpathSync(root)
const child = relative(realpathSync(tmpdir()), canonical)
if (!child.startsWith('mashiro-steward-live-') || /[/\\]/.test(child)) throw new Error('INVALID_SYNTHETIC_ROOT')
const ensure = (ok, code) => { if (!ok) throw new Error(code) }
const checked = result => { ensure(result.ok, 'PRODUCT_' + (result.error?.code ?? 'ERROR')); return result.data }
const pause = ms => new Promise(resolve => globalThis.setTimeout(resolve, ms))
const originalFetch = globalThis.fetch
const wire = []
const marker = 'SYNTHETIC_' + randomUUID()
let service, assistants, bundleSha256, accepted, savedIdentity, acceptedUsage, discoveryUsage
let calls = 0, phase = 'setup', retain = false, restoredCalls, pendingExcludedFromRecall
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
  const assistantId = checked(assistants.create({ protocolVersion: 1, displayName: '合成仓储验收', expectedStateRevision: 0 })).assistants[0].id
  const base = { protocolVersion: 1, assistantId }
  const protector = { isEncryptionAvailable: () => false, encryptString: () => { throw new Error('NO_PERSISTENCE') }, decryptString: () => { throw new Error('NO_PERSISTENCE') } }
  service = ProviderService.open(databasePath, join(root, 'credentials'), protector)
  const connectionId = checked(service.saveConnection({ protocolVersion: 1, displayName: '合成仓储端点', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', enabled: true })).connections[0].id
  checked(service.setCredential({ protocolVersion: 1, connectionId, apiKey: key, persistence: 'temporary' }))
  checked(service.bindAssistant({ ...base, connectionId, model: 'GLM-5.3-FLASH', expectedVersion: null }))
  const history = checked(service.permissions(base))
  checked(service.setPermissions({ ...base, connectionId: history.connectionId, endpointFingerprint: history.endpointFingerprint, expectedVersion: history.version, readHistory: true, sendHistory: true }))
  for (const scope of ['assistant', 'global']) {
    const p = checked(service.memory.permissions({ ...base, scope }))
    checked(service.memory.setPermissions({ ...base, scope, expectedVersion: p.version, read: true, write: true, writeInferences: false, receive: true }))
  }
  globalThis.fetch = async (url, options) => {
    ensure(String(url) === 'https://open.bigmodel.cn/api/paas/v4/chat/completions', 'ENDPOINT_MISMATCH')
    ensure(calls < 3 && ['seed', 'discovery', 'steward'].includes(phase), 'REQUEST_CEILING')
    const body = JSON.parse(options.body)
    ensure(body.model === 'GLM-5.3-FLASH' && !body.tools?.length && body.stream === false, 'ADAPTER_MISMATCH')
    if (phase !== 'seed') ensure(Number.isInteger(body.max_tokens) && body.max_tokens <= 2048, 'OUTPUT_UNBOUNDED')
    const serialized = JSON.stringify(body.messages)
    ensure(serialized.includes(marker), 'SOURCE_MARKER_MISSING')
    const observation = { request: ++calls, phase, maxTokens: body.max_tokens ?? null, httpStatus: null, usage: null }
    wire.push(observation)
    const text = phase === 'discovery'
      ? JSON.stringify({ sharedCandidates: [{ title: '合成长期偏好', markdown: '用户长期最喜欢的虚构颜色名为 ' + marker, nature: 'faithful-summary', sourceHandles: ['source0'] }] })
      : phase === 'steward'
        ? JSON.stringify({ slots: [{ action: 'remember', title: '合成长期偏好', markdown: '用户长期最喜欢的虚构颜色名为 ' + marker, nature: 'faithful-summary', branchTitle: '长期偏好', targetHandle: null, sourceHandles: ['entry'] }] })
        : marker
    const response = preflight
      ? new globalThis.Response(JSON.stringify({ id: 'synthetic', choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: text } }], usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } }), { status: 200, headers: { 'content-type': 'application/json' } })
      : await originalFetch(url, options)
    observation.httpStatus = response.status
    try { observation.usage = (await response.clone().json()).usage ?? null } catch { /* unknown usage remains explicit */ }
    return response
  }
  const snapshot = () => checked(service.steward.query(base))
  ensure(!snapshot().configuration.enabled && !snapshot().discovery.enabled, 'DEFAULT_NOT_DISABLED')
  phase = 'seed'
  const chat = checked(await service.startChat({ ...base, requestId: randomUUID(), text: '这段仅用于合成测试的长期个人偏好：我多年来最喜欢的虚构颜色名为 ' + marker + '。它是稳定偏好，没有事项和提醒。请简短复述颜色名。', mode: 'normal', context: { kind: 'none' }, tools: 'off', stream: false }, () => undefined))
  ensure(chat.status === 'completed' && chat.text.includes(marker), 'CHAT_INCOMPLETE')
  ensure(calls === 1 && snapshot().jobs.length === 0, 'DEFAULT_BACKGROUND_CALLED')
  const common = { enabled: true, connectionId, model: 'GLM-5.3-FLASH', budget: { window: 'utc-day', calls: 1, inputCharacters: 30000 } }
  const discoverySettings = { ...common, allowOwnCompletedRounds: true }
  const stewardSettings = { ...common, assistantIds: [assistantId], allowAcceptedMemories: false, allowSharedCandidates: true, allowWrite: true, allowInferences: false }
  const waitRole = async role => {
    const deadline = Date.now() + 65000
    do {
      const s = snapshot()
      const job = s.jobs.find(j => j.role === role)
      if (job && !['QUEUED', 'RUNNING'].includes(job.state)) {
        ensure(job.state === 'COMPLETED', 'ROLE_' + job.state)
        return s
      }
      await pause(100)
    } while (Date.now() < deadline)
    throw new Error('ROLE_TIMEOUT')
  }
  phase = 'discovery'
  checked(service.steward.configure({ ...base, role: 'assistant', expectedVersion: snapshot().discovery.version, grantSelectedRecipient: true, settings: discoverySettings }))
  let s = await waitRole('assistant')
  ensure(calls === 2 && s.pending.length === 1 && s.pending[0].entryKind === 'shared-candidate', 'SHARED_CANDIDATE_MISSING')
  pendingExcludedFromRecall = checked(service.memory.query({ ...base, scope: 'global', query: marker })).records.length === 0
  ensure(pendingExcludedFromRecall, 'PENDING_RECALLED')
  discoveryUsage = s.discoveryUsage
  phase = 'steward'
  checked(service.steward.configure({ ...base, role: 'steward', expectedVersion: s.configuration.version, grantSelectedRecipient: true, settings: stewardSettings }))
  s = await waitRole('steward')
  ensure(calls === 3 && s.usage.calls === 1 && s.discoveryUsage.calls === 1, 'BUDGET_NOT_RECORDED')
  const job = s.jobs.find(j => j.role === 'steward')
  ensure(job.slots.length >= 1 && job.slots.every(slot => slot.state === 'COMPLETED'), 'SLOT_RECEIPT_MISSING')
  const branch = s.branches[0]
  ensure(branch, 'BRANCH_MISSING')
  accepted = checked(service.steward.branch({ ...base, id: branch.id, expectedVersion: branch.version }))
  ensure(accepted.markdown.includes(marker) && accepted.members.some(m => m.scope === 'global' && m.nature === 'faithful-summary' && m.markdown.includes(marker)), 'MARKDOWN_NOT_ACCEPTED')
  const recalled = checked(service.memory.query({ ...base, scope: 'global', query: marker })).records
  ensure(recalled.some(m => job.slots.some(slot => slot.memoryId === m.id && slot.memoryVersion === m.objectVersion)), 'ACCEPTED_RECALL_MISSING')
  const member = accepted.members.find(m => m.markdown.includes(marker))
  const inspection = checked(service.memory.inspect({ ...base, id: member.id }))
  ensure(inspection.changes.some(change => change.actor === 'steward'), 'STEWARDSHIP_PROVENANCE_MISSING')
  savedIdentity = { branchId: branch.id, branchVersion: branch.version, memoryId: member.id, memoryVersion: member.objectVersion }
  acceptedUsage = s.usage
  checked(service.steward.configure({ ...base, role: 'assistant', expectedVersion: s.discovery.version, grantSelectedRecipient: false, settings: { ...discoverySettings, enabled: false } }))
  checked(service.steward.configure({ ...base, role: 'steward', expectedVersion: snapshot().configuration.version, grantSelectedRecipient: false, settings: { ...stewardSettings, enabled: false } }))
  service.close()
  service = undefined
  phase = 'reopen'
  const before = calls
  service = ProviderService.open(databasePath, join(root, 'credentials'), protector)
  const restored = checked(service.steward.branch({ ...base, id: branch.id, expectedVersion: branch.version }))
  ensure(restored.markdown === accepted.markdown && restored.members.some(m => m.id === member.id && m.objectVersion === member.objectVersion), 'REOPEN_IDENTITY_LOST')
  await pause(1200)
  restoredCalls = calls - before
  ensure(restoredCalls === 0 && snapshot().usage.calls === 1 && snapshot().discoveryUsage.calls === 1, 'REOPEN_BUDGET_OR_CALL_ERROR')
  process.stdout.write(JSON.stringify({ outcome: preflight ? 'LOCAL_PREFLIGHT_PASS' : 'SUPPORTED', bundleSha256, requestsAttempted: preflight ? 0 : calls, syntheticTransportCalls: preflight ? calls : 0, wire, savedIdentity, acceptedUsage, discoveryUsage, pendingExcludedFromRecall, restoredCalls,
    disclosure: { rendererDriven: false, processRestart: false, packaged: false, ordinaryRoundSource: true, manualMemoryWrites: 0, acceptedMarkdown: true, acceptedRecall: true, stewardProvenance: true, bodyLogged: false, credentialPersisted: false } }) + '\n')
} catch (error) {
  retain = true
  process.stdout.write(JSON.stringify({ outcome: 'INCONCLUSIVE', phase, bundleSha256, requestsAttempted: preflight ? 0 : calls, syntheticTransportCalls: preflight ? calls : 0, wire, acceptedUsage, discoveryUsage, retainedSyntheticRoot: canonical, reason: error instanceof Error && /^[A-Z][A-Z_]{1,70}$/.test(error.message) ? error.message : 'LOCAL_OR_PRODUCT_FAILURE' }) + '\n')
  process.exitCode = 1
} finally {
  service?.close()
  assistants?.close()
  globalThis.fetch = originalFetch
  if (!retain && realpathSync(root) === canonical) rmSync(root, { recursive: true })
}
