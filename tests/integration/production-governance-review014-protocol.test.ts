import { randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { expect, it } from 'vitest'
import { AssistantService } from '../../src/main/assistant/assistant-service.js'
import { SqliteStore } from '../../src/main/data/sqlite.js'
import { MemoryService } from '../../src/main/memory/memory-service.js'
import { ToolRepository } from '../../src/main/provider/tool-repository.js'
import { applyProductionGovernance } from '../../src/main/data/production-governance-apply.js'

it.each(['operation', 'result-only'])(
  'review014: obsolete Memory body is removed from tool protocol copies referenced by %s',
  (reference) => {
    const root = mkdtempSync(join(realpathSync.native(tmpdir()), 'mashiro-review014-protocol-'))
    const path = join(root, 'mashiro.sqlite')
    const assistants = AssistantService.open(path)
    const result = assistants.create({
      protocolVersion: 1,
      displayName: '合成',
      expectedStateRevision: 0
    })
    if (!result.ok) throw Error('NO_ASSISTANT')
    const assistantId = result.data.assistants[0]!.id
    assistants.close()
    const store = new SqliteStore(path)
    try {
      mkdirSync(join(root, 'memory'))
      const memory = new MemoryService(store, join(root, 'memory'), () => ({
        fingerprint: null,
        display: null
      }))
      const body = 'REVIEW014-OBSOLETE-PROTOCOL-BODY'
      const saved = memory.mutate({
        protocolVersion: 1,
        assistantId,
        commandId: randomUUID(),
        mutation: {
          action: 'remember',
          targetId: null,
          expectedVersion: null,
          kind: 'user',
          scope: 'global',
          title: '合成旧版本',
          markdown: body,
          nature: 'user-statement',
          event: null
        }
      })
      if (!saved.ok || !saved.data.objectId) throw Error('NO_MEMORY')
      const id = saved.data.objectId
      const tools = new ToolRepository(store)
      const segment = {
        id: randomUUID(),
        assistantId,
        requestId: randomUUID(),
        endpointFingerprint: 'a'.repeat(64),
        model: 'synthetic',
        adapterVersion: 'synthetic',
        messages: [],
        createdAt: new Date().toISOString()
      }
      tools.create(segment)
      const call = {
        id: 'review-call',
        type: 'function' as const,
        function: {
          name: 'search_memory' as const,
          arguments: JSON.stringify(
            reference === 'operation' ? { targetId: id } : { query: 'synthetic query' }
          )
        }
      }
      const operation = tools.prepare(segment, randomUUID(), call)
      tools.update({ ...operation, state: 'DISPATCHING' })
      tools.update(
        { ...operation, state: 'SUCCEEDED' },
        JSON.stringify({ objectId: id, markdown: body })
      )
      tools.messages(
        segment.id,
        [
          { role: 'assistant', content: '', tool_calls: [call] },
          {
            role: 'tool',
            tool_call_id: call.id,
            content: JSON.stringify({ objectId: id, markdown: body })
          }
        ],
        true
      )
      writeFileSync(join(root, '.mashiro-snapshot.json'), '{}')
      applyProductionGovernance(store.database, root, [
        {
          table: 'memory_objects',
          keys: [id],
          values: [2, 'global', assistantId, 'active', 'persistent'],
          deleted: false
        }
      ])
      const stored = store.database
        .prepare('SELECT messages_json FROM protocol_segments WHERE id=?')
        .get(segment.id)!
      expect(String(stored.messages_json)).not.toContain(body)
      expect(tools.result(operation.operationId)).not.toContain(body)
      expect(readFileSync(path).includes(Buffer.from(body))).toBe(false)
    } finally {
      store.close()
      const actual = realpathSync.native(root)
      if (
        dirname(actual) !== realpathSync.native(tmpdir()) ||
        !basename(actual).startsWith('mashiro-review014-protocol-')
      )
        rejectUnownedRoot()
      rmSync(actual, { recursive: true, force: true })
    }
  }
)

function rejectUnownedRoot(): never {
  throw Error('UNOWNED_ROOT')
}
