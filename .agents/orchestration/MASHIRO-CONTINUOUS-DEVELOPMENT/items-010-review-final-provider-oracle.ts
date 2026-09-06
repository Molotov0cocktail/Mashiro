import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { afterEach, expect, it } from 'vitest'
import { AssistantService } from '../../src/main/assistant/assistant-service.js'
import { ProviderService } from '../../src/main/provider/provider-service.js'
import type {
  TransportRequest,
  TransportResult
} from '../../src/main/provider/chat-completions-transport.js'
import { emptyItem } from '../../src/main/item/item-intent.js'

const cleanup: (() => void)[] = []
afterEach(() =>
  cleanup
    .splice(0)
    .reverse()
    .forEach((f) => f())
)
function setup(transport: (r: TransportRequest) => Promise<TransportResult>) {
  const root = mkdtempSync(join(tmpdir(), 'mashiro-item-provider-'))
  cleanup.push(() => rmSync(root, { recursive: true, force: true }))
  const path = join(root, 'state.sqlite'),
    assistants = AssistantService.open(path)
  const result = assistants.create({
    protocolVersion: 1,
    displayName: '合成助手',
    expectedStateRevision: 0
  })
  if (!result.ok) throw Error('fixture')
  const assistantId = result.data.assistants[0]!.id
  assistants.close()
  const service = ProviderService.open(
    path,
    join(root, 'credentials'),
    {
      isEncryptionAvailable: () => false,
      encryptString: () => {
        throw Error('unused')
      },
      decryptString: () => {
        throw Error('unused')
      }
    },
    transport
  )
  cleanup.push(() => service.close())
  const connection = service.saveConnection({
    protocolVersion: 1,
    displayName: '合成',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    enabled: true
  })
  if (!connection.ok) throw Error('fixture')
  const connectionId = connection.data.connections[0]!.id
  service.bindAssistant({
    protocolVersion: 1,
    assistantId,
    connectionId,
    model: 'GLM-5.3-FLASH',
    expectedVersion: null
  })
  service.setCredential({
    protocolVersion: 1,
    connectionId,
    apiKey: 'synthetic',
    persistence: 'temporary'
  })
  const history = service.permissions({ protocolVersion: 1, assistantId })
  if (!history.ok) throw Error('fixture')
  service.setPermissions({
    protocolVersion: 1,
    assistantId,
    connectionId,
    endpointFingerprint: history.data.endpointFingerprint,
    expectedVersion: history.data.version,
    readHistory: true,
    sendHistory: true
  })
  service.items.setPermissions({
    protocolVersion: 1,
    assistantId,
    expectedVersion: 0,
    read: true,
    write: true,
    propose: true,
    receive: true
  })
  const chat = (
    text: string,
    itemContext?: { type: 'item' | 'proposal'; id: string; expectedVersion: number },
    mode: 'normal' | 'temporary' = 'normal'
  ) =>
    service.startChat(
      {
        protocolVersion: 1,
        assistantId,
        requestId: randomUUID(),
        text,
        mode,
        context: { kind: 'none' },
        tools: 'items',
        stream: false,
        itemContext
      },
      () => {}
    )
  const query = (view = 'items') => service.items.query({ protocolVersion: 1, assistantId, view })
  return { service, assistantId, chat, query }
}
const answer = (): TransportResult => ({
  status: 'completed',
  text: '已核查可信回执',
  finishReason: 'stop',
  usage: null
})
it('independent: selected transition remains readable to a later selected chat', async () => {
  const f = setup(async () => answer())
  expect(await f.chat('新建任务：独立持续对象')).toMatchObject({ ok: true })
  const q = f.query()
  if (!q.ok) throw Error('fixture query')
  const id = q.data.items[0]!.id
  expect(await f.chat('把这个标为完成', { type: 'item', id, expectedVersion: 1 })).toMatchObject({ ok: true })
  expect(f.query()).toMatchObject({ ok: true, data: { items: [{ id, version: 2 }] } })
  expect(await f.chat('查看当前事项', { type: 'item', id, expectedVersion: 2 })).toMatchObject({ ok: true })
})