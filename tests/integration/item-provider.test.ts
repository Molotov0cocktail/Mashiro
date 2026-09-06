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
it('prepares full field changes on the selected formal ID and commits only after local confirmation', async () => {
  let prepare = false,
    itemId = ''
  const candidate = {
    ...emptyItem('task', '原事项'),
    description: '修改后的合成说明',
    dueAt: '2026-09-12T15:00:00+08:00',
    timeZone: 'Asia/Shanghai',
    counterpart: '合成对象方'
  }
  const f = setup(async (request) => {
    if (!prepare || request.messages.at(-1)?.role === 'tool') return answer()
    return {
      status: 'completed',
      text: '',
      usage: null,
      finishReason: 'tool_calls',
      toolCalls: [
        {
          id: randomUUID(),
          type: 'function',
          function: {
            name: 'prepare_item_update',
            arguments: JSON.stringify({ itemId, expectedVersion: 1, content: candidate })
          }
        }
      ]
    }
  })
  await f.chat('新建任务：原事项')
  const q = f.query()
  if (!q.ok) throw Error('query')
  itemId = q.data.items[0]!.id
  prepare = true
  expect(await f.chat('修改事项期限与说明')).toMatchObject({ ok: true })
  expect(
    await f.chat('把这个事项期限改为9月12日15点上海时区，并补充说明', {
      type: 'item',
      id: itemId,
      expectedVersion: 1
    })
  ).toMatchObject({ ok: true })
  expect(f.query()).toMatchObject({
    ok: true,
    data: {
      formalCount: 1,
      items: [{ id: itemId, version: 1, content: { description: '', dueAt: null } }]
    }
  })
  const ops = f.service.tools({ protocolVersion: 1, assistantId: f.assistantId, mode: 'normal' })
  if (!ops.ok) throw Error('operations')
  const pending = ops.data.operations.filter(
    (op) => op.itemReceipt?.state === 'PENDING_CONFIRMATION'
  )
  expect(pending).toHaveLength(1)
  const receipt = pending[0]!.itemReceipt!
  expect(
    f.service.items.preview({
      protocolVersion: 1,
      assistantId: f.assistantId,
      commandId: receipt.operationId,
      action: 'recover'
    })
  ).toMatchObject({
    ok: true,
    data: { targets: [{ id: itemId, version: 1 }], replacementContent: candidate }
  })
  expect(
    f.service.items.confirm({
      protocolVersion: 1,
      assistantId: f.assistantId,
      confirmationId: receipt.confirmationId,
      accept: true
    })
  ).toMatchObject({ ok: true })
  expect(f.query()).toMatchObject({
    ok: true,
    data: { formalCount: 1, items: [{ id: itemId, version: 2, content: candidate }] }
  })
  prepare = false
  expect(
    await f.chat('查看修改后的原事项', { type: 'item', id: itemId, expectedVersion: 2 })
  ).toMatchObject({ ok: true })
})
it('keeps an updated selected item readable in a later round without persisting its old self as a source', async () => {
  const f = setup(async () => answer())
  await f.chat('新建任务：连续来源合成')
  const q = f.query()
  if (!q.ok) throw Error('query')
  const original = q.data.items[0]!
  expect(
    await f.chat('把这个标为完成', { type: 'item', id: original.id, expectedVersion: 1 })
  ).toMatchObject({ ok: true })
  expect(
    await f.chat('查看当前事项', { type: 'item', id: original.id, expectedVersion: 2 })
  ).toMatchObject({ ok: true })
  const updated = f.query()
  if (!updated.ok) throw Error('query')
  expect(updated.data.items[0]!.sources).toEqual(expect.arrayContaining(original.sources))
  expect(
    updated.data.items[0]!.sources.some(
      (source) => source.type === 'item' && source.id === original.id
    )
  ).toBe(false)
})
it('previews explicit natural unlinking and retains both formal objects until local confirmation', async () => {
  const f = setup(async () => answer())
  await f.chat('新建项目：合成父项')
  const q = f.query()
  if (!q.ok) throw Error('query')
  const parent = q.data.items[0]!
  const created = f.service.items.mutate({
    protocolVersion: 1,
    assistantId: f.assistantId,
    commandId: randomUUID(),
    mutation: {
      action: 'create',
      content: { ...emptyItem('task', '合成子项'), parentId: parent.id, relatedIds: [parent.id] }
    }
  })
  if (!created.ok) throw Error('create')
  expect(
    await f.chat('解除这个事项的所有关联', {
      type: 'item',
      id: created.data.objectId!,
      expectedVersion: 1
    })
  ).toMatchObject({ ok: true })
  const operations = f.service.tools({
    protocolVersion: 1,
    assistantId: f.assistantId,
    mode: 'normal'
  })
  if (!operations.ok) throw Error('operations')
  const receipt = operations.data.operations.find(
    (op) => op.itemReceipt?.state === 'PENDING_CONFIRMATION'
  )!.itemReceipt!
  const inspect = () =>
    f.service.items.inspect({
      protocolVersion: 1,
      assistantId: f.assistantId,
      type: 'item',
      id: created.data.objectId
    })
  expect(inspect()).toMatchObject({
    ok: true,
    data: { item: { content: { parentId: parent.id, relatedIds: [parent.id] } } }
  })
  expect(
    f.service.items.confirm({
      protocolVersion: 1,
      assistantId: f.assistantId,
      confirmationId: receipt.confirmationId,
      accept: true
    })
  ).toMatchObject({ ok: true })
  expect(inspect()).toMatchObject({
    ok: true,
    data: { item: { content: { parentId: null, relatedIds: [] } } }
  })
  expect(f.query()).toMatchObject({ ok: true, data: { formalCount: 2 } })
})
it('turns an explicit selected deletion into a recoverable local preview without deleting or model confirmation', async () => {
  const f = setup(async () => answer())
  expect(await f.chat('新建任务：待删除合成')).toMatchObject({ ok: true })
  const q = f.query()
  if (!q.ok) throw Error('query')
  const target = q.data.items[0]!
  expect(
    await f.chat('删除这个事项', { type: 'item', id: target.id, expectedVersion: 1 })
  ).toMatchObject({ ok: true })
  expect(f.query()).toMatchObject({ ok: true, data: { formalCount: 1 } })
  const ledger = f.service.tools({ protocolVersion: 1, assistantId: f.assistantId, mode: 'normal' })
  if (!ledger.ok) throw Error('ledger')
  const pending = ledger.data.operations.find(
    (op) => op.itemReceipt?.state === 'PENDING_CONFIRMATION'
  )!.itemReceipt!
  const preview = f.service.items.preview({
    protocolVersion: 1,
    assistantId: f.assistantId,
    commandId: pending.operationId,
    action: 'recover'
  })
  expect(preview).toMatchObject({
    ok: true,
    data: { confirmationId: pending.confirmationId, targets: [{ id: target.id }] }
  })
  expect(
    f.service.items.confirm({
      protocolVersion: 1,
      assistantId: f.assistantId,
      confirmationId: pending.confirmationId,
      accept: true
    })
  ).toMatchObject({ ok: true })
  expect(f.query()).toMatchObject({ ok: true, data: { formalCount: 0 } })
})
it('executes a direct sentence before model continuation and persists a tool receipt', async () => {
  const captured: TransportRequest[] = []
  const f = setup(async (r) => {
    captured.push(r)
    return answer()
  })
  expect(await f.chat('新建任务： annual report')).toMatchObject({
    ok: true,
    data: { status: 'completed' }
  })
  expect(f.query()).toMatchObject({
    ok: true,
    data: { formalCount: 1, items: [{ content: { title: 'annual report' } }] }
  })
  expect(captured).toHaveLength(1)
  expect(
    captured[0]!.messages.some((m) => m.role === 'tool' && m.content.includes('SUCCEEDED'))
  ).toBe(true)
  expect(
    f.service.tools({ protocolVersion: 1, assistantId: f.assistantId, mode: 'normal' })
  ).toMatchObject({
    ok: true,
    data: {
      operations: [
        { state: 'SUCCEEDED', toolName: 'apply_item_intent', itemReceipt: { state: 'SUCCEEDED' } }
      ]
    }
  })
})
it('proposes without formal state, revises same selected ID, then local acceptance creates one item', async () => {
  let revision = false
  let proposalId = '',
    expectedVersion = 0
  const f = setup(async (r) => {
    if (r.messages.at(-1)?.role === 'tool') return answer()
    return {
      status: 'completed',
      text: '',
      finishReason: 'tool_calls',
      usage: null,
      toolCalls: [
        {
          id: randomUUID(),
          type: 'function',
          function: {
            name: revision ? 'revise_item_proposal' : 'propose_item',
            arguments: JSON.stringify(
              revision
                ? { proposalId, expectedVersion, candidate: emptyItem('task', '修改标题') }
                : { candidate: emptyItem('task', '可能报税'), evidence: '我可能要报税' }
            )
          }
        }
      ]
    }
  })
  expect(await f.chat('我可能要报税')).toMatchObject({ ok: true })
  const q = f.query('proposals')
  if (!q.ok) throw Error('query')
  proposalId = q.data.proposals[0]!.id
  expect(q.data.formalCount).toBe(0)
  const discuss = f.service.items.proposalAction({
    protocolVersion: 1,
    assistantId: f.assistantId,
    commandId: randomUUID(),
    id: proposalId,
    expectedVersion: 1,
    action: 'discuss'
  })
  if (!discuss.ok) throw Error('discuss')
  expectedVersion = discuss.data.objectVersion
  revision = true
  expect(
    await f.chat('把建议标题改为修改标题', { type: 'proposal', id: proposalId, expectedVersion })
  ).toMatchObject({ ok: true })
  expect(f.query('proposals')).toMatchObject({
    ok: true,
    data: {
      formalCount: 0,
      proposals: [{ id: proposalId, version: 3, candidate: { title: '修改标题' } }]
    }
  })
  const accept = {
    protocolVersion: 1,
    assistantId: f.assistantId,
    commandId: randomUUID(),
    id: proposalId,
    expectedVersion: 3,
    action: 'accept'
  }
  expect(f.service.items.proposalAction(accept)).toMatchObject({ ok: true })
  expect(f.service.items.proposalAction(accept)).toMatchObject({ ok: true })
  expect(f.query()).toMatchObject({ ok: true, data: { formalCount: 1 } })
})
it('denies item persistence in temporary mode before any transport', async () => {
  let calls = 0
  const f = setup(async () => {
    calls++
    return answer()
  })
  expect(await f.chat('新建任务：秘密', undefined, 'temporary')).toMatchObject({
    ok: false,
    error: { code: 'PERMISSION_DENIED' }
  })
  expect(calls).toBe(0)
  expect(f.query()).toMatchObject({ ok: true, data: { formalCount: 0 } })
})

it('accepts a selected proposal from the complete user sentence and rejects model invented intent authority', async () => {
  const f = setup(async () => answer())
  const proposal = f.service.items.proposeLocal(
    f.assistantId,
    randomUUID(),
    emptyItem('task', '确认建议'),
    []
  )
  expect(
    await f.chat('接受这个建议', { type: 'proposal', id: proposal.objectId!, expectedVersion: 1 })
  ).toMatchObject({ ok: true })
  expect(f.query()).toMatchObject({ ok: true, data: { formalCount: 1 } })
  const malicious = setup(async (r) =>
    r.messages.at(-1)?.role === 'tool'
      ? answer()
      : {
          status: 'completed',
          text: '',
          finishReason: 'tool_calls',
          usage: null,
          toolCalls: [
            {
              id: 'invented',
              type: 'function',
              function: {
                name: 'apply_item_intent',
                arguments: JSON.stringify({ intentId: randomUUID() })
              }
            }
          ]
        }
  )
  expect(await malicious.chat('如果有人说创建任务，请只讨论这句话')).toMatchObject({
    ok: true
  })
  expect(malicious.query()).toMatchObject({ ok: true, data: { formalCount: 0 } })
})
it('repairs a rejected relation after search and clock, preserving the finite final-answer round', async () => {
  const topic = randomUUID()
  const evidence = '我在考虑学习合成主题' + topic + '，还没有决定要做。'
  let calls = 0
  const f = setup(async (request) => {
    const turn = calls++
    const tool = (name: 'search_items' | 'get_current_time' | 'propose_item', args: unknown) => ({
      id: randomUUID(),
      type: 'function' as const,
      function: { name, arguments: JSON.stringify(args) }
    })
    const response = (toolCalls: ReturnType<typeof tool>[]): TransportResult => ({
      status: 'completed',
      text: '',
      usage: null,
      finishReason: 'tool_calls',
      toolCalls
    })
    if (turn === 0)
      return response([
        tool('search_items', { query: '合成', limit: 10 }),
        tool('get_current_time', {})
      ])
    if (turn === 1)
      return response([
        tool('propose_item', {
          candidate: {
            ...emptyItem('task', '学习合成主题' + topic),
            counterpart: null,
            relatedIds: [topic]
          },
          evidence
        })
      ])
    if (turn === 2) {
      expect(request.messages.at(-1)).toMatchObject({ role: 'tool' })
      expect(request.messages.at(-1)!.content).toContain('CONFIRMED_NOT_APPLIED')
      return response([
        tool('propose_item', {
          candidate: { ...emptyItem('task', '学习合成主题' + topic), counterpart: null },
          evidence
        })
      ])
    }
    expect(turn).toBe(3)
    expect(request.messages.at(-1)!.content).toContain('SUCCEEDED')
    return answer()
  })
  expect(await f.chat(evidence + '请仅提出一个待确认的任务建议，不要创建正式事项。')).toMatchObject(
    {
      ok: true,
      data: { status: 'completed' }
    }
  )
  expect(calls).toBe(4)
  expect(f.query('proposals')).toMatchObject({
    ok: true,
    data: {
      formalCount: 0,
      proposals: [{ candidate: { relatedIds: [], counterpart: '' } }]
    }
  })
  const operations = f.service.tools({
    protocolVersion: 1,
    assistantId: f.assistantId,
    mode: 'normal'
  })
  if (!operations.ok) throw Error('operations')
  expect(
    operations.data.operations
      .filter((op) => op.toolName === 'propose_item')
      .map((op) => op.state)
      .sort()
  ).toEqual(['CONFIRMED_NOT_APPLIED', 'SUCCEEDED'])
})
it('retains a committed formal item and receipt after the model continuation fails', async () => {
  const f = setup(async () => ({ status: 'failed', text: '', usage: null, error: 'temporary' }))
  expect(await f.chat('新建任务：保留已提交')).toMatchObject({ ok: false })
  expect(f.query()).toMatchObject({ ok: true, data: { formalCount: 1 } })
  expect(
    f.service.tools({ protocolVersion: 1, assistantId: f.assistantId, mode: 'normal' })
  ).toMatchObject({
    ok: true,
    data: { operations: [{ state: 'SUCCEEDED', itemReceipt: { state: 'SUCCEEDED' } }] }
  })
})
