import type { AssistantApi } from '../shared/assistant-contract'
import type { ProviderApi } from '../shared/provider-contract'

import type { TimelineApi } from '../shared/timeline-contract'

declare global {
  interface Window {
    mashiro: { assistants: AssistantApi; provider: ProviderApi; timeline: TimelineApi }
  }
}

export {}
