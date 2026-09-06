import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { afterEach, expect, it } from 'vitest'
import { AssistantService } from '../../src/main/assistant/assistant-service.js'
import { SqliteStore } from '../../src/main/data/sqlite.js'
import { ItemService } from '../../src/main/item/item-service.js'
import type { ItemContent } from '../../src/shared/item-contract.js'

const cleanup: (() => void)[] = []
afterEach(() =>
  cleanup
    .splice(0)
    .reverse()
    .forEach((fn) => fn())
)
function setup(fault?: (phase: string) => void) {
  const root = mkdtempSync(join(tmpdir(), 'mashiro-items-'))
  cleanup.push(() => rmSync(root, { recursive: true, force: true }))
  const path = join(root, 'state.sqlite')
  const assistants = AssistantService.open(path)
  const created = assistants.create({
    protocolVersion: 1,
    displayName: '合成助手',
    expectedStateRevision: 0
  })
  if (!created.ok) throw Error('fixture')
  const assistantId = created.data.assistants[0]!.id
  assistants.close()
  const store = new SqliteStore(path)
  cleanup.push(() => store.close())
  const service = new ItemService(
    store,
    () => ({ fingerprint: 'test-endpoint', display: '合成端点' }),
    () => undefined,
    () => undefined,
    fault
  )
  const base = { protocolVersion: 1 as const, assistantId }
  return { store, service, base, assistantId }
}
const content = (kind: ItemContent['kind'] = 'task'): ItemContent => ({
  kind,
  title: '交合成报告',
  description: '',
  status: 'open',
  dueAt: null,
  timeZone: null,
  parentId: null,
  relatedIds: [],
  counterpart: ''
})
it('deduplicates complete upstream sources and atomically rejects overflow and indirect self cycles', () => {
  const f = setup()
  const sources = Array.from({ length: 64 }, () => ({
    type: 'manual' as const,
    id: randomUUID(),
    assistantId: f.assistantId,
    version: 1
  }))
  const made = f.service.applyMutation(
    f.assistantId,
    randomUUID(),
    { action: 'create', content: content() },
    sources
  )
  const commandId = randomUUID()
  expect(() =>
    f.service.applyMutation(
      f.assistantId,
      commandId,
      { action: 'transition', id: made.objectId!, expectedVersion: 1, status: 'completed' },
      [{ ...sources[0]!, id: randomUUID() }]
    )
  ).toThrow()
  expect(f.service.inspect({ ...f.base, type: 'item', id: made.objectId })).toMatchObject({
    ok: true,
    data: { item: { version: 1, sources } }
  })
  expect(
    f.store.database.prepare('SELECT 1 FROM item_commands WHERE id=?').get(commandId)
  ).toBeUndefined()
  expect(
    f.service.applyMutation(
      f.assistantId,
      randomUUID(),
      { action: 'transition', id: made.objectId!, expectedVersion: 1, status: 'completed' },
      sources
    )
  ).toMatchObject({ objectVersion: 2 })
  const cycleRoot = f.service.applyMutation(
    f.assistantId,
    randomUUID(),
    { action: 'create', content: content() },
    sources.slice(0, 1)
  )
  const self = {
    type: 'item' as const,
    id: cycleRoot.objectId!,
    assistantId: f.assistantId,
    version: 1
  }
  const other = f.service.applyMutation(
    f.assistantId,
    randomUUID(),
    { action: 'create', content: content() },
    [self]
  )
  const upstream = { ...self, id: other.objectId!, version: 1 }
  expect(() =>
    f.service.applyMutation(
      f.assistantId,
      randomUUID(),
      { action: 'transition', id: cycleRoot.objectId!, expectedVersion: 1, status: 'open' },
      [upstream]
    )
  ).toThrow()
  expect(f.service.inspect({ ...f.base, type: 'item', id: made.objectId })).toMatchObject({
    ok: true,
    data: { item: { version: 2, sources } }
  })
  expect(f.service.inspect({ ...f.base, type: 'item', id: cycleRoot.objectId })).toMatchObject({
    ok: true,
    data: { item: { version: 1, sources: sources.slice(0, 1) } }
  })
})
it('recovers a lost preview with the same token and prevents operation identity reuse', () => {
  const f = setup()
  const made = f.service.mutate({
    ...f.base,
    commandId: randomUUID(),
    mutation: { action: 'create', content: content() }
  })
  if (!made.ok) throw Error('create')
  const commandId = randomUUID()
  const input = {
    ...f.base,
    commandId,
    action: 'delete',
    targets: [{ id: made.data.objectId, expectedVersion: 1 }]
  }
  const first = f.service.preview(input)
  if (!first.ok) throw Error('preview')
  expect(f.service.operation({ ...f.base, commandId })).toMatchObject({
    ok: true,
    data: first.data.receipt
  })
  expect(f.service.preview(input)).toEqual(first)
  expect(
    f.service.preview({ ...input, action: 'replace-links', content: content() })
  ).toMatchObject({ ok: false, error: { code: 'CONFLICT' } })
  expect(
    f.service.mutate({ ...f.base, commandId, mutation: { action: 'create', content: content() } })
  ).toMatchObject({ ok: false, error: { code: 'CONFLICT' } })
  const confirm = { ...f.base, confirmationId: first.data.confirmationId, accept: true }
  expect(f.service.confirm(confirm)).toMatchObject({ ok: true, data: { state: 'SUCCEEDED' } })
  expect(f.service.confirm(confirm)).toMatchObject({ ok: true, data: { state: 'SUCCEEDED' } })
  expect(f.service.query(f.base)).toMatchObject({ ok: true, data: { formalCount: 0 } })
})
it('creates all five formal types and preserves stable command identity', () => {
  const f = setup()
  for (const kind of ['goal', 'project', 'task', 'commitment', 'waiting'] as const) {
    const input = {
      ...f.base,
      commandId: randomUUID(),
      mutation: { action: 'create', content: content(kind) }
    }
    const first = f.service.mutate(input)
    expect(first.ok).toBe(true)
    expect(f.service.mutate(input)).toEqual(first)
    expect(
      f.service.mutate({
        ...input,
        mutation: { action: 'create', content: { ...content(kind), title: '不同参数' } }
      })
    ).toMatchObject({ ok: false, error: { code: 'CONFLICT' } })
  }
  expect(f.service.query(f.base)).toMatchObject({ ok: true, data: { formalCount: 5 } })
})
it('keeps proposals out of formal counts and atomically accepts exactly one item', () => {
  const f = setup()
  const proposal = f.service.proposeLocal(f.assistantId, randomUUID(), content(), [])
  expect(f.service.query(f.base)).toMatchObject({ ok: true, data: { formalCount: 0, items: [] } })
  const input = {
    ...f.base,
    commandId: randomUUID(),
    id: proposal.objectId,
    expectedVersion: 1,
    action: 'accept'
  }
  expect(f.service.proposalAction(input)).toMatchObject({ ok: true, data: { state: 'SUCCEEDED' } })
  expect(f.service.proposalAction(input)).toMatchObject({ ok: true })
  expect(f.service.proposalAction({ ...input, commandId: randomUUID() })).toMatchObject({
    ok: false,
    error: { code: 'STALE_WRITE' }
  })
  expect(f.service.query(f.base)).toMatchObject({ ok: true, data: { formalCount: 1 } })
})
it('rolls back item and proposal state if receipt commit fails', () => {
  let fail = false
  const f = setup((phase) => {
    if (fail && phase === 'before-receipt') throw Error('injected')
  })
  const proposal = f.service.proposeLocal(f.assistantId, randomUUID(), content(), [])
  fail = true
  expect(
    f.service.proposalAction({
      ...f.base,
      commandId: randomUUID(),
      id: proposal.objectId,
      expectedVersion: 1,
      action: 'accept'
    })
  ).toMatchObject({ ok: false })
  expect(f.service.query(f.base)).toMatchObject({ ok: true, data: { formalCount: 0 } })
  expect(f.service.inspect({ ...f.base, type: 'proposal', id: proposal.objectId })).toMatchObject({
    ok: true,
    data: { proposal: { state: 'DRAFT_PROPOSAL', version: 1 } }
  })
})
