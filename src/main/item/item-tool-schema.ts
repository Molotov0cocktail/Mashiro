import { z } from 'zod'
import { itemContentSchema } from '../../shared/item-contract.js'
const itemToolCandidateSchema = z
  .strictObject({
    ...itemContentSchema.shape,
    counterpart: z.string().max(160).nullish()
  })
  .superRefine((candidate, ctx) => {
    const checked = itemContentSchema.safeParse({
      ...candidate,
      counterpart: candidate.counterpart ?? ''
    })
    if (!checked.success)
      for (const issue of checked.error.issues)
        ctx.addIssue({ code: 'custom', path: issue.path, message: issue.message })
  })
export const normalizeItemCandidate = (candidate: z.infer<typeof itemToolCandidateSchema>) =>
  itemContentSchema.parse({ ...candidate, counterpart: candidate.counterpart ?? '' })
export const itemIntentToolSchema = z.strictObject({ intentId: z.string().uuid() })
export const itemProposeToolSchema = z.strictObject({
  candidate: itemToolCandidateSchema,
  evidence: z.string().min(1).max(16000)
})
export const itemPrepareUpdateToolSchema = z.strictObject({
  itemId: z.string().uuid(),
  expectedVersion: z.number().int().positive(),
  content: itemToolCandidateSchema
})
export const itemReviseToolSchema = z.strictObject({
  proposalId: z.string().uuid(),
  expectedVersion: z.number().int().positive(),
  candidate: itemToolCandidateSchema
})
