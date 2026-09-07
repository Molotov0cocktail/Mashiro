import { z } from 'zod'
import { reminderPreviewSchema, reminderReceiptSchema } from './reminder-contract.js'
import { itemReceiptSchema } from './item-contract.js'
import { memoryReceiptSchema } from './memory-contract.js'
import { retentionPreviewSchema, retentionPreviewInputSchema } from './retention-contract.js'

export const toolScopeSchema = z.enum([
  'off',
  'clock',
  'clock-and-history',
  'clock-and-memory',
  'clock-history-and-memory',
  'items',
  'items-memory'
])
export type ToolScope = z.infer<typeof toolScopeSchema>
export const toolNameSchema = z.enum([
  'get_current_time',
  'search_conversation_history',
  'search_memory',
  'write_memory',
  'correct_memory',
  'request_memory_removal',
  'request_retention_cleanup',
  'search_items',
  'apply_item_intent',
  'propose_item',
  'revise_item_proposal',
  'prepare_item_update',
  'prepare_reminder'
])
export const operationStateSchema = z.enum([
  'PREPARED',
  'DISPATCHING',
  'SUCCEEDED',
  'CONFIRMED_NOT_APPLIED',
  'RESULT_UNKNOWN',
  'CANCELLED_BEFORE_DISPATCH',
  'BLOCKED_BY_CURRENT_STATE'
])
export const historyCitationSchema = z.strictObject({
  requestId: z.string().uuid(),
  createdAt: z.iso.datetime({ offset: true }),
  excerpt: z.string().max(1000),
  truncated: z.boolean()
})
export const toolOperationSchema = z.strictObject({
  operationId: z.string().uuid(),
  segmentId: z.string().uuid(),
  modelRequestId: z.string().uuid(),
  requestId: z.string().uuid(),
  assistantId: z.string().uuid(),
  toolName: toolNameSchema,
  origin: z.literal('local-user-intent').optional(),
  state: operationStateSchema,
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
  summary: z.string().max(200),
  citations: z.array(historyCitationSchema).max(10),
  memoryReceipt: memoryReceiptSchema.optional(),
  itemReceipt: itemReceiptSchema.optional(),
  reminderPreview: reminderPreviewSchema.optional(),
  reminderReceipt: reminderReceiptSchema.optional(),
  retentionPreview: retentionPreviewSchema.optional(),
  retentionIntent: retentionPreviewInputSchema.optional()
})
export type ToolOperation = z.infer<typeof toolOperationSchema>
export type HistoryCitation = z.infer<typeof historyCitationSchema>
export const toolReadInputSchema = z.strictObject({
  protocolVersion: z.literal(1),
  assistantId: z.string().uuid(),
  mode: z.enum(['normal', 'temporary']),
  requestId: z.string().uuid().optional()
})
export type ToolReadInput = z.infer<typeof toolReadInputSchema>
export const capabilityInputSchema = z.strictObject({
  protocolVersion: z.literal(1),
  assistantId: z.string().uuid()
})
export const capabilitySchema = z.strictObject({
  assistantId: z.string().uuid(),
  endpointFingerprint: z.string().nullable(),
  endpointDisplay: z.string().max(2048).nullable(),
  model: z.string().max(160).nullable(),
  protocol: z.literal('chat-completions-v1'),
  adapterVersion: z.string().max(80),
  mode: z.enum(['standard-non-preserved', 'retained-thinking']),
  toolsAvailable: z.boolean(),
  reason: z.string().max(200),
  evidence: z
    .array(
      z.strictObject({
        capability: z.enum([
          'text',
          'stream',
          'tools',
          'preserved-thinking',
          'json-object',
          'local-strict',
          'vendor-strict',
          'parallel',
          'usage'
        ]),
        level: z.enum(['UNVERIFIED', 'DOCUMENTED', 'LOCAL_TESTED', 'LIVE_VERIFIED', 'FAILED']),
        observedAt: z.iso.datetime({ offset: true }).nullable(),
        detail: z.string().max(200)
      })
    )
    .max(9)
})
export type ProviderCapabilities = z.infer<typeof capabilitySchema>
