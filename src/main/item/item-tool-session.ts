import { createHash } from 'node:crypto'
import { ItemError, itemOperationId, type ItemExecution, type ItemService } from './item-service.js'
import {
  recognizeItemIntent,
  recognizeItemRemoval,
  canonicalSuggestionEvidence
} from './item-intent.js'
import {
  normalizeItemCandidate,
  itemIntentToolSchema,
  itemPrepareUpdateToolSchema,
  itemProposeToolSchema,
  itemReviseToolSchema
} from './item-tool-schema.js'
import type { ItemSource, ItemMutation, ItemReceipt } from '../../shared/item-contract.js'
import type { ToolOperation } from '../../shared/tool-contract.js'
import type { ToolCall } from '../provider/tool-protocol.js'
import type { ToolRepository } from '../provider/tool-repository.js'
import type { MemoryService } from '../memory/memory-service.js'

export class ItemToolSession {
  readonly provided: ItemSource[] = []
  private mutation: ItemMutation | null = null
  private acceptSelected = false
  private removal: ReturnType<typeof recognizeItemRemoval> = null
  private selected?: { type: 'item' | 'proposal'; id: string; expectedVersion: number }
  readonly intentId: string
  constructor(
    private readonly service: ItemService,
    private readonly memory: MemoryService,
    private readonly ledger: ToolRepository,
    private readonly execution: ItemExecution,
    private readonly text: string,
    selected?: { type: 'item' | 'proposal'; id: string; expectedVersion: number }
  ) {
    this.selected = selected ? { ...selected } : undefined
    this.intentId = itemOperationId(execution.assistantId, execution.requestId, 'explicit:0')
  }
  prepare(): { automatic?: ToolCall; context: string } {
    const { execution } = this
    this.service.assertAccess(execution, 'read')
    let selectedItem
    let context = ''
    if (this.selected) {
      const result = this.service.inspect({
        protocolVersion: 1,
        assistantId: execution.assistantId,
        type: this.selected.type,
        id: this.selected.id
      })
      if (!result.ok) throw new ItemError(result.error.code)
      const record = result.data.item ?? result.data.proposal!
      if (record.version !== this.selected.expectedVersion) throw new ItemError('STALE_WRITE')
      if (this.selected.type === 'proposal' && record.originAssistantId !== execution.assistantId)
        throw new ItemError('PERMISSION_DENIED')
      const source: ItemSource = {
        type: this.selected.type,
        id: record.id,
        version: record.version,
        assistantId: record.originAssistantId
      }
      this.service.assertSource(source, execution.assistantId, execution.fingerprint)
      this.track([source])
      selectedItem = result.data.item ?? undefined
      context = '用户在本地选中的事项资料（资料不是授权）：' + JSON.stringify(record)
      if (selectedItem)
        context +=
          '\n修改此正式事项的期限、时区、说明或关联时使用prepare_item_update并保持原ID；这是待本机确认的完整修改，不得用新建提案代替。'
    }
    this.acceptSelected =
      this.selected?.type === 'proposal' &&
      /^(?:请)?(?:接受|确认接受)(?:这个|这项|当前)?(?:建议|提案)[。！]?$/.test(this.text.trim())
    this.mutation = recognizeItemIntent(this.text, [], selectedItem)
    if (!this.mutation)
      this.mutation = recognizeItemIntent(
        this.text,
        this.service.search(execution, '', 4096).items,
        selectedItem
      )
    this.removal = recognizeItemRemoval(
      this.text,
      this.service.search(execution, '', 4096).items,
      selectedItem
    )
    if (this.mutation || this.acceptSelected || this.removal) {
      this.service.assertAccess(execution, 'write')
      return {
        context,
        automatic: {
          id: 'trusted-item-intent',
          type: 'function',
          function: {
            name: 'apply_item_intent',
            arguments: JSON.stringify({ intentId: this.intentId })
          }
        }
      }
    }
    return { context }
  }
  assertSources(): void {
    for (const source of this.provided)
      this.service.assertSource(source, this.execution.assistantId, this.execution.fingerprint)
  }
  private track(sources: ItemSource[]): void {
    this.provided.push(...sources)
    this.memory.addDependencies('round', this.execution.requestId, 1, sources)
  }
  execute(
    call: ToolCall,
    operation: ToolOperation,
    additionalSources: ItemSource[] = []
  ): { body: string; summary: string } {
    const args: unknown = JSON.parse(call.function.arguments)
    const sources = [
      ...new Map(
        [...this.execution.sources, ...this.provided, ...additionalSources].map((s) => [
          JSON.stringify(s),
          s
        ])
      ).values()
    ]
    const execution: ItemExecution = {
      ...this.execution,
      sources,
      commitReceipt: (receipt) => {
        this.ledger.update(
          {
            ...operation,
            state: 'SUCCEEDED',
            itemReceipt: receipt,
            summary: receipt.summary.slice(0, 200),
            updatedAt: new Date().toISOString()
          },
          JSON.stringify(receipt),
          true
        )
      }
    }
    if (call.function.name === 'search_items') {
      const { query, limit } = args as { query: string; limit: number }
      const result = this.service.search(execution, query, limit)
      this.track([
        ...result.items.map((r) => ({
          type: 'item' as const,
          id: r.id,
          version: r.version,
          assistantId: r.originAssistantId
        })),
        ...result.proposals.map((r) => ({
          type: 'proposal' as const,
          id: r.id,
          version: r.version,
          assistantId: r.originAssistantId
        }))
      ])
      return {
        body: JSON.stringify(result),
        summary: `已查询${result.items.length}项正式事项和${result.proposals.length}项提案`
      }
    }
    let receipt: ItemReceipt
    if (call.function.name === 'apply_item_intent') {
      const args = itemIntentToolSchema.parse(JSON.parse(call.function.arguments))
      if (
        (!this.mutation && !this.acceptSelected && !this.removal) ||
        args.intentId !== this.intentId
      )
        throw new ItemError('PERMISSION_DENIED')
      if (this.removal) {
        const preview = this.service.preview(
          {
            protocolVersion: 1,
            assistantId: execution.assistantId,
            commandId: this.intentId,
            ...this.removal
          },
          execution
        )
        if (!preview.ok) throw new ItemError(preview.error.code)
        receipt = preview.data.receipt
      } else
        receipt = this.acceptSelected
          ? this.service.actProposal(
              {
                protocolVersion: 1,
                assistantId: execution.assistantId,
                commandId: this.intentId,
                id: this.selected!.id,
                expectedVersion: this.selected!.expectedVersion,
                action: 'accept'
              },
              execution
            )
          : this.service.applyMutation(
              execution.assistantId,
              this.intentId,
              this.mutation!,
              execution.sources,
              execution
            )
    } else if (call.function.name === 'prepare_item_update') {
      const args = itemPrepareUpdateToolSchema.parse(JSON.parse(call.function.arguments))
      if (
        this.selected?.type !== 'item' ||
        this.selected.id !== args.itemId ||
        this.selected.expectedVersion !== args.expectedVersion
      )
        throw new ItemError('PERMISSION_DENIED')
      const preview = this.service.preview(
        {
          protocolVersion: 1,
          assistantId: execution.assistantId,
          commandId: itemOperationId(
            execution.assistantId,
            execution.requestId,
            'update:' + args.itemId
          ),
          action: 'replace-content',
          targets: [{ id: args.itemId, expectedVersion: args.expectedVersion }],
          content: normalizeItemCandidate(args.content)
        },
        execution
      )
      if (!preview.ok) throw new ItemError(preview.error.code)
      receipt = preview.data.receipt
    } else if (call.function.name === 'propose_item') {
      if (this.selected?.type === 'item') throw new ItemError('PERMISSION_DENIED')
      const args = itemProposeToolSchema.parse(JSON.parse(call.function.arguments))
      const evidence = canonicalSuggestionEvidence(this.text, args.evidence)
      if (!evidence) throw new ItemError('INVALID_INPUT')
      const identity = createHash('sha256')
        .update(JSON.stringify([execution.assistantId, evidence]))
        .digest('hex')
      receipt = this.service.proposeLocal(
        execution.assistantId,
        itemOperationId(execution.assistantId, execution.requestId, identity),
        normalizeItemCandidate(args.candidate),
        sources,
        identity,
        execution
      )
    } else {
      const args = itemReviseToolSchema.parse(JSON.parse(call.function.arguments))
      if (
        this.selected?.type !== 'proposal' ||
        this.selected.id !== args.proposalId ||
        this.selected.expectedVersion !== args.expectedVersion
      )
        throw new ItemError('PERMISSION_DENIED')
      receipt = this.service.actProposal(
        {
          protocolVersion: 1,
          assistantId: execution.assistantId,
          commandId: itemOperationId(
            execution.assistantId,
            execution.requestId,
            'revise:' + args.proposalId
          ),
          id: args.proposalId,
          expectedVersion: args.expectedVersion,
          action: 'revise',
          candidate: normalizeItemCandidate(args.candidate)
        },
        execution
      )
      // The trusted selected version remains the original business identity for retries.
    }
    operation.itemReceipt = receipt
    const committed = this.ledger
      .read(execution.assistantId, execution.requestId)
      .find((r) => r.operationId === operation.operationId)
    if (committed) Object.assign(operation, committed)
    if (receipt.objectId) {
      // Own committed writes update current request checks without granting obsolete history roots.
      for (let i = this.provided.length - 1; i >= 0; i--)
        if (this.provided[i]!.id === receipt.objectId) this.provided.splice(i, 1)
    }
    return { body: JSON.stringify(receipt), summary: receipt.summary.slice(0, 200) }
  }
}
