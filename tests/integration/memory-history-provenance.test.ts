import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { afterEach, expect, it } from 'vitest'
import { AssistantService } from '../../src/main/assistant/assistant-service.js'
import { ProviderService } from '../../src/main/provider/provider-service.js'
import { SqliteStore } from '../../src/main/data/sqlite.js'
import type { TransportResult } from '../../src/main/provider/chat-completions-transport.js'

const cleanup: (() => void)[] = []
afterEach(() =>
  cleanup
    .splice(0)
    .reverse()
    .forEach((close) => close())
)

it.each(['withdraw-after', 'withdraw-before', 'revoke-before'] as const)(
  'carries searched history into derived memory and rechecks authority: %s',
  async (change) => {
    const root = mkdtempSync(join(tmpdir(), 'mashiro-history-provenance-'))
    cleanup.push(() => rmSync(root, { recursive: true, force: true }))
    const path = join(root, 'state.sqlite')
    const assistants = AssistantService.open(path)
    const created = assistants.create({
      protocolVersion: 1,
      displayName: '合成助手',
      expectedStateRevision: 0
    })
    assistants.close()
    if (!created.ok) throw Error('assistant fixture')
    const assistantId = created.data.assistants[0]!.id
    const store = new SqliteStore(path)
    cleanup.push(() => store.close())
    const sourceId = randomUUID()
    let derive = false
    let step = 0
    const suppress = () =>
      store.database
        .prepare('INSERT INTO memory_suppressions VALUES(?,?,?,?,?)')
        .run('round', sourceId, 1, 'withdrawal', sourceId)
    const transport = async (): Promise<TransportResult> => {
      const call = (
        name: 'search_conversation_history' | 'write_memory',
        args: unknown
      ): TransportResult => ({
        status: 'completed',
        text: '',
        finishReason: 'tool_calls',
        usage: null,
        toolCalls: [
          {
            id: 'history-' + step,
            type: 'function',
            function: { name, arguments: JSON.stringify(args) }
          }
        ]
      })
      if (derive) {
        step++
        if (step === 1)
          return call('search_conversation_history', { query: 'UNIQUE-OLDER-SOURCE', limit: 1 })
        if (step === 2) {
          if (change === 'withdraw-before') suppress()
          if (change === 'revoke-before')
            store.database
              .prepare('UPDATE history_permissions SET read_history=0 WHERE assistant_id=?')
              .run(assistantId)
          return call('write_memory', {
            kind: 'user',
            scope: 'global',
            title: '归纳',
            markdown: 'DERIVED-FROM-SEARCH',
            nature: 'faithful-summary',
            event: null
          })
        }
      }
      return { status: 'completed', text: '合成回答', finishReason: 'stop', usage: null }
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
    cleanup.push(() => service.close())
    const connection = service.saveConnection({
      protocolVersion: 1,
      displayName: '合成端点',
      baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
      enabled: true
    })
    if (!connection.ok) throw Error('connection fixture')
    const connectionId = connection.data.connections[0]!.id
    service.setCredential({
      protocolVersion: 1,
      connectionId,
      apiKey: 'synthetic-test-only',
      persistence: 'temporary'
    })
    service.bindAssistant({
      protocolVersion: 1,
      assistantId,
      connectionId,
      model: 'glm-5.3-flash',
      expectedVersion: null
    })
    const permissions = service.permissions({ protocolVersion: 1, assistantId })
    if (!permissions.ok) throw Error('history permissions fixture')
    service.setPermissions({
      protocolVersion: 1,
      assistantId,
      connectionId,
      endpointFingerprint: permissions.data.endpointFingerprint,
      expectedVersion: permissions.data.version,
      readHistory: true,
      sendHistory: true
    })
    const grant = service.memory.permissionState(assistantId, 'global')
    service.memory.setPermissions({
      protocolVersion: 1,
      assistantId,
      scope: 'global',
      expectedVersion: grant.version,
      read: true,
      write: true,
      writeInferences: false,
      receive: true
    })
    const request = {
      protocolVersion: 1 as const,
      assistantId,
      mode: 'normal' as const,
      context: { kind: 'none' as const },
      tools: 'off' as const,
      stream: false
    }
    expect(
      (
        await service.startChat(
          { ...request, requestId: sourceId, text: 'UNIQUE-OLDER-SOURCE' },
          () => undefined
        )
      ).ok
    ).toBe(true)
    for (let index = 0; index < 18; index++) {
      expect(
        (
          await service.startChat(
            { ...request, requestId: randomUUID(), text: '填充轮次 ' + index },
            () => undefined
          )
        ).ok
      ).toBe(true)
    }
    derive = true
    const result = await service.startChat(
      {
        ...request,
        requestId: randomUUID(),
        text: '搜索旧记录并归纳为记忆',
        tools: 'clock-history-and-memory',
        context: { kind: 'recent' }
      },
      () => undefined
    )
    const records = service.memory.query({ protocolVersion: 1, assistantId })
    if (!records.ok) throw Error('query fixture')
    if (change !== 'withdraw-after') {
      expect(result.ok).toBe(false)
      expect(records.data.records).toHaveLength(0)
      expect(
        store.database
          .prepare("SELECT COUNT(*) AS n FROM memory_commands WHERE state='SUCCEEDED'")
          .get()
      ).toMatchObject({ n: 0 })
      return
    }
    expect(result.ok).toBe(true)
    expect(records.data.records).toHaveLength(1)
    expect(records.data.records[0]!.sources).toContainEqual({
      type: 'round',
      id: sourceId,
      assistantId,
      version: 1
    })
    const fingerprint = createHash('sha256')
      .update('chat-completions-v1|https://open.bigmodel.cn/api/paas/v4')
      .digest('hex')
    const execution = {
      assistantId,
      requestId: randomUUID(),
      fingerprint,
      assertCurrent: () => undefined,
      sources: []
    }
    expect(service.memory.search(execution, 'DERIVED-FROM-SEARCH', 10)).toHaveLength(1)
    suppress()
    expect(service.memory.search(execution, 'DERIVED-FROM-SEARCH', 10)).toHaveLength(0)
  }
)
