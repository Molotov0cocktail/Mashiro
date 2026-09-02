import { describe, expect, it } from 'vitest'
import {
  assistantResultSchema,
  createInputSchema,
  renameInputSchema
} from '../../src/shared/assistant-contract.js'

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

  it('strictly validates assistant success and stable error output contracts', () => {
    const timestamp = '2026-09-03T00:00:00.000Z'
    const assistant = {
      id: '00000000-0000-4000-8000-000000000001',
      displayName: 'Mashiro',
      isArchived: false,
      createdAt: timestamp,
      updatedAt: timestamp,
      archivedAt: null,
      version: 1
    }
    const success = {
      ok: true,
      data: {
        assistants: [assistant],
        currentAssistantId: assistant.id,
        primaryAssistantId: assistant.id,
        stateRevision: 1
      }
    }
    expect(assistantResultSchema.safeParse(success).success).toBe(true)
    expect(
      assistantResultSchema.safeParse({
        ...success,
        data: { ...success.data, internalPath: 'D:\\Mashiro', stateRevision: -1 }
      }).success
    ).toBe(false)
    expect(
      assistantResultSchema.safeParse({
        ...success,
        data: {
          ...success.data,
          assistants: [{ ...assistant, id: 'forged', createdAt: 'not-a-time', version: 0 }]
        }
      }).success
    ).toBe(false)

    const stableError = {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Assistant service failed',
        correlationId: '00000000-0000-4000-8000-000000000002',
        retryable: false
      }
    }
    expect(assistantResultSchema.safeParse(stableError).success).toBe(true)
    expect(
      assistantResultSchema.safeParse({
        ...stableError,
        error: { ...stableError.error, code: 'SQLITE_ERROR', stack: 'secret stack' }
      }).success
    ).toBe(false)
  })
})
