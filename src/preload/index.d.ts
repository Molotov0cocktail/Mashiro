import type { AssistantApi } from '../shared/assistant-contract'
import type { MemoryApi } from '../shared/memory-contract'
import type { ProviderApi } from '../shared/provider-contract'

import type { TimelineApi } from '../shared/timeline-contract'

declare global {
  interface Window {
    mashiro: {
      assistants: AssistantApi
      memory: MemoryApi
      provider: ProviderApi
      timeline: TimelineApi
    }
  }
}

export {}
