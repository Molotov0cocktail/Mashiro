import type { AssistantApi } from '../shared/assistant-contract'

declare global {
  interface Window {
    mashiro: { assistants: AssistantApi }
  }
}

export {}
