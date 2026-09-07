import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { expect, it, vi } from 'vitest'
import { AssistantService } from '../../src/main/assistant/assistant-service.js'
import { ProviderService } from '../../src/main/provider/provider-service.js'
import type {
  TransportRequest,
  TransportResult
} from '../../src/main/provider/chat-completions-transport.js'
it('review: additive background chapter preserves normal stream while explicit user correction still cancels it', async () => {
  const root = mkdtempSync(join(tmpdir(), 'mashiro-background-review-'))
  const path = join(root, 'state.sqlite')
  const assistants = AssistantService.open(path)
  const made = assistants.create({
    protocolVersion: 1,
    displayName: 'Synthetic Review',
    expectedStateRevision: 0
  })
  if (!made.ok) throw Error('assistant fixture')
  const assistantId = made.data.assistants[0]!.id
  assistants.close()
  let pendingSignal: AbortSignal | undefined
  let finishBackground!: (value: TransportResult) => void
  let backgroundStarted = false
  const transport = async (request: TransportRequest): Promise<TransportResult> => {
    if (request.messages[0]?.content.startsWith('你是当前助手的章节整理角色。')) {
      backgroundStarted = true
      return new Promise((resolve) => {
        finishBackground = resolve
      })
    }
    if (request.messages.at(-1)?.content === 'pending') {
      pendingSignal = request.signal
      request.onDelta?.('synthetic partial')
      return new Promise((resolve) =>
        request.signal!.addEventListener(
          'abort',
          () => resolve({ status: 'cancelled', text: 'synthetic partial', usage: null }),
          { once: true }
        )
      )
    }
    return { status: 'completed', text: 'synthetic completed source', usage: null }
  }
  const service = ProviderService.open(
    path,
    join(root, 'credentials'),
    {
      isEncryptionAvailable: () => true,
      encryptString: (value) => Buffer.from(value),
      decryptString: (value) => value.toString()
    },
    transport
  )
  try {
    const base = { protocolVersion: 1 as const, assistantId }
    const connection = service.saveConnection({
      protocolVersion: 1,
      displayName: 'Synthetic',
      baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
      enabled: true
    })
    if (!connection.ok) throw Error('connection fixture')
    const connectionId = connection.data.connections[0]!.id
    expect(
      service.setCredential({
        protocolVersion: 1,
        connectionId,
        apiKey: 'synthetic-only',
        persistence: 'temporary'
      }).ok
    ).toBe(true)
    expect(
      service.bindAssistant({
        ...base,
        connectionId,
        model: 'GLM-5.3-FLASH',
        expectedVersion: null
      }).ok
    ).toBe(true)
    const history = service.permissions(base)
    if (!history.ok) throw Error('history fixture')
    expect(
      service.setPermissions({
        ...base,
        connectionId: history.data.connectionId,
        endpointFingerprint: history.data.endpointFingerprint,
        expectedVersion: history.data.version,
        readHistory: true,
        sendHistory: true
      }).ok
    ).toBe(true)
    const permissions = service.memory.permissions({ ...base, scope: 'assistant' })
    if (!permissions.ok) throw Error('memory fixture')
    expect(
      service.memory.setPermissions({
        ...base,
        scope: 'assistant',
        expectedVersion: permissions.data.version,
        read: true,
        write: true,
        writeInferences: false,
        receive: true
      }).ok
    ).toBe(true)
    const request = (text: string) => ({
      ...base,
      requestId: randomUUID(),
      text,
      mode: 'normal' as const,
      stream: true,
      context: { kind: 'none' as const },
      tools: 'off' as const
    })
    expect((await service.startChat(request('seed'), () => undefined)).ok).toBe(true)
    const pending = service.startChat(request('pending'), () => undefined)
    await vi.waitFor(() => expect(pendingSignal).toBeDefined())
    expect(pendingSignal!.aborted).toBe(false)
    expect(
      service.background.configure({
        ...base,
        expectedVersion: 0,
        grantSelectedRecipient: true,
        settings: {
          enabled: true,
          connectionId,
          model: 'GLM-5.3-FLASH',
          allowOwnCompletedRounds: true,
          budget: { window: 'utc-day', calls: 1, inputCharacters: 100000 }
        }
      }).ok
    ).toBe(true)
    expect(pendingSignal!.aborted).toBe(false)
    await vi.waitFor(() => expect(backgroundStarted).toBe(true))
    expect(pendingSignal!.aborted).toBe(false)
    finishBackground({
      status: 'completed',
      text: JSON.stringify({
        title: 'Synthetic chapter',
        summary: 'Synthetic faithful summary',
        unfinishedTopics: []
      }),
      usage: { promptTokens: 2, completionTokens: 2, totalTokens: 4 }
    })
    await vi.waitFor(() => {
      const result = service.background.query(base)
      expect(result.ok && result.data.jobs.some((job) => job.state === 'COMPLETED')).toBe(true)
    })
    expect(pendingSignal!.aborted).toBe(false)
    const snapshot = service.background.query(base)
    if (!snapshot.ok) throw Error('accepted chapter fixture')
    const chapter = snapshot.data.chapters[0]!
    const corrected = service.memory.mutate({
      ...base,
      commandId: randomUUID(),
      mutation: {
        action: 'correct',
        targetId: chapter.memoryId,
        expectedVersion: 1,
        kind: 'continuity',
        scope: 'assistant',
        title: 'User corrected chapter',
        markdown: 'Explicit user correction',
        nature: 'user-statement',
        event: null
      }
    })
    expect(corrected.ok).toBe(true)
    expect(pendingSignal!.aborted).toBe(true)
    expect(await pending).toMatchObject({ ok: true, data: { status: 'cancelled' } })
  } finally {
    service.close()
    rmSync(root, { recursive: true, force: true })
  }
})
