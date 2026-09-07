import type { BackgroundApi } from '../shared/background-contract'
import type { ReminderApi } from '../shared/reminder-contract'
import type { ItemApi } from '../shared/item-contract'
import type { RetentionApi } from '../shared/retention-contract'
import type { AssistantApi } from '../shared/assistant-contract'
import type { MemoryApi } from '../shared/memory-contract'
import type { ProviderApi } from '../shared/provider-contract'

import type { TimelineApi } from '../shared/timeline-contract'

declare global {
  interface Window {
    mashiro: {
      background: BackgroundApi
      reminders: ReminderApi
      items: ItemApi
      retention: RetentionApi
      assistants: AssistantApi
      memory: MemoryApi
      provider: ProviderApi
      timeline: TimelineApi
    }
  }
}

export {}
