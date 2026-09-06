# Memory 008 renderer implementation evidence

Date: 2026-09-06 (Asia/Shanghai)

Role: renderer executor. This record is implementation and validation evidence; it is not an independent review verdict.

## Implemented user flow

- The default application view is the normal conversation. A persistent `对话 / 记忆与事件` navigation lets the user reach long-term information without unmounting Provider state or losing in-flight receipts.
- Assistant management is collapsible. Connection settings remain mounted and appear after the conversation in the daily flow.
- Opening a memory source returns to normal conversation, switches to the owning assistant through the trusted assistant API when required, and locates `round` and `user-round` sources by exact request ID.
- The memory view queries the trusted API on each entry. A live successful `write_memory` or `correct_memory` receipt also refreshes the mounted view once. An unsaved correction is retained and the UI explains that trusted version checking will prevent overwriting a newer version.
- The memory view supports literal search, kind/scope filters, pagination, trash visibility, full inspection, correction, restoration, external-change preview and explicit acceptance.
- Global user memory and assistant-private memory expose independent `read`, `write`, `writeInferences`, and `receive` grants with their own CAS versions and actual endpoint display. New grants remain off until explicitly enabled.
- User-statement, faithful-summary, and inference natures are distinct. Personal events include intention, planned, arranged, reported-happened, completed, cancelled, and unknown states.
- Delete and withdraw do not report completion from a prepared tool result. Structured trusted confirmation cards show affected memory and round totals, bounded IDs, source-round navigation, and truncation. Confirm and cancel call `memory.confirm` with the exact trusted confirmation ID. The completed/cancelled business receipt controls the displayed terminal state.
- A late `PENDING_CONFIRMATION` snapshot cannot regress a completed or cancelled receipt with the same memory business operation ID.
- Provenance, changes, and receipts are collapsed by default. The UI distinguishes memory supplied to a model request from proof that the model used it.
- Strict temporary mode does not offer history or memory tools. Normal mode exposes clock, history, memory, and combined scopes only when trusted capability and per-domain grants allow them. `write_memory`, `correct_memory`, and removal requests have separate Chinese labels and receipt meanings.

## Renderer-owned files

- `src/renderer/src/App.tsx`
- `src/renderer/src/features/assistants/AssistantPanel.tsx`
- `src/renderer/src/features/provider/ProviderPanel.tsx`
- `src/renderer/src/features/provider/ToolExecutionPanel.tsx`
- `src/renderer/src/features/memory/MemoryPanel.tsx`
- `src/renderer/src/styles.css`
- `src/preload/index.d.ts` (explicitly handed off by the trusted-boundary executor)
- `tests/renderer/App-provider-sync.test.tsx`
- `tests/renderer/ProviderPanel-tools.test.tsx`
- `tests/renderer/MemoryPanel.test.tsx`
- `tests/renderer/memory-api-fixture.ts`

## Validation evidence

Commands used the repository-pinned dependencies and `D:\nodejs\npm.cmd`.

| Check | Result |
| --- | --- |
| Focused changed renderer files | PASS: 3 files, 22 tests |
| `npm run test:focused` | PASS: 27 files, 185 tests |
| `npm test` | PASS: 27 files, 185 tests |
| `npm run typecheck` | PASS |
| `eslint src/renderer tests/renderer --max-warnings=0` | PASS |
| `npm run lint` | PASS after authorized one-use task helpers were removed |
| `npm run format:check` | PASS |
| `npm run build` | PASS; main, preload, and renderer bundles produced |

The trusted-boundary executor removed its authorized one-use edit helpers, after which the complete repository lint gate passed with no warning.

No commit, push, release, paid call, credential read, or real personal-data access was performed by this renderer executor.
