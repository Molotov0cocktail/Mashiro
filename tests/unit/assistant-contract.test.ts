import { describe, expect, it } from 'vitest'
import { createInputSchema, renameInputSchema } from '../../src/shared/assistant-contract.js'

describe('assistant input contracts', () => {
  it('rejects unknown fields and malformed protocol data', () => {
    expect(
      createInputSchema.safeParse({
        protocolVersion: 1,
        displayName: 'A',
        expectedStateRevision: 0,
        isPrimary: true
      }).success
    ).toBe(false)
    expect(
      createInputSchema.safeParse({
        protocolVersion: 2,
        displayName: 'A',
        expectedStateRevision: 0
      }).success
    ).toBe(false)
    expect(
      renameInputSchema.safeParse({
        protocolVersion: 1,
        assistantId: 'forged',
        displayName: 'A',
        expectedAssistantVersion: 1,
        expectedStateRevision: 0
      }).success
    ).toBe(false)
  })
})
