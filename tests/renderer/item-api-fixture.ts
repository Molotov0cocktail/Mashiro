import { vi } from 'vitest'
import type {
  ItemApi,
  ItemContent,
  ItemPermissions,
  ItemProposal,
  ItemReceipt,
  ItemRecord
} from '../../src/shared/item-contract.js'

export const itemAssistantA = '00000000-0000-4000-8000-000000000001'
export const itemAssistantB = '00000000-0000-4000-8000-000000000002'
export const itemId = '00000000-0000-4000-8000-000000000101'
export const proposalId = '00000000-0000-4000-8000-000000000201'

export function itemContent(values: Partial<ItemContent> = {}): ItemContent {
  return {
    kind: 'task',
    title: '周五交报告',
    description: '整理最终版本并提交',
    status: 'open',
    dueAt: null,
    timeZone: null,
    parentId: null,
    relatedIds: [],
    counterpart: '',
    ...values
  }
}

export function itemRecord(values: Partial<ItemRecord> = {}): ItemRecord {
  return {
    id: itemId,
    version: 2,
    content: itemContent(),
    originAssistantId: itemAssistantA,
    originProposalId: null,
    createdAt: '2026-09-07T01:00:00.000Z',
    updatedAt: '2026-09-07T02:00:00.000Z',
    sources: [],
    sourceUnavailable: false,
    ...values
  }
}

export function itemProposal(values: Partial<ItemProposal> = {}): ItemProposal {
  return {
    id: proposalId,
    version: 3,
    candidate: itemContent({ title: '考虑预约牙医' }),
    originAssistantId: itemAssistantA,
    state: 'DRAFT_PROPOSAL',
    acceptedItemId: null,
    sources: [],
    sourceUnavailable: false,
    createdAt: '2026-09-07T03:00:00.000Z',
    updatedAt: '2026-09-07T03:00:00.000Z',
    ...values
  }
}

export function itemReceipt(values: Partial<ItemReceipt> = {}): ItemReceipt {
  return {
    operationId: '00000000-0000-4000-8000-000000000301',
    objectId: itemId,
    objectVersion: 3,
    objectType: 'item',
    state: 'SUCCEEDED',
    confirmationId: null,
    summary: '已更新任务',
    ...values
  }
}

export function itemPermissions(values: Partial<ItemPermissions> = {}): ItemPermissions {
  return {
    assistantId: itemAssistantA,
    version: 1,
    read: true,
    write: true,
    propose: true,
    receive: false,
    endpointDisplay: 'Receiver A · https://a.example/v1',
    endpointFingerprint: 'sha256:synthetic-a',
    ...values
  }
}

export function itemApi010Defaults(): ItemApi {
  return {
    query: vi.fn(async (input) => ({
      ok: true as const,
      data: {
        items: input.view === 'items' ? [itemRecord()] : [],
        proposals: input.view === 'proposals' ? [itemProposal()] : [],
        nextCursor: null,
        formalCount: 1
      }
    })),
    inspect: vi.fn(async (input) => ({
      ok: true as const,
      data: {
        item: input.type === 'item' ? itemRecord({ id: input.id }) : null,
        proposal: input.type === 'proposal' ? itemProposal({ id: input.id }) : null,
        receipts: []
      }
    })),
    mutate: vi.fn(async () => ({ ok: true as const, data: itemReceipt() })),
    proposalAction: vi.fn(async (input) => ({
      ok: true as const,
      data: itemReceipt({
        objectId: input.id,
        objectVersion: input.expectedVersion + 1,
        objectType: 'proposal',
        summary: '提案状态已更新'
      })
    })),
    operation: vi.fn(async () => ({ ok: true as const, data: itemReceipt() })),
    preview: vi.fn(async () => ({
      ok: true as const,
      data: {
        confirmationId: '00000000-0000-4000-8000-000000000401',
        receipt: itemReceipt({
          state: 'PENDING_CONFIRMATION',
          confirmationId: '00000000-0000-4000-8000-000000000401',
          summary: '将永久删除 1 个正式事项'
        }),
        targets: [itemRecord()],
        relatedItemIds: ['00000000-0000-4000-8000-000000000102']
      }
    })),
    confirm: vi.fn(async () => ({
      ok: true as const,
      data: itemReceipt({ summary: '已永久删除 1 个正式事项' })
    })),
    permissions: vi.fn(async (input) => ({
      ok: true as const,
      data: itemPermissions({ assistantId: input.assistantId })
    })),
    setPermissions: vi.fn(async (input) => ({
      ok: true as const,
      data: itemPermissions({
        assistantId: input.assistantId,
        version: input.expectedVersion + 1,
        read: input.read,
        write: input.write,
        propose: input.propose,
        receive: input.receive
      })
    }))
  }
}
