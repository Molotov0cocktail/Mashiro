import { z } from 'zod'
import { memoryRecordSchema } from './memory-contract.js'

const uuid = z.string().uuid()
const version = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
export const memoryRoundInputSchema = z.strictObject({
  protocolVersion: z.literal(1),
  assistantId: uuid,
  requestId: uuid,
  mode: z.enum(['normal', 'temporary']),
  section: z.enum(['provided', 'changes']),
  cursor: version.optional(),
  limit: z.number().int().min(1).max(50).default(20)
})
const object = {
  objectId: uuid,
  objectVersion: version,
  availability: z.enum(['available', 'obsolete', 'unavailable']),
  record: memoryRecordSchema.nullable(),
  canInspect: z.boolean()
}
export const memoryRoundProvidedSchema = z.strictObject({
  kind: z.literal('provided'),
  ...object,
  evidence: z.enum(['RESPONSE_OBSERVED', 'DISPATCH_STARTED', 'PREPARED']),
  dispatchedAt: z.iso.datetime({ offset: true }).nullable()
})
export const memoryRoundChangeSchema = z.strictObject({
  kind: z.literal('change'),
  ...object,
  objectId: uuid.nullable(),
  objectVersion: version.nullable(),
  operationId: uuid,
  action: z.enum(['remember', 'correct', 'delete', 'withdraw', 'restore']),
  state: z.enum(['SUCCEEDED', 'PENDING_CONFIRMATION', 'NOT_APPLIED', 'RESULT_UNKNOWN']),
  createdAt: z.iso.datetime({ offset: true }),
  confirmationId: uuid.nullable(),
  summary: z.string().max(300)
})
export const memoryRoundResultSchema = z.discriminatedUnion('ok', [
  z.strictObject({
    ok: z.literal(true),
    data: z.strictObject({
      assistantId: uuid,
      requestId: uuid,
      evidenceCoverage: z.literal('recorded-only'),
      entries: z.array(z.union([memoryRoundProvidedSchema, memoryRoundChangeSchema])).max(50),
      nextCursor: version.nullable()
    })
  }),
  z.strictObject({
    ok: z.literal(false),
    error: z.strictObject({
      code: z.enum(['INVALID_INPUT', 'NOT_FOUND', 'PERMISSION_DENIED', 'STORAGE_UNAVAILABLE']),
      message: z.string().max(200)
    })
  })
])
export type MemoryRoundInput = z.input<typeof memoryRoundInputSchema>
export type MemoryRoundResult = z.infer<typeof memoryRoundResultSchema>
export type MemoryRoundProvided = z.infer<typeof memoryRoundProvidedSchema>
export type MemoryRoundChange = z.infer<typeof memoryRoundChangeSchema>
