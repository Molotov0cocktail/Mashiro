/* global console, process */
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { AssistantService } from '../../../src/main/assistant/assistant-service.js'
import { SqliteStore } from '../../../src/main/data/sqlite.js'
import { MemoryService } from '../../../src/main/memory/memory-service.js'
const [directory, phase] = process.argv.slice(2)
const path = join(directory!, 'state.sqlite')
if (phase === 'inspect') {
  const store = new SqliteStore(path)
  const assistant = store.database.prepare('SELECT id FROM assistants LIMIT 1').get() as { id: string }
  const memory = new MemoryService(store, join(directory!, 'memory'), () => ({ fingerprint: null, display: null }))
  const query = memory.query({ protocolVersion: 1, assistantId: assistant.id })
  if (!query.ok) throw Error('inspection failed')
  const states = store.database.prepare('SELECT state FROM memory_commands').all()
  console.log(JSON.stringify({ objects: query.data.records.length, integrity: query.data.records.every(record => record.state === 'active' && record.markdown === '合成硬终止记忆'), states }))
  store.close()
} else {
  const assistants = AssistantService.open(path)
  const created = assistants.create({ protocolVersion: 1, displayName: '硬终止合成', expectedStateRevision: 0 })
  if (!created.ok) throw Error('fixture')
  const assistantId = created.data.assistants[0]!.id
  assistants.close()
  const store = new SqliteStore(path)
  const memory = new MemoryService(store, join(directory!, 'memory'), () => ({ fingerprint: null, display: null }), undefined, at => {
    if (at === phase) {
      process.send!({ phase: at })
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0)
    }
  })
  memory.mutate({ protocolVersion: 1, assistantId, commandId: randomUUID(), mutation: { action: 'remember', targetId: null, expectedVersion: null, kind: 'user', scope: 'global', title: '合成', markdown: '合成硬终止记忆', nature: 'user-statement', event: null } })
  throw Error('expected hard termination point was not reached')
}
