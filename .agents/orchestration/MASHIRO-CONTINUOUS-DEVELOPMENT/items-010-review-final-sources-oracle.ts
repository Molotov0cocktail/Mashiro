import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { afterEach, expect, it } from 'vitest'
import { AssistantService } from '../../src/main/assistant/assistant-service.js'
import { SqliteStore } from '../../src/main/data/sqlite.js'
import { ItemService, type ItemExecution } from '../../src/main/item/item-service.js'
import { emptyItem } from '../../src/main/item/item-intent.js'
const cleanup: (() => void)[] = []
afterEach(() =>
  cleanup
    .splice(0)
    .reverse()
    .forEach((f) => f())
)
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'mashiro-item-oracles-'))
  cleanup.push(() => rmSync(root, { recursive: true, force: true }))
  const path = join(root, 'state.sqlite'),
    assistants = AssistantService.open(path),
    ids: string[] = []
  for (let i = 0; i < 2; i++) {
    const r = assistants.create({
      protocolVersion: 1,
      displayName: '合成' + i,
      expectedStateRevision: i
    })
    if (!r.ok) throw Error('fixture')
    ids.push(r.data.assistants.find((a) => a.displayName === '合成' + i)!.id)
  }
  cleanup.push(() => assistants.close())
  const store = new SqliteStore(path)
  cleanup.push(() => store.close())
  let denied = false,
    endpoint = 'old'
  const service = new ItemService(
    store,
    () => ({ fingerprint: endpoint, display: '合成' }),
    () => {
      if (denied) throw Error('denied source')
    }
  )
  const base = { protocolVersion: 1 as const, assistantId: ids[0]! }
  const execution: ItemExecution = {
    assistantId: ids[0]!,
    requestId: randomUUID(),
    fingerprint: 'old',
    sources: [],
    assertCurrent: () => {}
  }
  const grant = (overrides = {}) =>
    service.setPermissions({
      ...base,
      expectedVersion: service.permissionState(ids[0]!).version,
      read: true,
      write: true,
      propose: true,
      receive: true,
      ...overrides
    })
  const create = (title: string) => {
    const r = service.mutate({
      ...base,
      commandId: randomUUID(),
      mutation: { action: 'create', content: emptyItem('task', title) }
    })
    if (!r.ok) throw Error('create')
    return r.data.objectId!
  }
  return {
    service,
    store,
    assistants,
    ids,
    base,
    execution,
    grant,
    create,
    deny: () => {
      denied = true
    },
    newEndpoint: () => {
      endpoint = 'new'
    }
  }
}
it('independent: source saturation never silently drops a newly used dependency', () => {
  const f = fixture()
  f.grant()
  const sources = Array.from({ length: 64 }, () => ({ type: 'manual' as const, id: randomUUID(), assistantId: f.base.assistantId, version: 1 }))
  const original = f.service.applyMutation(f.base.assistantId, randomUUID(), { action: 'create', content: emptyItem('task', '来源上限') }, sources)
  const additional = { type: 'manual' as const, id: randomUUID(), assistantId: f.base.assistantId, version: 1 }
  let rejected = false
  try {
    f.service.applyMutation(f.base.assistantId, randomUUID(), { action: 'transition', id: original.objectId!, expectedVersion: 1, status: 'completed' }, [additional], f.execution)
  } catch { rejected = true }
  const result = f.service.inspect({ ...f.base, type: 'item', id: original.objectId })
  if (!result.ok) throw Error('inspect')
  expect(rejected || result.data.item!.sources.some((s) => s.id === additional.id)).toBe(true)
})