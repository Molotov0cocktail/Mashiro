import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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

it('checks an active assistant and item identity without returning item content', () => {
  const root = mkdtempSync(join(tmpdir(), 'mashiro-item-navigation-'))
  cleanup.push(() => rmSync(root, { recursive: true, force: true }))
  const path = join(root, 'state.sqlite')
  const assistants = AssistantService.open(path)
  const created = assistants.create({
    protocolVersion: 1,
    displayName: '合成导航助手',
    expectedStateRevision: 0
  })
  if (!created.ok) throw new Error('ASSISTANT_FIXTURE_FAILED')
  const assistantId = created.data.currentAssistantId!
  assistants.close()

  const store = new SqliteStore(path)
  cleanup.push(() => store.close())
  const service = new ItemService(
    store,
    () => ({ fingerprint: null, display: null }),
    () => undefined
  )
  const content: ItemContent = {
    kind: 'task',
    title: '合成提醒目标',
    description: '此正文不应成为导航校验结果',
    status: 'open',
    dueAt: null,
    timeZone: null,
    parentId: null,
    relatedIds: [],
    counterpart: ''
  }
  const item = service.applyMutation(assistantId, randomUUID(), { action: 'create', content }, [])
  expect(service.hasNavigableItem(assistantId, item.objectId!)).toBe(true)
  expect(service.hasNavigableItem(randomUUID(), item.objectId!)).toBe(false)

  store.database.prepare('DELETE FROM items WHERE id=?').run(item.objectId)
  expect(service.hasNavigableItem(assistantId, item.objectId!)).toBe(false)
})
