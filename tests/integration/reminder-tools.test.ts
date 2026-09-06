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
import type { ReminderPreview } from '../../src/shared/reminder-contract.js'

const cleanup: (() => void)[] = []
afterEach(() => {
  for (const fn of cleanup.splice(0).reverse()) fn()
})
function fixture(withClockFirst = false, clockDate = '2030-01-01T00:00:00Z') {
  const root = mkdtempSync(join(tmpdir(), 'mashiro-reminder-tools-'))
  cleanup.push(() => rmSync(root, { recursive: true, force: true }))
  const path = join(root, 'state.sqlite')
  const assistants = AssistantService.open(path)
  const made = assistants.create({
    protocolVersion: 1,
    displayName: '合成提醒',
    expectedStateRevision: 0
  })
  if (!made.ok) throw Error('fixture')
  const assistantId = made.data.assistants[0]!.id
  assistants.close()
  const requests: TransportRequest[] = []
  let action: 'set' | 'cancel' = 'set'
  let dueAt = '2030-01-02T09:00:00+08:00'
  const transport = async (request: TransportRequest): Promise<TransportResult> => {
    requests.push(request)
    if (withClockFirst && !request.messages.some((message) => message.role === 'tool'))
      return {
        status: 'completed',
        text: '',
        usage: null,
        finishReason: 'tool_calls',
        toolCalls: [
          {
            id: 'clock',
            type: 'function',
            function: { name: 'get_current_time', arguments: '{}' }
          }
        ]
      }
    if (
      !request.messages.some((message) =>
        message.tool_calls?.some((call) => call.function.name === 'prepare_reminder')
      )
    )
      return {
        status: 'completed',
        text: '',
        usage: null,
        finishReason: 'tool_calls',
        toolCalls: [
          {
            id: 'candidate',
            type: 'function',
            function: {
              name: 'prepare_reminder',
              arguments: JSON.stringify({
                action,
                dueAt: action === 'set' ? dueAt : null,
                timeZone: action === 'set' ? 'Asia/Shanghai' : null
              })
            }
          }
        ]
      }
    return {
      status: 'completed',
      text: '已准备提醒，请在本机确认。',
      usage: null,
      finishReason: 'stop'
    }
  }
  const service = ProviderService.open(
    path,
    join(root, 'credentials'),
    {
      isEncryptionAvailable: () => true,
      encryptString: (text) => Buffer.from(text),
      decryptString: (bytes) => bytes.toString()
    },
    transport,
    { clock: () => new Date(clockDate) }
  )
  cleanup.push(() => service.close())
  const connection = service.saveConnection({
    protocolVersion: 1,
    displayName: '合成端点',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    enabled: true
  })
  if (!connection.ok) throw Error('fixture')
  const connectionId = connection.data.connections[0]!.id
  service.setCredential({
    protocolVersion: 1,
    connectionId,
    apiKey: 'synthetic-only',
    persistence: 'temporary'
  })
  service.bindAssistant({
    protocolVersion: 1,
    assistantId,
    connectionId,
    model: 'GLM-5.3-FLASH',
    expectedVersion: null
  })
  const base = { protocolVersion: 1 as const, assistantId }
  const grant = (write = true) => {
    const permissions = service.items.permissions(base)
    if (!permissions.ok) throw Error('fixture')
    return service.items.setPermissions({
      ...base,
      expectedVersion: permissions.data.version,
      read: true,
      write,
      receive: true,
      propose: true
    })
  }
  grant()
  const history = service.permissions(base)
  if (!history.ok) throw Error('history')
  service.setPermissions({
    ...base,
    connectionId: history.data.connectionId,
    endpointFingerprint: history.data.endpointFingerprint,
    expectedVersion: history.data.version,
    readHistory: true,
    sendHistory: true
  })
  const item = service.items.mutate({
    ...base,
    commandId: randomUUID(),
    mutation: {
      action: 'create',
      content: {
        kind: 'task',
        title: '合成报告',
        description: '',
        status: 'open',
        dueAt: null,
        timeZone: null,
        parentId: null,
        relatedIds: [],
        counterpart: ''
      }
    }
  })
  if (!item.ok) throw Error('fixture')
  const request = (extra: Record<string, unknown> = {}) => ({
    ...base,
    requestId: randomUUID(),
    text: '明天上午九点提醒我处理这个事项，时区Asia/Shanghai',
    mode: 'normal',
    stream: false,
    context: { kind: 'none' },
    tools: 'items',
    itemContext: { type: 'item', id: item.data.objectId, expectedVersion: 1 },
    ...extra
  })
  const preview = (requestId: string): ReminderPreview => {
    const result = service.tools({ ...base, mode: 'normal', requestId })
    if (!result.ok) throw Error('tools')
    const value = result.data.operations.find(
      (operation) => operation.reminderPreview
    )?.reminderPreview
    if (!value) throw Error('missing reminder preview: ' + JSON.stringify(result.data))
    return value
  }
  return {
    service,
    base,
    request,
    requests,
    preview,
    grant,
    connectionId,
    action: (value: 'set' | 'cancel') => {
      action = value
    },
    due: (value: string) => {
      dueAt = value
    }
  }
}
it('natural Chinese creates a real tool preview and local consent commits once, then reschedules and cancels the same ID', async () => {
  const f = fixture()
  const request = f.request()
  expect(await f.service.startChat(request, () => undefined)).toMatchObject({
    ok: true,
    data: { status: 'completed' }
  })
  expect(f.requests).toHaveLength(2)
  const preview = f.preview(request.requestId)
  expect(preview.state).toBe('PENDING')
  expect(f.service.reminders.query(f.base)).toMatchObject({ ok: true, data: { records: [] } })
  const consent = { ...f.base, confirmationId: preview.confirmationId, accept: true }
  const receipt = f.service.reminders.confirm(consent)
  expect(receipt).toMatchObject({ ok: true, data: { state: 'SUCCEEDED', reminderVersion: 1 } })
  expect(f.service.reminders.confirm(consent)).toEqual(receipt)
  if (!receipt.ok) throw Error('receipt')
  expect(f.preview(request.requestId)).toMatchObject({ state: 'ACCEPTED', receipt: receipt.data })
  f.due('2030-01-03T09:00:00+08:00')
  const adjust = f.request({ text: '请将这个事项的提醒改到后天上午九点，时区Asia/Shanghai' })
  expect(await f.service.startChat(adjust, () => undefined)).toMatchObject({ ok: true })
  const adjusted = f.preview(adjust.requestId)
  expect(adjusted.mutation).toMatchObject({ action: 'reschedule', id: receipt.data.reminderId })
  expect(
    f.service.reminders.confirm({
      ...f.base,
      confirmationId: adjusted.confirmationId,
      accept: true
    })
  ).toMatchObject({ ok: true, data: { reminderId: receipt.data.reminderId, reminderVersion: 2 } })
  f.action('cancel')
  const cancel = f.request({ text: '取消这个事项的提醒' })
  expect(await f.service.startChat(cancel, () => undefined)).toMatchObject({ ok: true })
  expect(
    f.service.reminders.confirm({
      ...f.base,
      confirmationId: f.preview(cancel.requestId).confirmationId,
      accept: true
    })
  ).toMatchObject({ ok: true, data: { reminderId: receipt.data.reminderId, reminderVersion: 3 } })
  expect(f.service.reminders.query(f.base)).toMatchObject({
    ok: true,
    data: { records: [{ state: 'CANCELLED' }] }
  })
})
it('handles the actual clock-first live wording with an unrelated negative clause and a trusted local calendar date', async () => {
  const f = fixture(true, '2030-01-01T20:00:00Z')
  f.due('2030-01-03T09:00:00+08:00')
  const request = f.request({
    text: '我使用Asia/Shanghai时区，请明天上午九点提醒我处理当前选中的事项。请准备提醒供本机确认，不要改事项期限。'
  })
  expect(await f.service.startChat(request, () => undefined)).toMatchObject({
    ok: true,
    data: { status: 'completed' }
  })
  expect(f.requests).toHaveLength(3)
  expect(
    f.requests[0]!.messages.some(
      (message) =>
        message.role === 'system' &&
        message.content.includes('2030-01-02') &&
        message.content.includes('当前当地时间')
    )
  ).toBe(true)
  expect(f.preview(request.requestId)).toMatchObject({
    state: 'PENDING',
    mutation: { dueAt: '2030-01-03T09:00:00+08:00' }
  })
  expect(f.service.reminders.query(f.base)).toMatchObject({ ok: true, data: { records: [] } })
})
it('an explicit negative reminder clause has a known not-applied receipt and no candidate', async () => {
  const f = fixture()
  const request = f.request({ text: '不要提醒我处理当前事项。' })
  await f.service.startChat(request, () => undefined)
  expect(
    f.service.tools({ ...f.base, mode: 'normal', requestId: request.requestId })
  ).toMatchObject({
    ok: true,
    data: { operations: [{ toolName: 'prepare_reminder', state: 'CONFIRMED_NOT_APPLIED' }] }
  })
  expect(f.service.reminders.query(f.base)).toMatchObject({ ok: true, data: { records: [] } })
})
it('rejecting a candidate leaves zero schedules and a repeated late acceptance cannot revive it', async () => {
  const f = fixture()
  const request = f.request()
  await f.service.startChat(request, () => undefined)
  const preview = f.preview(request.requestId)
  const rejected = f.service.reminders.confirm({
    ...f.base,
    confirmationId: preview.confirmationId,
    accept: false
  })
  expect(rejected).toMatchObject({ ok: true, data: { state: 'CONFIRMED_NOT_APPLIED' } })
  expect(
    f.service.reminders.confirm({ ...f.base, confirmationId: preview.confirmationId, accept: true })
  ).toEqual(rejected)
  expect(f.service.reminders.query(f.base)).toMatchObject({ ok: true, data: { records: [] } })
})
it('current write revocation blocks candidate acceptance, but key deletion does not cancel a saved local plan', async () => {
  const f = fixture()
  const request = f.request()
  await f.service.startChat(request, () => undefined)
  const preview = f.preview(request.requestId)
  f.grant(false)
  expect(
    f.service.reminders.confirm({ ...f.base, confirmationId: preview.confirmationId, accept: true })
      .ok
  ).toBe(false)
  f.grant()
  expect(
    f.service.reminders.confirm({ ...f.base, confirmationId: preview.confirmationId, accept: true })
      .ok
  ).toBe(true)
  f.service.deleteCredential({ protocolVersion: 1, connectionId: f.connectionId })
  expect(f.service.reminders.query(f.base)).toMatchObject({
    ok: true,
    data: { records: [{ state: 'SCHEDULED' }] }
  })
})
it('model reminder fields cannot authorize absent user intent, strict temporary, or tools off', async () => {
  for (const extra of [{ text: '这个事项有什么建议' }, { mode: 'temporary' }, { tools: 'off' }]) {
    const f = fixture()
    await f.service.startChat(f.request(extra), () => undefined)
    expect(f.service.reminders.query(f.base)).toMatchObject({ ok: true, data: { records: [] } })
    expect(f.service.tools({ ...f.base, mode: 'normal' })).not.toMatchObject({
      ok: true,
      data: { operations: [{ reminderPreview: { state: 'PENDING' } }] }
    })
  }
})
