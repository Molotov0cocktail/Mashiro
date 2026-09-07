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

const root = mkdtempSync(join(tmpdir(), 'mashiro-daily-live-'))
const canonical = realpathSync(root)
const child = relative(realpathSync(tmpdir()), canonical)
if (!child.startsWith('mashiro-daily-live-') || /[/\\]/.test(child))
  throw new Error('INVALID_SYNTHETIC_ROOT')

const endpoint = 'https://open.bigmodel.cn/api/paas/v4'
const model = 'GLM-5.3-FLASH'
const allFeatures = [
  'observation',
  'daily-brief',
  'evening-review',
  'weekly-plan',
  'deadline-change'
]
const features = process.argv[3] ? process.argv[3].split(',') : allFeatures
if (
  !features.length ||
  new Set(features).size !== features.length ||
  features.some((f) => !allFeatures.includes(f))
)
  throw Error('INVALID_FEATURE_SET')
const ensure = (ok, code) => {
  if (!ok) throw new Error(code)
}
const checked = (result) => {
  ensure(result.ok, 'PRODUCT_' + (result.error?.code ?? 'ERROR'))
  return result.data
}
const pause = (ms) => new Promise((resolve) => globalThis.setTimeout(resolve, ms))
const originalFetch = globalThis.fetch
const marker = 'DAILY_SYNTHETIC_' + randomUUID()
const wire = []
const results = []
let service
let assistants
let bundleSha256 = null
let phase = 'setup'
let calls = 0
let fetchInvocations = 0
let acceptedObservation = null
let proposal = null
let reopenCalls = null

try {
  const built = await build({
    stdin: {
      contents:
        "export {ProviderService} from './src/main/provider/provider-service.ts';export {AssistantService} from './src/main/assistant/assistant-service.ts';export {dailyOutputSchema} from './src/main/background/daily-model.ts';",
      resolveDir: 'D:/Mashiro',
      loader: 'ts'
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
    logLevel: 'silent'
  })
  bundleSha256 = createHash('sha256').update(built.outputFiles[0].text).digest('hex')
  const bundlePath = join(root, 'product.mjs')
  writeFileSync(bundlePath, built.outputFiles[0].text, { flag: 'wx' })
  const { ProviderService, AssistantService, dailyOutputSchema } = await import(
    pathToFileURL(bundlePath).href
  )

  const databasePath = join(root, 'synthetic.sqlite')
  assistants = AssistantService.open(databasePath)
  const assistantId = checked(
    assistants.create({
      protocolVersion: 1,
      displayName: '合成日常验收',
      expectedStateRevision: 0
    })
  ).assistants[0].id
  const base = { protocolVersion: 1, assistantId }
  const protector = {
    isEncryptionAvailable: () => false,
    encryptString: () => {
      throw new Error('NO_PERSISTENCE')
    },
    decryptString: () => {
      throw new Error('NO_PERSISTENCE')
    }
  }
  service = ProviderService.open(databasePath, join(root, 'credentials'), protector)
  const connectionId = checked(
    service.saveConnection({
      protocolVersion: 1,
      displayName: '合成日常端点',
      baseUrl: endpoint,
      enabled: true
    })
  ).connections[0].id
  checked(
    service.setCredential({
      protocolVersion: 1,
      connectionId,
      apiKey: key,
      persistence: 'temporary'
    })
  )
  checked(service.bindAssistant({ ...base, connectionId, model, expectedVersion: null }))

  for (const scope of ['assistant', 'global']) {
    const current = checked(service.memory.permissions({ ...base, scope }))
    checked(
      service.memory.setPermissions({
        ...base,
        scope,
        expectedVersion: current.version,
        read: true,
        write: true,
        writeInferences: false,
        receive: true
      })
    )
  }
  const currentItems = checked(service.items.permissions(base))
  checked(
    service.items.setPermissions({
      ...base,
      expectedVersion: currentItems.version,
      read: true,
      write: true,
      propose: true,
      receive: true
    })
  )

  const now = new Date()
  for (const [index, hoursAgo] of [2, 1].entries())
    checked(
      service.memory.mutate({
        ...base,
        commandId: randomUUID(),
        mutation: {
          action: 'remember',
          targetId: null,
          expectedVersion: null,
          kind: 'event',
          scope: 'global',
          title: `合成事件${index + 1}`,
          markdown: `${marker} 的第${index + 1}条独立合成事件已发生，仅供日常功能验证。`,
          nature: 'user-statement',
          event: {
            status: 'reported-happened',
            occurredAt: new Date(now.getTime() - hoursAgo * 3600000).toISOString(),
            timeZone: 'UTC'
          }
        }
      })
    )
  const itemReceipt = checked(
    service.items.mutate({
      ...base,
      commandId: randomUUID(),
      mutation: {
        action: 'create',
        content: {
          kind: 'task',
          title: '合成截止事项',
          description: `${marker} 的正式合成事项，仅供期限与周规划验证。`,
          status: 'open',
          dueAt: new Date(now.getTime() + 6 * 3600000).toISOString(),
          timeZone: 'UTC',
          parentId: null,
          relatedIds: [],
          counterpart: ''
        }
      }
    })
  )
  ensure(itemReceipt.state === 'SUCCEEDED' && itemReceipt.objectId, 'FORMAL_ITEM_MISSING')

  globalThis.fetch = async (url, options) => {
    fetchInvocations++
    ensure(fetchInvocations <= features.length, 'REQUEST_CEILING')
    ensure(String(url) === endpoint + '/chat/completions', 'ENDPOINT_MISMATCH')
    const body = JSON.parse(String(options.body))
    ensure(body.model === model && !body.tools?.length && body.stream === false, 'ADAPTER_MISMATCH')
    ensure(Number.isInteger(body.max_tokens) && body.max_tokens <= 2048, 'OUTPUT_UNBOUNDED')
    ensure(features.includes(phase), 'UNEXPECTED_FEATURE')
    const serialized = JSON.stringify(body.messages)
    ensure(serialized.includes(marker), 'SOURCE_MARKER_MISSING')
    ensure(serialized.includes('当前功能 ' + phase), 'FEATURE_PROMPT_MISSING')
    const observation = {
      request: ++calls,
      feature: phase,
      maxTokens: body.max_tokens,
      httpStatus: null,
      usage: null
    }
    wire.push(observation)
    const section = {
      title: '合成日常结果',
      markdown: '仍需用户结合提供来源核验。',
      nature: 'inference',
      sourceHandles: ['source0']
    }
    const text = JSON.stringify({
      sections: [section],
      observations:
        phase === 'observation'
          ? [
              {
                title: '合成跨事件观察',
                markdown: '两条事件可能有待核验的共同点。',
                nature: 'inference',
                sourceHandles: ['source0', 'source1']
              }
            ]
          : [],
      proposals:
        phase === 'weekly-plan'
          ? [
              {
                candidate: {
                  kind: 'task',
                  title: '核验合成周计划',
                  description: '基于提供来源形成的待用户决定提案。',
                  status: 'open',
                  dueAt: null,
                  timeZone: null,
                  parentId: null,
                  relatedIds: [],
                  counterpart: ''
                },
                sourceHandles: ['source0']
              }
            ]
          : []
    })
    const response = preflight
      ? new globalThis.Response(
          JSON.stringify({
            id: 'synthetic',
            choices: [
              {
                index: 0,
                finish_reason: 'stop',
                message: { role: 'assistant', content: text }
              }
            ],
            usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 }
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      : await originalFetch(url, options)
    observation.httpStatus = response.status
    try {
      const envelope = await response.clone().json()
      observation.usage = envelope.usage ?? null
      const rawText = envelope.choices?.[0]?.message?.content
      observation.finishReason = ['stop', 'length', 'tool_calls', 'content_filter'].includes(
        envelope.choices?.[0]?.finish_reason
      )
        ? envelope.choices[0].finish_reason
        : 'other'
      try {
        const decoded = JSON.parse(rawText)
        const validated = dailyOutputSchema.safeParse(decoded)
        observation.outputSchema = validated.success
          ? 'valid'
          : validated.error.issues.map((issue) => ({
              code: issue.code,
              path: issue.path.filter(
                (part) =>
                  typeof part === 'number' ||
                  [
                    'sections',
                    'observations',
                    'proposals',
                    'title',
                    'markdown',
                    'nature',
                    'sourceHandles',
                    'candidate',
                    'kind',
                    'description',
                    'status',
                    'dueAt',
                    'timeZone',
                    'parentId',
                    'relatedIds',
                    'counterpart'
                  ].includes(part)
              )
            }))
        if (validated.success) {
          const supplied = new Set(
            JSON.parse(body.messages.find((m) => m.role === 'user').content).sources.map(
              (source) => source.handle
            )
          )
          observation.outputCounts = {
            sections: decoded.sections.length,
            observations: decoded.observations.length,
            proposals: decoded.proposals.length
          }
          observation.invalidSourceHandles = [
            ...decoded.sections,
            ...decoded.observations,
            ...decoded.proposals
          ].reduce(
            (sum, entry) =>
              sum + entry.sourceHandles.filter((handle) => !supplied.has(handle)).length,
            0
          )
        }
      } catch {
        observation.outputSchema = 'invalid-json'
      }
    } catch {
      // Missing or invalid endpoint usage remains explicitly null.
    }
    return response
  }

  const scheduled = new Date(Date.now() + 2 * 3600000)
  const scheduleTime = scheduled.toISOString().slice(11, 16)
  const settings = (feature) => ({
    enabled: true,
    connectionId,
    model,
    dataScope: {
      ownRounds: false,
      chapters: false,
      privateMemories: false,
      globalMemories: true,
      events: true,
      items: feature !== 'observation',
      proposals: false,
      maxSources: 8,
      lookbackDays: 7
    },
    budget: {
      window: 'utc-day',
      calls: 1,
      inputCharacters: 100000,
      maxOutputTokens: 2048
    },
    schedule: {
      timeZone: 'UTC',
      localTime: scheduleTime,
      weekday: scheduled.getUTCDay(),
      weekStartsOn: 1,
      fold: 'earlier',
      gap: 'skip'
    },
    recovery: { mode: 'EXPLICIT', catchUpMinutes: 120, merge: false, expire: true },
    allowSaveObservations: feature === 'observation',
    allowProposals: feature === 'weekly-plan',
    deadlineWindowHours: 72,
    changeFields: ['title', 'status', 'dueAt', 'description'],
    mergeChanges: feature === 'deadline-change' ? false : null
  })
  for (const feature of features) {
    phase = feature
    const before = checked(service.daily.query({ ...base, view: 'configurations', feature }))
      .configurations[0]
    const configured = checked(
      service.daily.configure({
        ...base,
        feature,
        expectedVersion: before.version,
        settings: settings(feature),
        grantSelectedRecipient: true
      })
    )
    ensure(
      configured.enabled &&
        configured.authorizedRecipient &&
        configured.connectionId === connectionId &&
        configured.model === model &&
        configured.budget?.calls === 1,
      'CONFIGURATION_NOT_FROZEN'
    )
    const started = checked(service.daily.run({ ...base, feature, commandId: randomUUID() }))
    const deadline = Date.now() + 90000
    let job
    do {
      const snapshot = checked(service.daily.query({ ...base, view: 'jobs', feature }))
      job = snapshot.jobs.find((candidate) => candidate.id === started.id)
      if (job && !['QUEUED', 'RUNNING'].includes(job.state)) break
      await pause(100)
    } while (Date.now() < deadline)
    ensure(job, 'JOB_MISSING')
    ensure(
      job.state === 'COMPLETED',
      'FEATURE_' + feature.toUpperCase().replace('-', '_') + '_' + job.state
    )
    ensure(
      job.reportId && job.slots.every((slot) => slot.state === 'COMPLETED'),
      'JOB_RECEIPT_MISSING'
    )
    const report = checked(service.daily.query({ ...base, view: 'reports', feature })).reports.find(
      (candidate) => candidate.id === job.reportId
    )
    ensure(report?.bodyAvailable && report.state === 'ACTIVE', 'REPORT_MISSING')
    const detail = checked(
      service.daily.inspect({
        ...base,
        id: report.id,
        expectedVersion: report.version,
        governanceVersion: report.governanceVersion
      })
    )
    ensure(
      detail.providedSources.length > 0 && detail.citedSources.length > 0,
      'SOURCE_RECEIPT_MISSING'
    )
    if (feature === 'weekly-plan') {
      ensure(detail.proposalLinks.length > 0, 'REAL_PROPOSAL_MISSING')
      proposal = {
        id: detail.proposalLinks[0].id,
        version: detail.proposalLinks[0].version,
        state: detail.proposalLinks[0].state
      }
    }
    if (feature === 'observation') {
      const objective = detail.observations.find(
        (candidate) => candidate.title === '所选事件范围的客观统计'
      )
      ensure(
        objective && objective.status === 'pending-verification',
        'OBJECTIVE_OBSERVATION_MISSING'
      )
      const receipt = checked(
        service.daily.decide({
          ...base,
          reportId: report.id,
          expectedReportVersion: report.version,
          governanceVersion: report.governanceVersion,
          observationId: objective.id,
          expectedVersion: objective.version,
          commandId: randomUUID(),
          action: 'accept'
        })
      )
      ensure(
        receipt.state === 'SUCCEEDED' && receipt.memory?.state === 'SUCCEEDED',
        'MEMORY_ACCEPT_FAILED'
      )
      const memory = checked(service.memory.inspect({ ...base, id: receipt.memory.objectId }))
      ensure(
        memory.record.state === 'active' &&
          memory.record.objectVersion === receipt.memory.objectVersion &&
          memory.changes.some((change) => change.actor === 'user'),
        'ACCEPTED_MEMORY_MISSING'
      )
      acceptedObservation = {
        observationId: receipt.objectId,
        observationVersion: receipt.objectVersion,
        memoryId: receipt.memory.objectId,
        memoryVersion: receipt.memory.objectVersion,
        memoryState: memory.record.state,
        nature: memory.record.nature
      }
    }
    results.push({
      feature,
      jobId: job.id,
      jobVersion: job.version,
      state: job.state,
      attempts: job.attempts,
      reportId: report.id,
      reportVersion: report.version,
      reportState: report.state,
      providedSources: detail.providedSources.length,
      citedSources: detail.citedSources.length,
      sections: detail.sections.length,
      observations: detail.observations.length,
      proposals: detail.proposalLinks.length,
      rangeLimited: report.range.limited
    })
  }

  ensure(
    calls === features.length && wire.every((row) => row.httpStatus === 200),
    'REQUEST_SET_INCOMPLETE'
  )
  ensure(
    (!features.includes('observation') || acceptedObservation) &&
      (!features.includes('weekly-plan') || proposal),
    'BUSINESS_RECEIPTS_INCOMPLETE'
  )
  const usage = checked(service.operations.usage({ protocolVersion: 1, actor: 'assistant' }))
  ensure(
    usage.summary.calls === features.length &&
      usage.attempts.length === features.length &&
      new Set(usage.attempts.map((attempt) => attempt.feature)).size === features.length,
    'USAGE_NOT_SEPARATED'
  )
  const usageSummary = {
    calls: usage.summary.calls,
    actual: usage.summary.known,
    unknownRequests: usage.summary.unknownRequests,
    complete: usage.summary.complete,
    attempts: usage.attempts.map((attempt) => ({
      id: attempt.id,
      feature: attempt.feature,
      state: attempt.state,
      inputCharacters: attempt.inputCharacters,
      actual: attempt.actual
    }))
  }

  service.close()
  service = undefined
  const beforeReopen = fetchInvocations
  phase = 'reopen'
  service = ProviderService.open(databasePath, join(root, 'credentials'), protector)
  await pause(1200)
  reopenCalls = fetchInvocations - beforeReopen
  ensure(reopenCalls === 0, 'CREDENTIAL_FREE_REOPEN_CALLED')
  const reopenedReports = features.flatMap(
    (feature) => checked(service.daily.query({ ...base, view: 'reports', feature })).reports
  )
  ensure(reopenedReports.length === features.length, 'REPORTS_NOT_REOPENED')
  const reopenedMemory = acceptedObservation
    ? checked(service.memory.inspect({ ...base, id: acceptedObservation.memoryId })).record
    : null
  ensure(
    !acceptedObservation ||
      (reopenedMemory.objectVersion === acceptedObservation.memoryVersion &&
        reopenedMemory.state === 'active'),
    'MEMORY_NOT_REOPENED'
  )

  process.stdout.write(
    JSON.stringify({
      outcome: preflight ? 'LOCAL_PREFLIGHT_PASS' : 'SUPPORTED',
      bundleSha256,
      endpoint,
      model,
      requestsAttempted: preflight ? 0 : calls,
      syntheticTransportCalls: preflight ? calls : 0,
      wire,
      features: results,
      usage: usageSummary,
      acceptedObservation,
      proposal,
      reopenedReports: reopenedReports.length,
      reopenCalls,
      disclosure: {
        rendererDriven: false,
        processRestart: false,
        packaged: false,
        syntheticSourcesOnly: true,
        memoryEventsCreatedThroughApi: 2,
        formalItemsCreatedThroughApi: 1,
        responseBodyLogged: false,
        credentialPersisted: false
      }
    }) + '\n'
  )
} catch (error) {
  process.stdout.write(
    JSON.stringify({
      outcome: 'INCONCLUSIVE',
      phase,
      bundleSha256,
      endpoint,
      model,
      requestsAttempted: preflight ? 0 : calls,
      syntheticTransportCalls: preflight ? calls : 0,
      wire,
      completedFeatures: results,
      acceptedObservation,
      proposal,
      reopenCalls,
      reason:
        error instanceof Error && /^[A-Z][A-Z0-9_]{1,90}$/.test(error.message)
          ? error.message
          : 'LOCAL_OR_PRODUCT_FAILURE'
    }) + '\n'
  )
  process.exitCode = 1
} finally {
  service?.close()
  assistants?.close()
  globalThis.fetch = originalFetch
  if (realpathSync(root) === canonical) rmSync(root, { recursive: true })
}
