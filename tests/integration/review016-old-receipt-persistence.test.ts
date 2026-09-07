// Independent overall acceptance oracle; implementation ownership remains elsewhere.
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { AssistantService } from '../../src/main/assistant/assistant-service.js'
import { SqliteStore } from '../../src/main/data/sqlite.js'
import { OperationsService } from '../../src/main/background/operations-service.js'
import { ToolRepository } from '../../src/main/provider/tool-repository.js'

it('preserves an old unknown operation across reopen beyond 384 newer operations; health is not its recovery entry', () => {
  const root = mkdtempSync(join(tmpdir(), 'mashiro-review016-'))
  const path = join(root, 'synthetic.sqlite')
  let store: SqliteStore | undefined
  try {
    const service = AssistantService.open(path)
    const created = service.create({
      protocolVersion: 1,
      displayName: '独立合成验收',
      expectedStateRevision: 0
    })
    if (!created.ok) throw Error('fixture assistant failed')
    const assistantId = created.data.assistants[0]!.id
    service.close()
    store = new SqliteStore(path)
    const repository = new ToolRepository(store)
    const oldRequest = randomUUID()
    let oldOperation = ''
    for (let index = 0; index < 386; index += 1) {
      const segment = {
        id: randomUUID(),
        assistantId,
        requestId: index === 0 ? oldRequest : randomUUID(),
        endpointFingerprint: 'synthetic',
        model: 'synthetic',
        adapterVersion: 'synthetic',
        messages: [],
        createdAt: new Date().toISOString()
      }
      repository.create(segment)
      const operation = repository.prepare(segment, randomUUID(), {
        id: 'synthetic-call',
        type: 'function',
        function: { name: index === 0 ? 'write_memory' : 'get_current_time', arguments: '{}' }
      })
      repository.update({ ...operation, state: 'DISPATCHING' })
      if (index === 0) oldOperation = operation.operationId
      else repository.update({ ...operation, state: 'SUCCEEDED' })
      repository.close(segment.id)
    }
    store.close()
    store = new SqliteStore(path)
    const reopened = new ToolRepository(store)
    reopened.recover()
    const recent = reopened.read(assistantId)
    expect(recent).toHaveLength(384)
    expect(recent.some((entry) => entry.operationId === oldOperation)).toBe(false)
    expect(reopened.read(assistantId, oldRequest)).toMatchObject([
      { operationId: oldOperation, requestId: oldRequest, state: 'RESULT_UNKNOWN' }
    ])
    const health = new OperationsService(store)
    for (const view of ['current', 'failures', 'history', 'business'] as const) {
      const result = health.query({ protocolVersion: 1, view })
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.data.rows).toHaveLength(0)
    }
  } finally {
    store?.close()
    rmSync(root, { recursive: true, force: true })
  }
}, 20_000)
