import { vi } from 'vitest'
import type { ProviderApi } from '../../src/shared/provider-contract.js'

const capabilityNames = [
  'text',
  'stream',
  'tools',
  'preserved-thinking',
  'json-object',
  'local-strict',
  'vendor-strict',
  'parallel',
  'usage'
] as const

export function providerApi007Defaults(): Pick<ProviderApi, 'tools' | 'capabilities'> {
  return {
    tools: vi.fn(async (input) => ({
      ok: true as const,
      data: { assistantId: input.assistantId, mode: input.mode, operations: [] }
    })),
    capabilities: vi.fn(async (input) => ({
      ok: true as const,
      data: {
        assistantId: input.assistantId,
        endpointFingerprint: null,
        endpointDisplay: null,
        model: null,
        protocol: 'chat-completions-v1' as const,
        adapterVersion: 'unavailable',
        mode: 'standard-non-preserved' as const,
        toolsAvailable: false,
        reason: '测试夹具未提供工具能力记录',
        evidence: capabilityNames.map((capability) => ({
          capability,
          level: 'UNVERIFIED' as const,
          observedAt: null,
          detail: '测试夹具未验证此能力'
        }))
      }
    }))
  }
}
