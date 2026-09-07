import { z } from 'zod'
import {
  toolScopeSchema,
  toolOperationSchema,
  capabilitySchema,
  type ToolReadInput
} from './tool-contract.js'

export { providerChannels } from './provider-channels.js'

const protocolVersion = z.literal(1)
const uuid = z.string().uuid()
const timestamp = z.iso.datetime({ offset: true })
const boundedString = (maximum: number) => z.string().min(1).max(maximum)

export const providerListInputSchema = z.strictObject({ protocolVersion })
export const saveConnectionInputSchema = z.strictObject({
  protocolVersion,
  connectionId: uuid.optional(),
  displayName: boundedString(80),
  baseUrl: boundedString(2048),
  enabled: z.boolean(),
  expectedVersion: z.number().int().positive().optional()
})
export const setCredentialInputSchema = z.strictObject({
  protocolVersion,
  connectionId: uuid,
  apiKey: boundedString(4096),
  persistence: z.enum(['temporary', 'persistent'])
})
export const deleteCredentialInputSchema = z.strictObject({
  protocolVersion,
  connectionId: uuid
})
export const bindAssistantInputSchema = z.strictObject({
  protocolVersion,
  assistantId: uuid,
  connectionId: uuid,
  model: boundedString(160),
  expectedVersion: z.number().int().positive().nullable()
})
export const contextIntentSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('recent') }),
  z.strictObject({ kind: z.literal('none') }),
  z.strictObject({ kind: z.literal('selected'), requestIds: z.array(uuid).min(1).max(16) }),
  z.strictObject({
    kind: z.literal('chapters'),
    chapters: z
      .array(z.strictObject({ id: uuid, expectedVersion: z.number().int().positive() }))
      .min(1)
      .max(16)
  })
])
export type ContextIntent = z.infer<typeof contextIntentSchema>
export const startChatInputSchema = z.strictObject({
  protocolVersion,
  requestId: uuid,
  assistantId: uuid,
  text: boundedString(16000),
  mode: z.enum(['normal', 'temporary']).default('temporary'),
  context: contextIntentSchema.default({ kind: 'recent' }),
  tools: toolScopeSchema.default('off'),
  itemContext: z
    .strictObject({
      type: z.enum(['item', 'proposal']),
      id: uuid,
      expectedVersion: z.number().int().positive()
    })
    .optional(),
  stream: z.boolean()
})
export const clearChatInputSchema = z.strictObject({
  protocolVersion,
  assistantId: uuid
})
export const cancelChatInputSchema = z.strictObject({
  protocolVersion,
  requestId: uuid,
  assistantId: uuid
})

export const providerErrorCodeSchema = z.enum([
  'INVALID_INPUT',
  'PERMISSION_DENIED',
  'NOT_FOUND',
  'STALE_WRITE',
  'ASSISTANT_ARCHIVED',
  'CONNECTION_DISABLED',
  'CREDENTIAL_MISSING',
  'CREDENTIAL_PROTECTION_UNAVAILABLE',
  'REQUEST_IN_PROGRESS',
  'AUTHENTICATION',
  'QUOTA',
  'CONFIGURATION',
  'TEMPORARY',
  'PROTOCOL',
  'TIMEOUT',
  'LIMIT',
  'CANCELLED',
  'STORAGE_UNAVAILABLE',
  'INTERNAL_ERROR'
])

export const providerConnectionSchema = z.strictObject({
  id: uuid,
  displayName: boundedString(80),
  baseUrl: boundedString(2048),
  enabled: z.boolean(),
  hasCredential: z.boolean(),
  credentialPersistence: z.enum(['none', 'temporary', 'persistent']),
  createdAt: timestamp,
  updatedAt: timestamp,
  version: z.number().int().positive()
})
export const providerBindingSchema = z.strictObject({
  assistantId: uuid,
  connectionId: uuid,
  model: boundedString(160),
  updatedAt: timestamp,
  version: z.number().int().positive()
})
export const providerSnapshotSchema = z.strictObject({
  connections: z.array(providerConnectionSchema),
  bindings: z.array(providerBindingSchema)
})
export const providerStableErrorSchema = z.strictObject({
  code: providerErrorCodeSchema,
  message: boundedString(200),
  correlationId: uuid,
  retryable: z.boolean()
})
export const providerResultSchema = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true), data: providerSnapshotSchema }),
  z.strictObject({ ok: z.literal(false), error: providerStableErrorSchema })
])
export const providerChatResultSchema = z.discriminatedUnion('ok', [
  z.strictObject({
    ok: z.literal(true),
    data: z.strictObject({
      requestId: uuid,
      assistantId: uuid,
      status: z.enum(['completed', 'interrupted', 'cancelled']),
      text: z.string().max(200000),
      usage: z
        .strictObject({
          promptTokens: z.number().int().nonnegative(),
          completionTokens: z.number().int().nonnegative(),
          totalTokens: z.number().int().nonnegative()
        })
        .nullable()
    })
  }),
  z.strictObject({ ok: z.literal(false), error: providerStableErrorSchema })
])
export const providerEventSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('operation'),
    requestId: uuid,
    assistantId: uuid,
    operation: toolOperationSchema
  }),
  z.strictObject({
    type: z.literal('delta'),
    requestId: uuid,
    assistantId: uuid,
    text: boundedString(65536)
  }),
  z.strictObject({
    type: z.enum(['completed', 'interrupted', 'cancelled', 'failed']),
    requestId: uuid,
    assistantId: uuid
  })
])

export const toolReadResultSchema = z.discriminatedUnion('ok', [
  z.strictObject({
    ok: z.literal(true),
    data: z.strictObject({
      assistantId: uuid,
      mode: z.enum(['normal', 'temporary']),
      operations: z.array(toolOperationSchema).max(384)
    })
  }),
  z.strictObject({ ok: z.literal(false), error: providerStableErrorSchema })
])
export const capabilityResultSchema = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true), data: capabilitySchema }),
  z.strictObject({ ok: z.literal(false), error: providerStableErrorSchema })
])
export type ToolReadResult = z.infer<typeof toolReadResultSchema>
export type CapabilityResult = z.infer<typeof capabilityResultSchema>

export type ProviderConnection = z.infer<typeof providerConnectionSchema>
export type ProviderBinding = z.infer<typeof providerBindingSchema>
export type ProviderSnapshot = z.infer<typeof providerSnapshotSchema>
export type ProviderResult = z.infer<typeof providerResultSchema>
export type ProviderChatResult = z.infer<typeof providerChatResultSchema>
export type ProviderEvent = z.infer<typeof providerEventSchema>
export type SaveConnectionInput = z.infer<typeof saveConnectionInputSchema>
export type SetCredentialInput = z.infer<typeof setCredentialInputSchema>
export type BindAssistantInput = z.infer<typeof bindAssistantInputSchema>
export type StartChatInput = z.input<typeof startChatInputSchema>
export type ClearChatInput = z.infer<typeof clearChatInputSchema>
export type CancelChatInput = z.infer<typeof cancelChatInputSchema>

export interface ProviderApi {
  tools(input: ToolReadInput): Promise<ToolReadResult>
  capabilities(input: { protocolVersion: 1; assistantId: string }): Promise<CapabilityResult>
  list(): Promise<ProviderResult>
  saveConnection(input: SaveConnectionInput): Promise<ProviderResult>
  setCredential(input: SetCredentialInput): Promise<ProviderResult>
  deleteCredential(input: { protocolVersion: 1; connectionId: string }): Promise<ProviderResult>
  bindAssistant(input: BindAssistantInput): Promise<ProviderResult>
  clearChat(input: ClearChatInput): Promise<ProviderResult>
  startChat(input: StartChatInput): Promise<ProviderChatResult>
  cancelChat(input: CancelChatInput): Promise<ProviderChatResult>
  onEvent(listener: (event: ProviderEvent) => void): () => void
}
