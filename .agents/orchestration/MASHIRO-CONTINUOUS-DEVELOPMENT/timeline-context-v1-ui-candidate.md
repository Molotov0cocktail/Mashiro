# 006 Renderer / UI Candidate Evidence

ROLE / TASK / ROUTE / ATTEMPT
Executor / 006 timeline browsing, local context selection and history permissions UI / timeline-context-permissions-v1 / attempt 1

BASELINE / FINAL HEAD
The accepted planning baseline was `fb268174e5b14848c5345e52cf6c88ed6c6e1a5d`. While this executor held only `src/renderer/**` and `tests/renderer/**`, the coordinator advanced unrelated reviewed documentation/evidence commits. The live integration HEAD at handoff was `44b734e3e75e7505fbd8a87680e532c3f297e116`. All UI changes below remain in the shared working tree and are not committed by this executor.

CANDIDATE COMMITS
None. Commit, independent verdict, full verification, push and close are coordinator/Reviewer work.

FILES CHANGED

- `src/renderer/src/features/provider/HistoryContextPanel.tsx` (new)
- `src/renderer/src/features/provider/ProviderPanel.tsx`
- `src/renderer/src/styles.css`
- `tests/renderer/ProviderPanel-history-context.test.tsx` (new)
- `tests/renderer/timeline-api-fixture.ts` (new)
- `tests/renderer/ProviderPanel-timeline.test.tsx`
- `tests/renderer/ProviderPanel-late-response.test.tsx`
- `tests/renderer/ProviderPanel-security.test.tsx`
- `tests/renderer/App-provider-sync.test.tsx`

IMPLEMENTATION SUMMARY

- Added a normal-history browser separate from the live transcript. It queries the trusted API without requiring a configured Provider, supports literal search, clear-search and stable older-page loading, and preserves current results on failures.
- History rows show stored body, time and actual pending/completed/failed/cancelled/interrupted state, including single-sided rows. Only a complete completed user/assistant pair is selectable as context.
- Added per-assistant `recent`, `none` and `selected` intent. Selected IDs are trusted request IDs only, capped at 16 in the UI. Switching assistants preserves independent intent and selection.
- Strict temporary mode hides the history/context/permission UI, does not call `timeline.query`, and always sends `context: { kind: 'none' }` even when that assistant retains a normal-mode selection.
- Added separate read-history and endpoint-send permission switches. The renderer displays the trusted `endpointDisplay`, submits the trusted connection/fingerprint/version snapshot with CAS, does not optimistically change active permission state, disables endpoint permission with no resolved endpoint, and explains that local browsing remains available.
- `ProviderPanel` now submits an explicit context intent. `PERMISSION_DENIED` and trusted pre-admission `LIMIT` restore the submitted text as an unsent draft. Existing 005 live partial/snapshot reconciliation code was left intact.
- Added realistic empty query/default permission methods to old renderer fixtures rather than weakening the frozen `TimelineApi` type.

RED ORACLE

Command:

`npm exec vitest run tests/renderer/ProviderPanel-history-context.test.tsx`

Before implementation: exit 1; 1 file, 2 tests, 2 failures. Both failed at the first observable missing behavior: the old UI could not find the stored normal-history row/entry point.

The final focused file now has four tests covering literal search and older paging, endpoint-bound permission CAS plus selected IDs, per-assistant intent and strict-temporary isolation, explicit permission rejection with draft recovery, and display of failed/single-sided stored history without selectable context.

VERIFICATION COMMANDS + EXIT CODES

- `npm exec vitest run tests/renderer` — exit 0; 7 files, 23 tests passed.
- `npm run typecheck` — exit 0; node and web TypeScript projects passed.
- Owned-file `npm exec -- eslint ... --max-warnings=0` — exit 0.
- Owned-file `npm exec -- prettier --check ...` — exit 0.
- `git diff --check -- src/renderer tests/renderer` — no output.
- A prior integration snapshot before the final extra renderer state oracle ran `npm run test:focused` successfully with 22 files / 104 tests. This is historical within the attempt and is not claimed as final full-chain verification; the coordinator will run final verification on the integrated candidate.
- Full-repository `npm run lint` was not a product failure: it was temporarily blocked by two unused imports in the independent Reviewer's untracked `.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/timeline-context-v1-review-independent.test.ts`. Renderer-owned lint passed. The Reviewer owns and is already handling that temporary file.

FIRST BAD STATE / EVIDENCE DELTA

- Product red: missing history UI; closed by the new component and tests.
- A guessed script `npm run typecheck:web` did not exist; route corrected to the repository's `npm run typecheck`, which passed.
- Typecheck then identified old TimelineApi fixtures lacking the newly frozen methods; fixed with a shared realistic fixture.
- React lint rejected a render-time ref assignment and synchronous state-setting call path from effects; fixed by effect-owned route invalidation and queued asynchronous loads.
- One test mock inferred an empty argument tuple, then an optional-context access; fixed by a typed required-input use. Final typecheck passed.

DIFF / SCOPE SELF-CHECK

Only the renderer/UI ownership set and this dedicated evidence report were written. No shared, main, preload, script, dependency, task/progress or design file was changed by this executor. The renderer remains untrusted and receives only the frozen narrow APIs. No SQL, filesystem path, credential, shell or arbitrary network authority was introduced.

EXTERNAL ACTIONS / PAID CALLS / USAGE

None. No Provider call, dependency download, commit, push, tag, Release or installation action was performed.

CREDENTIAL HANDLING

The user-provided test credential was not read into a process, written to a file, logged or used. A focused scan of `src/renderer` and `tests/renderer` for both credential segments found no match (expected `rg` exit 1).

TOOLING RECOVERY

The default execution helper failed before reads. The approved host PowerShell route was used. One `.NET File.Replace` attempt with a null backup argument failed; catch restored the exact preimage hash. A corrected same-directory explicit backup path succeeded. After the coordinator reported that `apply_patch` worked in another context, this executor probed it once; it still failed before reading the target in this context. Subsequent writes used fixed allowlists, preimage SHA-256, deterministic unique-match transforms, sibling temporary files, explicit same-directory backup with atomic replace, postimage SHA-256 and immediate diff review. Known writer backup/temp residue was removed; final residue scan under the owned roots produced no output.

NOT RUN / FAILURES

Final project-wide `npm run verify`, Electron two-PID lifecycle, packaged runtime and live Provider verification were not run by this UI executor. They belong to integrated 006 review/close and later program milestones. No renderer product/test failure remains in the executor evidence.

REMAINING RISKS

- Final acceptance still requires independent review of the combined trusted and renderer diff and coordinator-run full verification.
- Search results contain only rows returned by trusted literal matching; a result that contains only one side remains visible but cannot be selected until a complete completed pair is present in the loaded view. Trusted selected-context validation still re-resolves the full pair and controls authority.
- Styling was verified by DOM behavior, lint, format and type checks; no separate screenshot/manual visual review was performed by this executor.

WORKTREE / REMOTE STATE

Live HEAD at handoff: `44b734e3e75e7505fbd8a87680e532c3f297e116`. The shared worktree also contains trusted-core and Reviewer changes owned by other roles. This executor made no remote action.

RECOMMENDED VERDICT INPUT

The renderer candidate is ready for combined independent review. This is executor evidence, not a PASS verdict.

STOP / REPLAN / USER-GATE

No user gate and no replan requested. Renderer write ownership is returned to the coordinator. Task 006 and the overall program remain active until independent verdict and close.
