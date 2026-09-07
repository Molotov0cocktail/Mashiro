import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { stewardFixture } from './steward-fixture.js'

it('does not report a complete empty branch when an active member Markdown file is corrupt', () => {
  const f = stewardFixture()
  const receipt = f.remember('ACCEPTED_MEMBER_MUST_NOT_SILENTLY_DISAPPEAR')
  const branch = f.service.organization.ensure('完整导出资料')
  f.service.organization.link(
    branch,
    { type: 'memory', id: receipt.objectId, version: 1, assistantId: f.assistantId },
    'member',
    []
  )
  const current = f.snapshot().branches[0]!
  const file = f.store.database
    .prepare('SELECT file_name FROM memory_versions WHERE object_id=? AND version=1')
    .get(receipt.objectId)!.file_name
  expect(typeof file).toBe('string')
  expect(String(file)).toMatch(/^[a-f0-9-]+\.md$/)
  writeFileSync(join(f.directory, 'memory', String(file)), 'CORRUPT_SYNTHETIC_FILE')
  const result = f.service.branch({ ...f.base, id: current.id, expectedVersion: current.version })
  expect(result.ok).toBe(false)
})
