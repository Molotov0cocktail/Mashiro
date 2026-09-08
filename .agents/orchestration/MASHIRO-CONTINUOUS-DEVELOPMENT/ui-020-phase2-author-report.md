# 020 Renderer phase 2 author candidate

Status: `AUTHOR_CANDIDATE_FROZEN`

This candidate makes daily chat the primary workspace, keeps one mounted Provider surface while moving connection, model binding, and context permissions into settings, and adds a persistent sidebar with the current assistant switcher. The assistant switch result and view-navigation generations are separate, so trusted assistant state can finish while the user stays on a newly selected page; later governance state still retires stale results.

The items, reminders, memory, automation, operations, and settings areas remain directly reachable. Async item/reminder targets scroll and focus only after the current-generation trusted detail is available. Automatic conversation organization, memory organization, reminder runtime, memory permission, retention policy, and permanent-cleanup controls use plain Chinese summaries and progressive disclosure; dirty configuration remains visible in collapsed summaries. The data section points to the existing native menu for location, complete backup, and restore without adding renderer filesystem authority.

The shell adds an explicit empty-state path to create an assistant and sends users to connection/model settings when chat is not ready. Settings provides an explicit return to chat. Hidden panels remain mounted and `[hidden]` wins over the new grid/flex styles, preserving drafts, active streams, and existing stale-response barriers.

Author validation:

- Focused renderer regression: 17 files, 73 tests passed.
- Web TypeScript: exit 0.
- Scoped ESLint: exit 0.
- Scoped Prettier check: exit 0.
- Independent switch/navigation oracle was included unchanged in the focused run. Its ownership remains with `review_017_trusted`.

Final integrated build, responsive screenshots, keyboard/viewport checks, and full-suite verification remain with root and independent review. Product and author-test hashes are in `ui-020-phase2-manifest-v1.json`.
