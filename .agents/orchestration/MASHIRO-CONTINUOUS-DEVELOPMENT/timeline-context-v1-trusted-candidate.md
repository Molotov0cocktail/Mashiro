# 006 trusted-core candidate evidence

- Role: next_slice_plan, gpt-6-astra / medium; planner and trusted implementer, not an independent Reviewer.
- Date: 2026-09-06. Route timeline-context-permissions-v1 / attempt 1.
- Product baseline fb268174e5b14848c5345e52cf6c88ed6c6e1a5d. Current documentary HEAD c03c5adb05aa5e237fab0f528a1f25ccbd4825ab; candidate remains uncommitted. UI has a separate single writer.
- Contract: [006](../../../doc/tasks/006-timeline-context-permissions.md).

## Candidate behavior

Schema v4 adds assistant history-read settings and assistant/actual-endpoint history-recipient grants. Empty/migrated grants deny historical external transmission; own-history read retains the existing own-assistant semantic. Permission changes use transaction rollback and a shared per-assistant revision plus trusted current connection/fingerprint comparison. Fingerprint is SHA-256 over normalized actual HTTPS Base URL and fixed Chat Completions adapter semantics; no credentials or model-name authorization shortcut.

Normal context intent is recent, none or selected request IDs. Main resolves complete, owned, eligible rounds in chronology, rejects duplicate/foreign/unknown/incomplete/over-budget explicit selection before message insertion or transport. Lack of history permission leaves recent with only current input; explicit selected is rejected. None sends current input without loading history. Strict temporary rejects selected and does not call normal context/query repositories.

A revoked permission aborts affected history-bearing calls. Non-cooperative late deltas are ignored and final body/usage are discarded in favor of the existing partial with cancelled status. None-policy calls are not aborted by unrelated history revocation.

New query returns stable sequence pages scoped to one assistant, literal substring search across the full timeline, and a next cursor. It does not replace 005 read snapshots. New strict IPC methods query/permissions/setPermissions preserve six assistant channels and safe preload imports. Unbound assistants can browse locally and edit own-read settings.

## Changes and ownership

Trusted changes: shared provider/timeline contract and channels; main schema, provider/timeline and new history-permission repository; ProviderService; timeline IPC; preload. New tests: tests/integration/timeline-context.test.ts. Existing schema fixtures now reconstruct actual v1/v2 by dropping new v4 tables, then verify current v4; original history-content fixtures explicitly grant recipient permission, preserving their original context oracles. Timeline IPC count is now five.

Electron testing controller/harness now explicitly grants permission through preload, checks grant identity/revision after a second PID, checks keyword query, and uses selected completed rounds for the post-restart send. Original no-recovery-call and one-explicit-call assertions remain unchanged.

No renderer files, dependencies, global progress, secrets or personal data changed by this executor. No commit/push/live call/package/release.

## Oracles and executed verification

1. New normal-history default-deny test first failed because old strict schema rejected the new context intent. After additive DTO only, it failed at the intended data boundary: actual transport contained old-marker/reply/next while expected only next. No implementation existed yet.
2. After trusted implementation, this oracle passed. Added selection/permission/query/migration tests brought the file to 13 passing tests.
3. Latest independent-of-UI command: node node_modules/vitest/vitest.mjs run tests/integration tests/unit — exit 0, 15 files / 82 tests.
4. node node_modules/typescript/bin/tsc -p tsconfig.node.json --noEmit — exit 0.
5. Scoped eslint over src/shared, src/main, src/preload, tests/integration and scripts/electron-f1-harness.mjs — exit 0. An initial unused synthetic transport parameter lint failure was corrected without changing the test assertions.
6. Explicit changed-file Prettier formatting completed. git diff --check — exit 0.
7. Full renderer/full verify/build/Electron lifecycle not run by this executor yet: controller instructed unified validation after renderer integration. The harness additions above are candidate code, not claimed runtime evidence. Live endpoint evidence remains historical and unchanged; no new live capability claimed.

The 13 tests cover default deny; chronological early selection/none; duplicate/unknown/foreign/incomplete/oversized selection; zero reads without permission and temporary isolation; changed endpoint/model/rename/CAS; shared-connection and unbound assistants; revocation with non-cooperative late output; unaffected none inflight; >100 pagination/new insert/literal Chinese search; stale and failed permission updates; populated v3 migration/new-setting restart; failed v3 rollback; strict new IPC output/input sanitization.

## Tool route and residuals

Default helper failure had already been diagnosed by controller. Used approved host PowerShell, fixed repository paths, exact-match transforms with expected occurrence counts, live preimage hashes, unique sibling temporaries, File.Replace with backup/rollback for existing files and create-new Move for new files, followed by reported postimage hashes. Ordinary scoped formatter was then used.

A pure JavaScript btoa preparation failed before tool execution and made no edit. Initial writer param declaration was rejected by shell wrapping before writes; removed unnecessary declaration. One exact-match guard rejected a CRLF/LF mismatch before writes; deterministic newline normalization corrected the writer. No platform rejection bypass, no mechanical rerun of historical Toolhelp32 route.

Current candidate is NOT independently reviewed. Next: integrate renderer, full verification including fresh Electron evidence, independent gpt-6-astra Reviewer, repair if needed, then controller candidate commit and authorized dual-remote synchronization. Task completion must continue the project program.
