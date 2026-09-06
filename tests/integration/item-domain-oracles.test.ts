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
it('invalidates previews for source withdrawal, target removal, new links, permission and other-assistant governance', () => {
  for (const change of ['withdrawal', 'target-delete', 'new-link', 'permission', 'assistant']) {
    const f = fixture(),
      id = f.create('预览对象')
    f.grant()
    const preview = f.service.preview({
      ...f.base,
      commandId: randomUUID(),
      action: 'delete',
      targets: [{ id, expectedVersion: 1 }]
    })
    if (!preview.ok) throw Error('preview')
    if (change === 'withdrawal')
      f.store.database
        .prepare('INSERT INTO memory_suppressions VALUES(?,?,?,?,?)')
        .run('round', randomUUID(), 1, 'withdrawal', randomUUID())
    if (change === 'target-delete') f.store.database.prepare('DELETE FROM items WHERE id=?').run(id)
    if (change === 'new-link')
      expect(
        f.service.mutate({
          ...f.base,
          commandId: randomUUID(),
          mutation: { action: 'create', content: { ...emptyItem('task', '新关联'), parentId: id } }
        })
      ).toMatchObject({ ok: true })
    if (change === 'permission') f.grant({ receive: false })
    if (change === 'assistant')
      f.store.database
        .prepare('UPDATE assistants SET display_name=? WHERE id=?')
        .run('另助手改名', f.ids[1]!)
    expect(
      f.service.confirm({ ...f.base, confirmationId: preview.data.confirmationId, accept: true })
    ).toMatchObject({ ok: false, error: { code: 'STALE_WRITE' } })
  }
})
it('does not inherit recipient permissions on endpoint change and separates read/write/propose', () => {
  const f = fixture()
  f.grant({ write: false })
  expect(() =>
    f.service.applyMutation(
      f.base.assistantId,
      randomUUID(),
      { action: 'create', content: emptyItem('task', '禁止写入') },
      [],
      f.execution
    )
  ).toThrow()
  expect(() =>
    f.service.proposeLocal(
      f.base.assistantId,
      randomUUID(),
      emptyItem('task', '允许建议'),
      [],
      'identity',
      f.execution
    )
  ).not.toThrow()
  f.newEndpoint()
  expect(f.service.permissionState(f.base.assistantId).receive).toBe(false)
  expect(() => f.service.search(f.execution, '允许')).toThrow()
})
it('rejects model association with an unreadable source-bearing item', () => {
  const f = fixture()
  f.grant()
  const saved = f.service.applyMutation(
    f.base.assistantId,
    randomUUID(),
    { action: 'create', content: emptyItem('project', '私密父项') },
    [{ type: 'manual', id: randomUUID(), assistantId: f.base.assistantId, version: 1 }]
  )
  f.deny()
  expect(() =>
    f.service.proposeLocal(
      f.base.assistantId,
      randomUUID(),
      { ...emptyItem('task', '不可关联'), parentId: saved.objectId },
      [],
      'identity',
      f.execution
    )
  ).toThrow()
  expect(f.service.query({ ...f.base, view: 'proposals' })).toMatchObject({
    ok: true,
    data: { proposals: [] }
  })
})
it('keeps same-ID proposal negotiation, rejects another assistant, and suppresses rejected identity without overblocking another anchor', () => {
  const f = fixture(),
    p = f.service.proposeLocal(
      f.base.assistantId,
      randomUUID(),
      emptyItem('task', '旧措辞'),
      [],
      'same-anchor'
    )
  const act = (action: string, expectedVersion: number, assistantId = f.base.assistantId) =>
    f.service.proposalAction({
      ...f.base,
      assistantId,
      commandId: randomUUID(),
      id: p.objectId,
      expectedVersion,
      action
    })
  expect(act('discuss', 1, f.ids[1])).toMatchObject({
    ok: false,
    error: { code: 'PERMISSION_DENIED' }
  })
  expect(act('defer', 1)).toMatchObject({ ok: true, data: { objectVersion: 2 } })
  expect(act('resume', 2)).toMatchObject({ ok: true, data: { objectVersion: 3 } })
  expect(act('reject', 3)).toMatchObject({ ok: true, data: { objectVersion: 4 } })
  expect(
    f.service.proposeLocal(
      f.base.assistantId,
      randomUUID(),
      emptyItem('task', '改写旧建议'),
      [],
      'same-anchor'
    )
  ).toMatchObject({ state: 'SUPPRESSED', objectId: p.objectId })
  expect(
    f.service.proposeLocal(
      f.base.assistantId,
      randomUUID(),
      emptyItem('task', '不同对象'),
      [],
      'different-anchor'
    )
  ).toMatchObject({ state: 'SUCCEEDED' })
  expect(f.service.query({ ...f.base, view: 'proposals' })).toMatchObject({
    ok: true,
    data: { formalCount: 0, proposals: expect.any(Array) }
  })
})
it('requires precise link-removal confirmation and invalidates the preview on unrelated business changes', () => {
  const f = fixture(),
    parent = f.create('父项')
  const child = f.service.mutate({
    ...f.base,
    commandId: randomUUID(),
    mutation: { action: 'create', content: { ...emptyItem('task', '子项'), parentId: parent } }
  })
  if (!child.ok) throw Error('child')
  const id = child.data.objectId!,
    content = emptyItem('task', '子项')
  expect(
    f.service.mutate({
      ...f.base,
      commandId: randomUUID(),
      mutation: { action: 'update', id, expectedVersion: 1, content }
    })
  ).toMatchObject({ ok: false, error: { code: 'PERMISSION_DENIED' } })
  const p = f.service.preview({
    ...f.base,
    commandId: randomUUID(),
    action: 'replace-links',
    targets: [{ id, expectedVersion: 1 }],
    content
  })
  if (!p.ok) throw Error('preview')
  f.create('另一个事项')
  expect(
    f.service.confirm({ ...f.base, confirmationId: p.data.confirmationId, accept: true })
  ).toMatchObject({ ok: false, error: { code: 'STALE_WRITE' } })
  const fresh = f.service.preview({
    ...f.base,
    commandId: randomUUID(),
    action: 'replace-links',
    targets: [{ id, expectedVersion: 1 }],
    content
  })
  if (!fresh.ok) throw Error('preview')
  expect(
    f.service.confirm({ ...f.base, confirmationId: fresh.data.confirmationId, accept: true })
  ).toMatchObject({ ok: true })
  expect(f.service.inspect({ ...f.base, type: 'item', id })).toMatchObject({
    ok: true,
    data: { item: { version: 2, content: { parentId: null } } }
  })
})
it('explicitly restores archived assistants through the existing switch channel and rejects stale revisions', () => {
  const f = fixture(),
    a = f.ids[1]!
  const archived = f.assistants.archive({
    protocolVersion: 1,
    assistantId: a,
    expectedAssistantVersion: 1,
    expectedStateRevision: 2
  })
  if (!archived.ok) throw Error('archive')
  expect(
    f.assistants.switch({ protocolVersion: 1, assistantId: a, expectedStateRevision: 3 })
  ).toMatchObject({ ok: false, error: { code: 'ASSISTANT_ARCHIVED' } })
  expect(
    f.assistants.switch({
      protocolVersion: 1,
      assistantId: a,
      expectedStateRevision: 2,
      restoreArchived: true
    })
  ).toMatchObject({ ok: false, error: { code: 'STALE_WRITE' } })
  const restored = f.assistants.switch({
    protocolVersion: 1,
    assistantId: a,
    expectedStateRevision: 3,
    restoreArchived: true
  })
  expect(restored).toMatchObject({ ok: true, data: { currentAssistantId: a } })
  expect(
    f.assistants.switch({
      protocolVersion: 1,
      assistantId: a,
      expectedStateRevision: 3,
      restoreArchived: true
    })
  ).toMatchObject({ ok: false, error: { code: 'STALE_WRITE' } })
})

it('atomically deletes a parent and selected child in one confirmed batch while retaining unrelated items', () => {
  const f = fixture(),
    parent = f.create('父项'),
    other = f.create('其他')
  const child = f.service.mutate({
    ...f.base,
    commandId: randomUUID(),
    mutation: { action: 'create', content: { ...emptyItem('task', '子项'), parentId: parent } }
  })
  if (!child.ok) throw Error('child')
  const plan = f.service.preview({
    ...f.base,
    commandId: randomUUID(),
    action: 'delete',
    targets: [
      { id: parent, expectedVersion: 1 },
      { id: child.data.objectId, expectedVersion: 1 }
    ]
  })
  if (!plan.ok) throw Error('preview')
  expect(f.service.query(f.base)).toMatchObject({ ok: true, data: { formalCount: 3 } })
  expect(
    f.service.confirm({ ...f.base, confirmationId: plan.data.confirmationId, accept: true })
  ).toMatchObject({ ok: true })
  expect(f.service.query(f.base)).toMatchObject({
    ok: true,
    data: { formalCount: 1, items: [{ id: other }] }
  })
})
