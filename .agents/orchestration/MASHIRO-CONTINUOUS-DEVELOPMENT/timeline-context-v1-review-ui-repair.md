# 006 independent UI review repair checkpoint

Date: 2026-09-06. Independent Reviewer; no product implementation. Candidate inspected: `02fab34e462f9cf2444ee591c5519fb4f5667dea`, with product baseline `fb268174e5b14848c5345e52cf6c88ed6c6e1a5d`. This checkpoint is REPAIR input, not overall PASS.

## Findings

1. P2, `src/renderer/src/features/provider/HistoryContextPanel.tsx:344`: submitting `view.draft.trim()` changes literal search semantics. Input ` 空 格 ` reaches trusted query as `空 格`, so users cannot search leading/trailing spaces or whitespace-only strings as required by 006. Send the original bounded draft unchanged; empty string can continue to mean all history.
2. P2, same file `:142–149`: starting a new query overwrites `view.query` before success, but failure preserves the previous messages and nextCursor. After successful query `''` with cursor 50, a failed search for NEW_QUERY and then “加载更早” sends NEW_QUERY + before 50. It skips newer matching NEW_QUERY results and appends a different result set to the retained old view. Keep successful query/messages/cursor together as one committed view; update them only upon accepted success. Draft/loading/error can change independently. Both rejected results and thrown errors, including clear-search and pagination, should preserve this invariant.

Independent command: `node node_modules/vitest/vitest.mjs run .agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/timeline-context-v1-review-ui.test.tsx`.

Executed result: exit 1, two tests failed at their behavioral assertions. Line 32 expected ` 空 格 `, received `空 格`; line 45 expected `{query:'',before:50}`, received `{query:'NEW_QUERY',before:50}`. Oracle SHA-256: `D8F82E1B9431BE816DCCE0D1060B6FA65E0FE7AB4CD481EFDAB1D1888DD69880`.

Repair ownership: original UI Executor, only HistoryContextPanel and focused renderer tests. Preserve strict temporary isolation, per-assistant intent, CAS, request invalidation, original 005 observation protections and both unchanged independent assertions. No schema/trusted permission redesign is required. Add focused failure and late-page tests rather than weakening the oracle.

## Previous trusted finding closure

Reviewer inspected the actual cancellation repair. Explicit cancellation now precedes late result parsing while locally detected delta overflow retains LIMIT/failed; rejected transport promises follow the same rule. Independently re-ran the original cancellation and migration assertions: 2/2 passed, exit 0.

Only two unused fixture imports were removed from Reviewer-owned `timeline-context-v1-review-independent.test.ts`. Original SHA-256 `A05A8C2629E0A8F42366F7DCD6256698D6D6CFF90A218F5B2ADE8545CDF7EE1A`; current `3B198140C5D7FDA44D739B10266772E636AA191D0ABA889992133204815922FB`. Test bodies and assertions are unchanged. This resolves global ESLint unused-import errors without changing the oracle.

## Scope and actual limitations

Read the full HistoryContextPanel and ProviderPanel product diff, relevant original observation/event/reconciliation code, renderer candidate tests and trusted repair. Existing permission/default denial/selection coverage does not replace these two missing UI failure oracles. Full exact-candidate validation and fresh Electron evidence are still pending final review; no overall verdict is issued here.

First independent UI run failed in test setup because this file is outside the normal JSX tsconfig scope and needed an explicit React import. After that fixture-only correction, the two product failures above were reproduced. Initial oracle hash was `5C4F905057BC25E765B67CFA81A84F506BC5F28B7DAEF2C27B58DFF45BF0F10F`. apply_patch Add succeeded; Update failed before reads, so the exact Reviewer-only file was changed with a live preimage guard, unique match, sibling temporary and atomic replace with verified rollback backup. No product or existing tests/global documents were edited. No external calls, commit, push or release.

Next: close the bounded UI findings, rerun unchanged independent tests, freeze the final candidate SHA and resume final independent review. Program remains ACTIVE beyond 006.
