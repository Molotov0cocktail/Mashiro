import { randomUUID } from 'node:crypto'
import { writeFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { stewardFixture } from './steward-fixture.js'

it.each(['corrupt', 'missing'] as const)(
  'blocks export for a %s active accepted member but skips its obsolete version',
  (damage) => {
    const f = stewardFixture()
    const receipt = f.remember('真实接受正文')
    const branch = f.service.organization.ensure('完整性')
    f.service.organization.link(
      branch,
      { type: 'memory', id: receipt.objectId, version: 1, assistantId: f.assistantId },
      'member',
      []
    )
    const current = f.snapshot().branches[0]!
    const row = f.store.database
      .prepare('SELECT file_name FROM memory_versions WHERE object_id=? AND version=1')
      .get(receipt.objectId)!
    const file = join(f.directory, 'memory', String(row.file_name))
    if (damage === 'corrupt') writeFileSync(file, '损坏的合成内容')
    else unlinkSync(file)
    expect(
      f.service.branch({ ...f.base, id: branch.id, expectedVersion: current.version })
    ).toMatchObject({
      ok: false,
      error: { code: 'STORAGE_UNAVAILABLE', message: expect.stringContaining('已停止读取和导出') }
    })
    expect(
      f.memory.mutate({
        ...f.base,
        commandId: randomUUID(),
        mutation: {
          action: 'correct',
          targetId: receipt.objectId,
          expectedVersion: 1,
          kind: 'user',
          scope: 'global',
          title: '用户重新确认',
          markdown: '用户重新写入的正文',
          nature: 'user-statement',
          event: null
        }
      }).ok
    ).toBe(true)
    const updated = f.snapshot().branches[0]!
    expect(updated.version).toBeGreaterThan(current.version)
    expect(
      f.service.branch({ ...f.base, id: branch.id, expectedVersion: updated.version })
    ).toMatchObject({ ok: true, data: { members: [], markdown: '' } })
  }
)
