import { z } from 'zod'

const id = z.string().uuid()
const version = z.number().int().positive()
const envelope = { protocolVersion: z.literal(1), assistantId: id }
export const itemKindSchema = z.enum(['goal', 'project', 'task', 'commitment', 'waiting'])
export const itemStatusSchema = z.enum(['open', 'active', 'completed', 'cancelled'])
export const itemContentSchema = z
  .strictObject({
    kind: itemKindSchema,
    title: z.string().trim().min(1).max(160),
    description: z.string().max(8000),
    status: itemStatusSchema,
    dueAt: z.iso.datetime({ offset: true }).nullable(),
    timeZone: z.string().min(1).max(100).nullable(),
    parentId: id.nullable(),
    relatedIds: z.array(id).max(32),
    counterpart: z.string().max(160)
  })
  .superRefine((value, ctx) => {
    if ((value.dueAt === null) !== (value.timeZone === null))
      ctx.addIssue({ code: 'custom', message: '期限和时区必须同时提供' })
    if (value.timeZone !== null) {
      try {
        new Intl.DateTimeFormat('en', { timeZone: value.timeZone })
      } catch {
        ctx.addIssue({ code: 'custom', message: '无效时区' })
      }
    }
    if (new Set(value.relatedIds).size !== value.relatedIds.length)
      ctx.addIssue({ code: 'custom', message: '关联不能重复' })
  })
export const itemSourceSchema = z.strictObject({
  type: z.enum(['round', 'user-round', 'memory', 'manual', 'item', 'proposal']),
  id,
  assistantId: id,
  version: z.number().int().nonnegative()
})
export const itemRecordSchema = z.strictObject({
  id,
  version,
  content: itemContentSchema,
  originAssistantId: id,
  originProposalId: id.nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
  sources: z.array(itemSourceSchema).max(64),
  sourceUnavailable: z.boolean()
})
export const itemProposalSchema = z.strictObject({
  id,
  version,
  candidate: itemContentSchema,
  originAssistantId: id,
  state: z.enum(['DRAFT_PROPOSAL', 'DISCUSSING', 'DEFERRED', 'ACCEPTED', 'REJECTED', 'STALE']),
  acceptedItemId: id.nullable(),
  sources: z.array(itemSourceSchema).max(64),
  sourceUnavailable: z.boolean(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true })
})
export const itemMutationSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('create'), content: itemContentSchema }),
  z.strictObject({
    action: z.literal('update'),
    id,
    expectedVersion: version,
    content: itemContentSchema
  }),
  z.strictObject({
    action: z.literal('transition'),
    id,
    expectedVersion: version,
    status: itemStatusSchema
  })
])
export const itemQueryInputSchema = z.strictObject({
  ...envelope,
  query: z.string().max(200).default(''),
  kind: z.enum(['all', 'goal', 'project', 'task', 'commitment', 'waiting']).default('all'),
  status: z.enum(['all', 'open', 'active', 'completed', 'cancelled']).default('all'),
  view: z.enum(['items', 'proposals']).default('items'),
  cursor: z.number().int().nonnegative().default(0),
  limit: z.number().int().min(1).max(100).default(30)
})
export const itemInspectInputSchema = z.strictObject({
  ...envelope,
  id,
  type: z.enum(['item', 'proposal'])
})
export const itemMutateInputSchema = z.strictObject({
  ...envelope,
  commandId: id,
  mutation: itemMutationSchema
})
export const itemProposalActionInputSchema = z.strictObject({
  ...envelope,
  commandId: id,
  id,
  expectedVersion: version,
  action: z.enum(['accept', 'reject', 'defer', 'resume', 'discuss', 'revise']),
  candidate: itemContentSchema.optional()
})
export const itemOperationInputSchema = z.strictObject({ ...envelope, commandId: id })
export const itemPreviewInputSchema = z.strictObject({
  ...envelope,
  commandId: id,
  action: z.enum(['delete', 'replace-links', 'replace-content']),
  content: itemContentSchema.optional(),
  targets: z
    .array(z.strictObject({ id, expectedVersion: version }))
    .min(1)
    .max(100)
})
export const itemPreviewRequestSchema = z.union([
  itemPreviewInputSchema,
  z.strictObject({ ...envelope, commandId: id, action: z.literal('recover') })
])
export const itemConfirmInputSchema = z.strictObject({
  ...envelope,
  confirmationId: id,
  accept: z.boolean()
})
export const itemPermissionInputSchema = z.strictObject(envelope)
export const itemPermissionsSchema = z.strictObject({
  assistantId: id,
  version: z.number().int().nonnegative(),
  read: z.boolean(),
  write: z.boolean(),
  propose: z.boolean(),
  receive: z.boolean(),
  endpointDisplay: z.string().nullable(),
  endpointFingerprint: z.string().nullable()
})
export const itemSetPermissionsInputSchema = z.strictObject({
  ...envelope,
  expectedVersion: z.number().int().nonnegative(),
  read: z.boolean(),
  write: z.boolean(),
  propose: z.boolean(),
  receive: z.boolean()
})
export const itemReceiptSchema = z.strictObject({
  operationId: id,
  objectId: id.nullable(),
  objectVersion: z.number().int().nonnegative(),
  objectType: z.enum(['item', 'proposal']).nullable(),
  state: z.enum([
    'SUCCEEDED',
    'PENDING_CONFIRMATION',
    'CANCELLED_BEFORE_DISPATCH',
    'SUPPRESSED',
    'CONFIRMED_NOT_APPLIED',
    'RESULT_UNKNOWN'
  ]),
  confirmationId: id.nullable(),
  summary: z.string().max(300)
})
const error = z.strictObject({
  code: z.enum([
    'INVALID_INPUT',
    'NOT_FOUND',
    'STALE_WRITE',
    'PERMISSION_DENIED',
    'INTEGRITY',
    'CONFLICT',
    'STORAGE_UNAVAILABLE'
  ]),
  message: z.string().max(200)
})
const result = <T extends z.ZodType>(data: T) =>
  z.discriminatedUnion('ok', [
    z.strictObject({ ok: z.literal(true), data }),
    z.strictObject({ ok: z.literal(false), error })
  ])
export const itemQueryResultSchema = result(
  z.strictObject({
    items: z.array(itemRecordSchema).max(100),
    proposals: z.array(itemProposalSchema).max(100),
    nextCursor: z.number().int().nonnegative().nullable(),
    formalCount: z.number().int().nonnegative()
  })
)
export const itemInspectResultSchema = result(
  z.strictObject({
    item: itemRecordSchema.nullable(),
    proposal: itemProposalSchema.nullable(),
    receipts: z.array(itemReceiptSchema).max(100)
  })
)
export const itemMutationResultSchema = result(itemReceiptSchema)
export const itemPermissionsResultSchema = result(itemPermissionsSchema)
export const itemPreviewResultSchema = result(
  z.strictObject({
    confirmationId: id,
    receipt: itemReceiptSchema,
    targets: z.array(itemRecordSchema).max(100),
    relatedItemIds: z.array(id).max(4096),
    replacementContent: itemContentSchema.optional()
  })
)
export type ItemContent = z.infer<typeof itemContentSchema>
export type ItemRecord = z.infer<typeof itemRecordSchema>
export type ItemProposal = z.infer<typeof itemProposalSchema>
export type ItemSource = z.infer<typeof itemSourceSchema>
export type ItemReceipt = z.infer<typeof itemReceiptSchema>
export type ItemPermissions = z.infer<typeof itemPermissionsSchema>
export type ItemMutation = z.infer<typeof itemMutationSchema>
export interface ItemApi {
  query(input: z.input<typeof itemQueryInputSchema>): Promise<z.infer<typeof itemQueryResultSchema>>
  inspect(
    input: z.input<typeof itemInspectInputSchema>
  ): Promise<z.infer<typeof itemInspectResultSchema>>
  mutate(
    input: z.input<typeof itemMutateInputSchema>
  ): Promise<z.infer<typeof itemMutationResultSchema>>
  proposalAction(
    input: z.input<typeof itemProposalActionInputSchema>
  ): Promise<z.infer<typeof itemMutationResultSchema>>
  operation(
    input: z.input<typeof itemOperationInputSchema>
  ): Promise<z.infer<typeof itemMutationResultSchema>>
  preview(
    input: z.input<typeof itemPreviewRequestSchema>
  ): Promise<z.infer<typeof itemPreviewResultSchema>>
  confirm(
    input: z.input<typeof itemConfirmInputSchema>
  ): Promise<z.infer<typeof itemMutationResultSchema>>
  permissions(
    input: z.input<typeof itemPermissionInputSchema>
  ): Promise<z.infer<typeof itemPermissionsResultSchema>>
  setPermissions(
    input: z.input<typeof itemSetPermissionsInputSchema>
  ): Promise<z.infer<typeof itemPermissionsResultSchema>>
}
