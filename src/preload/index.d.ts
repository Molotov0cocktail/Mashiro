import type { AssistantApi } from '../shared/assistant-contract'
import type { ProviderApi } from '../shared/provider-contract'

declare global {
  interface Window {
    mashiro: { assistants: AssistantApi; provider: ProviderApi }
  }
}

export {}
