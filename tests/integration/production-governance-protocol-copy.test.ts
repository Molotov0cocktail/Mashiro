import { randomUUID } from 'node:crypto'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, basename } from 'node:path'
import { expect, it } from 'vitest'
import { AssistantService } from '../../src/main/assistant/assistant-service.js'
import { SqliteStore } from '../../src/main/data/sqlite.js'
import { ToolRepository, type ToolSegment } from '../../src/main/provider/tool-repository.js'
import { redactGovernanceCopies } from '../../src/main/data/production-governance-redaction.js'

it.each(['result-only', 'messages-only'] as const)(
  'cleans an entire tainted search protocol from %s evidence while retaining a healthy segment',
  (source) => {
    const root = mkdtempSync(join(realpathSync.native(tmpdir()), 'mashiro-governance-protocol-'))
    const assistants = AssistantService.open(join(root, 'mashiro.sqlite'))
    const created = assistants.create({
      protocolVersion: 1,
      displayName: '合成助手',
      expectedStateRevision: 0
    })
    if (!created.ok) throw Error('NO_ASSISTANT')
    const assistantId = created.data.assistants[0]!.id
    assistants.close()
    const store = new SqliteStore(join(root, 'mashiro.sqlite'))
    try {
      const repository = new ToolRepository(store),
        id = randomUUID(),
        body = 'OBSOLETE-SEARCH-BODY'
      const create = (): ToolSegment => {
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
        repository.create(segment)
        return segment
      }
      const tainted = create(),
        healthy = create()
      const save = (segment: ToolSegment, text: string, result: string) => {
        const operation = repository.prepare(segment, randomUUID(), {
          id: randomUUID(),
          type: 'function',
          function: { name: 'search_memory', arguments: JSON.stringify({ query: text }) }
        })
        repository.update({ ...operation, state: 'DISPATCHING' })
        repository.update({ ...operation, state: 'SUCCEEDED', summary: text }, result)
        return operation.operationId
      }
      const first = save(
        tainted,
        'query without object identifiers',
        source === 'result-only'
          ? JSON.stringify({ records: [{ objectId: id, markdown: body }] })
          : '{}'
      )
      const sibling = save(tainted, body, JSON.stringify({ derived: body }))
      const good = save(
        healthy,
        'healthy summary',
        JSON.stringify({ objectId: randomUUID(), markdown: 'HEALTHY-BODY' })
      )
      repository.messages(
        tainted.id,
        [{ role: 'assistant', content: body + (source === 'messages-only' ? id : '') }],
        true
      )
      repository.messages(healthy.id, [{ role: 'assistant', content: 'HEALTHY-BODY' }], true)
      const before = store.database
        .prepare('SELECT * FROM protocol_segments WHERE id=?')
        .get(healthy.id)
      redactGovernanceCopies(store.database, new Set([id]))
      expect(
        store.database
          .prepare('SELECT status,messages_json FROM protocol_segments WHERE id=?')
          .get(tainted.id)
      ).toMatchObject({ status: 'interrupted', messages_json: '[]' })
      for (const operation of [first, sibling]) {
        expect(repository.result(operation)).toBe('{}')
        const row = store.database
          .prepare('SELECT arguments_json,record_json FROM tool_operations WHERE id=?')
          .get(operation)!
        expect(JSON.stringify(row)).not.toContain(body)
        expect(JSON.parse(String(row.record_json)).state).toBe('SUCCEEDED')
      }
      expect(
        store.database.prepare('SELECT * FROM protocol_segments WHERE id=?').get(healthy.id)
      ).toEqual(before)
      expect(repository.result(good)).toContain('HEALTHY-BODY')
    } finally {
      store.close()
      cleanup(root)
    }
  }
)
function cleanup(root: string): void {
  if (
    dirname(realpathSync.native(root)) !== realpathSync.native(tmpdir()) ||
    !basename(root).startsWith('mashiro-governance-protocol-')
  )
    throw Error('UNOWNED_ROOT')
  rmSync(root, { recursive: true, force: true })
}
