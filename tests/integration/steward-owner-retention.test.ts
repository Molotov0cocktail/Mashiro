import { randomUUID } from 'node:crypto'
import { expect, it, vi } from 'vitest'
import { stewardFixture } from './steward-fixture.js'

it('keeps accepted global ownership and uses an explicitly selected active anchor with existing retained-source authority', async () => {
  const f = stewardFixture(),
    receipt = f.remember(),
    anchor = randomUUID()
  f.store.database
    .prepare('INSERT INTO assistants(id,display_name,created_at,updated_at) VALUES(?,?,?,?)')
    .run(anchor, '合成新锚点', '2030-01-01T00:00:00Z', '2030-01-01T00:00:00Z')
  f.configure({ allowWrite: false })
  await vi.waitFor(() => expect(f.snapshot().jobs[0]?.state).toBe('PERMISSION_BLOCKED'))
  const oldJob = f.snapshot().jobs[0]!.id
  const record = f.memory.acceptedBackgroundMemory(f.assistantId, receipt.objectId, 1)
  f.store.database.prepare("INSERT INTO memory_permissions VALUES(?,'global',1,1,1,1)").run(anchor)
  for (const source of record.sources)
    f.store.database
      .prepare('INSERT INTO retained_source_edges VALUES(?,?,?,?,?,?,?,?)')
      .run(
        record.id,
        1,
        source.type,
        source.id,
        source.version,
        source.assistantId,
        JSON.stringify([[anchor, 'a'.repeat(64)]]),
        1
      )
  f.service.purgeAssistant(f.assistantId)
  f.store.database
    .prepare(
      'UPDATE assistant_state SET primary_assistant_id=?,current_assistant_id=? WHERE singleton=1'
    )
    .run(anchor, anchor)
  f.store.database.prepare('INSERT INTO assistant_tombstones VALUES(?,1)').run(f.assistantId)
  f.store.database
    .prepare('UPDATE assistants SET archived_at=? WHERE id=?')
    .run('2030-01-02T00:00:00Z', f.assistantId)
  const base = { protocolVersion: 1 as const, assistantId: anchor }
  expect(
    f.service.configure({
      ...base,
      role: 'steward',
      expectedVersion: f.service.configuration().version,
      settings: { ...f.stewardSettings, assistantIds: [anchor] },
      grantSelectedRecipient: true
    }).ok
  ).toBe(true)
  await vi.waitFor(() =>
    expect(f.service.query(base)).toMatchObject({
      ok: true,
      data: {
        jobs: expect.arrayContaining([
          expect.objectContaining({ authorityAssistantId: anchor, state: 'COMPLETED' })
        ])
      }
    })
  )
  expect(
    JSON.parse(
      String(
        f.store.database
          .prepare('SELECT record_json FROM memory_objects WHERE id=?')
          .get(record.id)!.record_json
      )
    ).ownerAssistantId
  ).toBe(f.assistantId)
  expect(
    JSON.parse(
      String(
        f.store.database.prepare('SELECT record_json FROM steward_jobs WHERE id=?').get(oldJob)!
          .record_json
      )
    ).authorityAssistantId
  ).toBe(f.assistantId)
  expect(f.send).toHaveBeenCalledTimes(1)
})
it('never fabricates retained-source authority for a new anchor after owner deletion', async () => {
  const f = stewardFixture(),
    receipt = f.remember(),
    anchor = randomUUID()
  f.store.database
    .prepare('INSERT INTO assistants(id,display_name,created_at,updated_at) VALUES(?,?,?,?)')
    .run(anchor, '未获旧来源授权', '2030-01-01T00:00:00Z', '2030-01-01T00:00:00Z')
  f.store.database.prepare("INSERT INTO memory_permissions VALUES(?,'global',1,1,1,1)").run(anchor)
  f.store.database
    .prepare(
      'UPDATE assistant_state SET primary_assistant_id=?,current_assistant_id=? WHERE singleton=1'
    )
    .run(anchor, anchor)
  f.store.database.prepare('INSERT INTO assistant_tombstones VALUES(?,1)').run(f.assistantId)
  f.store.database
    .prepare('UPDATE assistants SET archived_at=? WHERE id=?')
    .run('2030-01-02T00:00:00Z', f.assistantId)
  const base = { protocolVersion: 1 as const, assistantId: anchor }
  f.service.configure({
    ...base,
    role: 'steward',
    expectedVersion: 0,
    settings: { ...f.stewardSettings, assistantIds: [anchor] },
    grantSelectedRecipient: true
  })
  await vi.waitFor(() =>
    expect(f.service.query(base)).toMatchObject({
      ok: true,
      data: { jobs: [{ state: 'PERMISSION_BLOCKED' }] }
    })
  )
  expect(f.send).not.toHaveBeenCalled()
  expect(
    f.store.database
      .prepare('SELECT count(*) AS n FROM retained_source_edges WHERE object_id=?')
      .get(receipt.objectId)!.n
  ).toBe(0)
})
