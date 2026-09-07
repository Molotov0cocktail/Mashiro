import type { ProtocolMessage } from './tool-protocol.js'

export const GLM_TOOL_ADAPTER = 'glm-5.3-flash-tools-v1'
export const DEEPSEEK_TOOL_ADAPTER = 'deepseek-v4-retained-v1'
export type ProtocolMode = 'standard-non-preserved' | 'retained-thinking'
export interface ProviderProfile {
  adapterVersion: string
  mode: ProtocolMode
  retained: boolean
  requestFields: (tools: boolean, stream: boolean) => Record<string, unknown>
}

/** Exact hosting endpoint and model select one reviewed protocol, never a brand-wide guess. */
export function providerProfile(baseUrl: string, model: string): ProviderProfile | undefined {
  if (baseUrl === 'https://open.bigmodel.cn/api/paas/v4' && /^glm-5\.3-flash$/i.test(model))
    return {
      adapterVersion: GLM_TOOL_ADAPTER,
      mode: 'standard-non-preserved',
      retained: false,
      requestFields: (tools, stream) => ({
        thinking: { type: 'enabled', ...(tools ? { clear_thinking: true } : {}) },
        reasoning_effort: 'low',
        ...(tools && stream ? { tool_stream: true } : {})
      })
    }
  if (
    ['https://api.deepseek.com', 'https://api.deepseek.com/v1'].includes(baseUrl) &&
    ['deepseek-v4-flash', 'deepseek-v4-pro'].includes(model)
  )
    return {
      adapterVersion: DEEPSEEK_TOOL_ADAPTER,
      mode: 'retained-thinking',
      retained: true,
      requestFields: () => ({ thinking: { type: 'enabled' }, reasoning_effort: 'low' })
    }
  return undefined
}

/** Input estimates include retained reasoning and tool arguments, not only visible answer text. */
export function protocolInputCharacters(messages: ProtocolMessage[]): number {
  return messages.reduce(
    (sum, message) =>
      sum +
      message.content.length +
      (message.reasoning_content?.length ?? 0) +
      (message.tool_call_id?.length ?? 0) +
      (message.tool_calls?.reduce(
        (total, call) =>
          total + call.id.length + call.function.name.length + call.function.arguments.length,
        0
      ) ?? 0),
    0
  )
}
