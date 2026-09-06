import process from 'node:process'
import console from 'node:console'
import { mkdtempSync, writeFileSync, rmSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import { randomUUID, createHash } from 'node:crypto'
import { build } from 'esbuild'
import { observeSyntheticToolStream } from './items-010-sse-observer.mjs'

// Explicit synthetic qualification only; never called by the product.
const preflight = process.argv[2] === '--preflight'
const diagnoseProposal = process.argv[2] === '--diagnose-proposal'
const updateOnly = process.argv[2] === '--update'
if (!preflight && !diagnoseProposal && !updateOnly && process.argv[2] !== '--run') throw new Error('Explicit mode required')
const key = preflight ? 'synthetic-no-network' : process.env.MASHIRO_PROVIDER_TEST_KEY
delete process.env.MASHIRO_PROVIDER_TEST_KEY
if (!key || /\s/.test(key)) throw new Error('Process credential unavailable')
const project = resolve('D:/Mashiro')
const root = mkdtempSync(join(tmpdir(), 'mashiro-items-product-live-'))
const canonical = realpathSync(root)
const segment = relative(realpathSync(tmpdir()), canonical)
if (!segment || segment.startsWith('..') || segment.includes('/') || segment.includes('\\'))
  throw new Error('Invalid temporary root')
const originalFetch = globalThis.fetch
const marker = randomUUID()
const title = '合成事项' + marker
const revisedTitle = '合成建议修订' + randomUUID()
const wire = []
const rounds = []
const observations = []
let service
let validators = {}
let bundleSha256 = null
let calls = 0
let phase = 'preflight'
let stage = 'setup'
let retainFailure = false
let recallChecked = false
let recoveryRequests = null
const checked = (result) => {
  if (!result.ok) throw new Error('PRODUCT_' + result.error.code)
  return result.data
}
const ensure = (condition, code) => { if (!condition) throw new Error(code) }
try {
  const bundle = await build({
    stdin: {
      contents: "export {ProviderService} from './src/main/provider/provider-service.ts';export {AssistantService} from './src/main/assistant/assistant-service.ts';export {itemIntentToolSchema,itemProposeToolSchema,itemReviseToolSchema,itemPrepareUpdateToolSchema} from './src/main/item/item-tool-schema.ts';",
      resolveDir: project, loader: 'ts'
    },
    bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent'
  })
  bundleSha256 = createHash('sha256').update(bundle.outputFiles[0].text).digest('hex')
  const path = join(root, 'product.mjs')
  writeFileSync(path, bundle.outputFiles[0].text, { flag: 'wx' })
  const { ProviderService, AssistantService, itemIntentToolSchema, itemProposeToolSchema, itemReviseToolSchema, itemPrepareUpdateToolSchema } = await import(pathToFileURL(path).href)
  validators = { apply_item_intent: itemIntentToolSchema, propose_item: itemProposeToolSchema, revise_item_proposal: itemReviseToolSchema, prepare_item_update: itemPrepareUpdateToolSchema }
  const database = join(root, 'synthetic.sqlite')
  const assistants = AssistantService.open(database)
  const snapshot = checked(assistants.create({ protocolVersion: 1, displayName: '合成事项资格', expectedStateRevision: 0 }))
  const assistantId = snapshot.assistants[0].id
  assistants.close()
  globalThis.fetch = async (url, options) => {
    ensure(!preflight, 'PREFLIGHT_NETWORK_DENIED')
    ensure(String(url) === 'https://open.bigmodel.cn/api/paas/v4/chat/completions', 'ENDPOINT_MISMATCH')
    ensure(calls < (updateOnly ? 4 : 16), 'REQUEST_CEILING')
    const body = JSON.parse(options.body)
    ensure(body.model === 'GLM-5.3-FLASH' && body.max_tokens <= 2048, 'ADAPTER_MISMATCH')
    if (phase === 'recall' && !recallChecked) {
      ensure(!JSON.stringify(body.messages).includes(marker), 'RECALL_CONTEXT_LEAK')
      recallChecked = true
    }
    const toolResults = body.messages.filter(message => message.role === 'tool')
    for (const result of toolResults)
      ensure(body.messages.some(message => message.role === 'assistant' && message.tool_calls?.some(call => call.id === result.tool_call_id)), 'UNMATCHED_TOOL_RESULT')
    const observation = {
      request: ++calls, phase, toolResultPresent: toolResults.length > 0,
      recallMarkerInToolResult: phase === 'recall' && toolResults.some(result => result.content.includes(marker)),
      stream: body.stream === true
    }
    wire.push(observation)
    const response = await originalFetch(url, options)
    observation.httpStatus = response.status
    if (response.ok) {
      // Bounded observer emits counts and allowlisted field paths, never arguments.
      observations.push(observeSyntheticToolStream(response.clone(), validators, '').then(
        value => { observation.streamEvidence = value },
        () => { observation.streamEvidence = { incomplete: true } }
      ))
    }
    return response
  }
  const protector = {
    isEncryptionAvailable: () => false,
    encryptString: () => { throw new Error('No credential persistence') },
    decryptString: () => { throw new Error('No credential persistence') }
  }
  const credentials = join(root, 'credentials')
  service = ProviderService.open(database, credentials, protector)
  ensure(!!service.items, 'ITEM_SERVICE_UNAVAILABLE')
  const connectionId = checked(service.saveConnection({
    protocolVersion: 1, displayName: '合成固定端点',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4', enabled: true
  })).connections[0].id
  const supplyKey = () => checked(service.setCredential({
    protocolVersion: 1, connectionId, apiKey: key, persistence: 'temporary'
  }))
  supplyKey()
  checked(service.bindAssistant({ protocolVersion: 1, assistantId, connectionId, model: 'GLM-5.3-FLASH', expectedVersion: null }))
  const history = checked(service.permissions({ protocolVersion: 1, assistantId }))
  checked(service.setPermissions({
    protocolVersion: 1, assistantId, connectionId: history.connectionId,
    endpointFingerprint: history.endpointFingerprint, expectedVersion: history.version,
    readHistory: true, sendHistory: true
  }))
  const permission = checked(service.items.permissions({ protocolVersion: 1, assistantId }))
  checked(service.items.setPermissions({
    protocolVersion: 1, assistantId, expectedVersion: permission.version,
    read: true, write: true, propose: true, receive: true
  }))
  const query = (view = 'items') => checked(service.items.query({ protocolVersion: 1, assistantId, view, limit: 100 }))
  if (preflight) {
    ensure(query().formalCount === 0 && query('proposals').proposals.length === 0 && calls === 0, 'PREFLIGHT_STATE')
    console.log(JSON.stringify({ outcome: 'LOCAL_PREFLIGHT_PASS', requestsAttempted: 0, schemaAndGrantsInitialized: true }))
  } else if (updateOnly) {
    stage = 'update-local-seed'
    const content = { kind: 'task', title, description: '合成初始说明', status: 'open',
      dueAt: null, timeZone: null, parentId: null, relatedIds: [], counterpart: '' }
    checked(service.items.mutate({ protocolVersion: 1, assistantId, commandId: randomUUID(),
      mutation: { action: 'create', content } }))
    const before = query().items[0]
    ensure(query().formalCount === 1 && !!before, 'UPDATE_SEED_NOT_UNIQUE')
    const dueAt = '2026-09-12T15:00:00+08:00'
    const description = '合成更新说明' + randomUUID()
    phase = 'prepare-update'
    stage = phase
    const result = await service.startChat({ protocolVersion: 1, requestId: randomUUID(), assistantId,
      text: '请把当前选中事项的截止时间改为' + dueAt + '，时区Asia/Shanghai，说明改为“' + description +
        '”。其他字段不变。请准备原事项修改供本机确认，不要创建新事项或提案。',
      mode: 'normal', context: { kind: 'none' }, tools: 'items', stream: true,
      itemContext: { type: 'item', id: before.id, expectedVersion: before.version } }, () => {})
    await Promise.allSettled(observations)
    rounds.push({ phase, ok: result.ok, status: result.ok ? result.data.status : null,
      errorCode: result.ok ? null : result.error.code, usage: result.ok ? result.data.usage : null })
    ensure(result.ok && result.data.status === 'completed', 'UPDATE_CHAT_INCOMPLETE')
    const operations = checked(service.tools({ protocolVersion: 1, assistantId, mode: 'normal' })).operations
    const prepared = operations.filter(op => op.toolName === 'prepare_item_update' &&
      op.state === 'SUCCEEDED' && op.itemReceipt?.state === 'PENDING_CONFIRMATION')
    ensure(prepared.length === 1, 'UPDATE_PREVIEW_NOT_UNIQUE')
    const commandId = prepared[0].itemReceipt.operationId
    const pending = query().items[0]
    ensure(pending.id === before.id && pending.version === before.version &&
      JSON.stringify(pending.content) === JSON.stringify(before.content) &&
      query().formalCount === 1 && query('proposals').proposals.length === 0, 'UPDATE_PREMATURE_WRITE')
    const preview = checked(service.items.preview({ protocolVersion: 1, assistantId, commandId, action: 'recover' }))
    const replacement = preview.replacementContent
    ensure(preview.targets.length === 1 && preview.targets[0].id === before.id &&
      preview.targets[0].version === before.version && !!replacement, 'UPDATE_WRONG_TARGET')
    ensure(Date.parse(replacement.dueAt) === Date.parse(dueAt) &&
      replacement.timeZone === 'Asia/Shanghai' && replacement.description === description, 'UPDATE_CANDIDATE_MISMATCH')
    for (const field of ['kind', 'title', 'status', 'parentId', 'relatedIds', 'counterpart'])
      ensure(JSON.stringify(replacement[field]) === JSON.stringify(before.content[field]), 'UPDATE_UNREQUESTED_FIELD')
    stage = 'update-local-confirm'
    const confirmation = { protocolVersion: 1, assistantId, confirmationId: preview.confirmationId, accept: true }
    const accepted = checked(service.items.confirm(confirmation))
    const repeated = checked(service.items.confirm(confirmation))
    const after = query().items[0]
    ensure(accepted.state === 'SUCCEEDED' && repeated.operationId === accepted.operationId &&
      after.id === before.id && after.version === before.version + 1 &&
      Date.parse(after.content.dueAt) === Date.parse(dueAt) && after.content.description === description &&
      query().formalCount === 1 && query('proposals').proposals.length === 0, 'UPDATE_CONFIRM_IDENTITY')
    stage = 'update-reopen'
    const beforeReopen = calls
    service.close()
    service = ProviderService.open(database, credentials, protector)
    recoveryRequests = calls - beforeReopen
    const restored = query().items[0]
    ensure(recoveryRequests === 0 && restored.id === before.id &&
      restored.version === after.version && JSON.stringify(restored.content) === JSON.stringify(after.content), 'UPDATE_RECOVERY_MISMATCH')
    console.log(JSON.stringify({ outcome: 'SUPPORTED', role: 'prepare-original-item-update',
      bundleSha256, endpoint: 'https://open.bigmodel.cn/api/paas/v4', model: 'GLM-5.3-FLASH',
      requestsAttempted: calls, wire, rounds, recoveryRequests, originalItemPreserved: true,
      pendingZeroWrite: true, repeatedConfirmationSingleVersion: true, formalObjects: 1, proposals: 0,
      disclosure: { credentialPersisted: false, bodyLogged: false, rendererDriven: false,
        processRestart: false, serviceReopened: true, seedAndConfirmationViaLocalApi: true } }))
  } else if (diagnoseProposal) {
    phase = 'propose-diagnostic'
    stage = phase
    const result = await service.startChat({ protocolVersion: 1, requestId: randomUUID(), assistantId,
      text: '我在考虑学习合成主题' + randomUUID() + '，还没有决定要做。请仅提出一个待确认的任务建议，不要创建正式事项。',
      mode: 'normal', context: { kind: 'none' }, tools: 'items', stream: true }, () => {})
    await Promise.allSettled(observations)
    const formalCount = query().formalCount
    const proposalCount = query('proposals').proposals.length
    const supported = result.ok && result.data.status === 'completed' && formalCount === 0 && proposalCount === 1
    retainFailure = !supported
    console.log(JSON.stringify({ outcome: supported ? 'SUPPORTED' : 'INCONCLUSIVE', diagnosticOnly: true,
      bundleSha256, requestsAttempted: calls, wire, formalCount, proposalCount,
      product: { ok: result.ok, status: result.ok ? result.data.status : null, errorCode: result.ok ? null : result.error.code },
      ...(retainFailure ? { retainedSyntheticRoot: canonical } : {}) }))
    if (!supported) process.exitCode = 1
  } else {
    const chat = async (nextPhase, text, itemContext) => {
      phase = nextPhase
      stage = nextPhase
      const result = await service.startChat({
        protocolVersion: 1, requestId: randomUUID(), assistantId, text,
        mode: 'normal', context: { kind: 'none' }, tools: 'items', stream: true,
        ...(itemContext ? { itemContext } : {})
      }, () => {})
      rounds.push({ phase, ok: result.ok, status: result.ok ? result.data.status : null,
        errorCode: result.ok ? null : result.error.code, usage: result.ok ? result.data.usage : null })
      await Promise.allSettled(observations)
      ensure(result.ok && result.data.status === 'completed', 'CHAT_INCOMPLETE')
      return result.data
    }
    await chat('create', '新建任务：' + title)
    const initial = query()
    ensure(initial.formalCount === 1 && initial.items.length === 1 && initial.items[0].content.title === title, 'CREATE_NOT_UNIQUE')
    const originalItem = initial.items[0]
    const callsBeforeRestart = calls
    service.close()
    service = ProviderService.open(database, credentials, protector)
    recoveryRequests = calls - callsBeforeRestart
    ensure(recoveryRequests === 0, 'RECOVERY_EXTERNAL_CALL')
    supplyKey()
    const recall = await chat('recall', '请查找标题包含“合成事项”的正式事项，回答其完整标题。不要创建或修改事项。')
    ensure(recall.text.includes(marker) && wire.some(row => row.recallMarkerInToolResult), 'RECALL_NOT_FROM_TOOL')
    ensure(query().items[0].version === originalItem.version, 'RECALL_MUTATED_ITEM')
    await chat('propose', '我在考虑学习合成主题' + randomUUID() + '，还没有决定要做。请仅提出一个待确认的任务建议，不要创建正式事项。')
    const proposed = query('proposals')
    ensure(proposed.proposals.length === 1 && query().formalCount === 1, 'PROPOSAL_BECAME_FORMAL')
    const proposal = proposed.proposals[0]
    checked(service.items.proposalAction({
      protocolVersion: 1, assistantId, commandId: randomUUID(),
      id: proposal.id, expectedVersion: proposal.version, action: 'discuss'
    }))
    const discussing = checked(service.items.inspect({ protocolVersion: 1, assistantId, id: proposal.id, type: 'proposal' })).proposal
    await chat('discuss', '请把这个提案的标题改为“' + revisedTitle + '”，仍仅作为待确认建议，不要接受。',
      { type: 'proposal', id: proposal.id, expectedVersion: discussing.version })
    const revised = query('proposals').proposals
    ensure(revised.length === 1 && revised[0].id === proposal.id && revised[0].version > discussing.version &&
      revised[0].candidate.title === revisedTitle && query().formalCount === 1, 'PROPOSAL_REVISION_IDENTITY')
    stage = 'local-accept'
    const acceptance = { protocolVersion: 1, assistantId, commandId: randomUUID(), id: proposal.id,
      expectedVersion: revised[0].version, action: 'accept' }
    const receipt = checked(service.items.proposalAction(acceptance))
    const repeated = checked(service.items.proposalAction(acceptance))
    const acceptedItems = query().items.filter(item => item.originProposalId === proposal.id)
    const acceptedProposal = checked(service.items.inspect({ protocolVersion: 1, assistantId, id: proposal.id, type: 'proposal' })).proposal
    ensure(receipt.state === 'SUCCEEDED' && receipt.objectType === 'proposal' && receipt.objectId === proposal.id &&
      repeated.objectId === receipt.objectId && repeated.operationId === receipt.operationId &&
      acceptedProposal.state === 'ACCEPTED' && acceptedItems.length === 1 &&
      acceptedItems[0].id === acceptedProposal.acceptedItemId && query().formalCount === 2, 'ACCEPT_NOT_ATOMIC')
    await chat('complete', '把' + title + '标为完成')
    const completed = checked(service.items.inspect({ protocolVersion: 1, assistantId, id: originalItem.id, type: 'item' })).item
    ensure(completed.content.status === 'completed' && query().formalCount === 2, 'COMPLETE_NOT_APPLIED')
    const operations = checked(service.tools({ protocolVersion: 1, assistantId, mode: 'normal' })).operations
    ensure(operations.some(op => op.toolName === 'propose_item' && op.state === 'SUCCEEDED') &&
      operations.some(op => op.toolName === 'revise_item_proposal' && op.state === 'SUCCEEDED'), 'ROLE_OPERATIONS_MISSING')
    console.log(JSON.stringify({
      outcome: 'SUPPORTED', bundleSha256, endpoint: 'https://open.bigmodel.cn/api/paas/v4', model: 'GLM-5.3-FLASH',
      requestsAttempted: calls, wire, rounds, recoveryRequests,
      formalObjects: query().formalCount, proposalIdStable: true, acceptIdempotent: true,
      initialItemCompleted: true, operationStates: operations.map(op => ({ tool: op.toolName, state: op.state })),
      disclosure: { credentialPersisted: false, bodyLogged: false, rendererDriven: false,
        processRestart: false, serviceReopened: true, acceptanceViaLocalApi: true }
    }))
  }
} catch (error) {
  retainFailure = true
  console.log(JSON.stringify({
    outcome: 'INCONCLUSIVE', bundleSha256, stage, requestsAttempted: calls, wire, rounds, recoveryRequests,
    retainedSyntheticRoot: canonical,
    reason: error instanceof Error && /^[A-Z][A-Z_]{1,60}$/.test(error.message) ? error.message : 'LOCAL_FIXTURE_OR_PRODUCT_FAILURE'
  }))
  process.exitCode = 1
} finally {
  try { service?.close() } finally {
    globalThis.fetch = originalFetch
    if (!retainFailure && realpathSync(root) === canonical) rmSync(root, { recursive: true })
  }
}
