# Retention 009 UI implementation result

Date: 2026-09-07
Owner: `/root/retention_009_ui`
Write scope: `src/renderer/**`, `tests/renderer/**`

## Result

Implemented the complete Chinese daily retention entry against the frozen `window.mashiro.retention` API.

- Added a Retention navigation surface with manual browsing and movement across persistent, staging, and trash zones.
- Separated current effective body size, managed Markdown file size, and database/runtime file size. Policy remains explicitly `UNCONFIGURED`; the UI does not invent a quota, age limit, or automatic emptying policy.
- Added all supported intents: delete representation, withdraw information, recycle original, restore original, empty trash, and purge assistant.
- Confirmation uses a fresh trusted preview and displays readable memory/round identity, owners, versions, counts, retained objects, round expansion, blockers, replacement choice, and irreversible warnings. Local confirmation is required before execution.
- Added real cleanup-job status, failure details, retry, and cursor pagination. Global job management remains available when no active assistant exists.
- Routed MemoryPanel deletion/withdrawal and Provider message/range/timeline cleanup into the same retention preview flow. Model tool output can only prepare an intent; opening it recalculates a current trusted preview.
- Preserved the existing six assistant channels and kept all filesystem, database, network, and confirmation authority outside the renderer.

## Cache and late-result governance

- App assistant `list` and `switch` writes are fenced by both the retention governance epoch and an assistant request generation. A late pre-governance snapshot cannot restore a purged assistant, selection, or history target.
- Provider state is cleared for every affected assistant, including hidden assistants and temporary sessions. Requests, streams, reads, operations, mutations, routes, citations, protected references, history focus, rejected drafts, and text drafts carry or check the appropriate epoch before writing.
- Memory edit/preview/receipt state is invalidated when governance changes. Preview selection changes increment the request generation, so late previews cannot replace a newer target or replacement choice.
- Unknown memory mutation identity no longer stores private title or Markdown. The browser renderer calculates SHA-256 with `crypto.subtle.digest` over the canonical mutation payload and retains only domain, assistant ID, target ID, digest, and command ID. Cleanup clears visible private text while retaining this digest identity, so retrying the same unknown operation keeps the original command ID and does not duplicate the mutation.
- `job-status` refreshes job state without clearing unrelated body/draft caches.

## Owned files

- `src/renderer/src/App.tsx`
- `src/renderer/src/features/memory/MemoryPanel.tsx`
- `src/renderer/src/features/provider/HistoryContextPanel.tsx`
- `src/renderer/src/features/provider/ProviderPanel.tsx`
- `src/renderer/src/features/provider/ToolExecutionPanel.tsx`
- `src/renderer/src/features/retention/RetentionPanel.tsx`
- `src/renderer/src/styles.css`
- `tests/renderer/MemoryPanel.test.tsx`
- `tests/renderer/App-retention-fence.test.tsx`
- `tests/renderer/App-retention-registry.test.tsx`
- `tests/renderer/ProviderPanel-retention.test.tsx`
- `tests/renderer/RetentionPanel.test.tsx`

## Verification

- `npm test -- --run tests/renderer`: PASS, 13 files / 58 tests.
- Focused MemoryPanel, App registry, RetentionPanel, and ProviderPanel retention run: PASS, 4 files / 14 tests.
- `npm run typecheck`: PASS for both node and web TypeScript projects.
- Owned-file ESLint invocation with `--max-warnings=0`: PASS.
- Owned-file Prettier check: PASS.
- `git diff --check -- src/renderer tests/renderer`: PASS.

The digest tests run in the Vitest jsdom renderer environment and exercise the real Web Crypto SHA-256 path. They assert a 64-character hexadecimal digest, absence of private title/body in the registry key, and reuse of the same command ID after a cleanup broadcast. The App fence test holds an older assistant-list promise, processes a newer purge refresh, then resolves the old promise and verifies that the deleted assistant does not reappear.

The repository-wide lint observation at handoff had two `no-unsafe-finally` errors only in `tests/integration/retention-009-review-oracles.test.ts`, owned by the independent reviewer/repair route. The owned renderer lint is clean. Per root direction, this subagent did not rerun the shared build or Electron lifecycle while the trusted repair was active. Trusted reported the 009 three-zone, purge confirmation, second-PID job/tombstone Electron path passed and visually reviewed `test-results/retention-ui.png`; final integrated qualification remains with root and the independent reviewer.

## Remaining product gate

The additional AST decision for assistant-private `user` and `event` memories remains unresolved. Trusted blockers prevent that extra scope from being treated as approved, and this UI presents those blockers rather than expanding deletion silently. No renderer DTO extension is outstanding.

No commit, push, paid Provider call, or real private-data access was performed. Exclusive renderer write ownership is returned to root after this report.
## Independent UI review repairs (2026-09-07)

The independent UI oracle first reproduced a real renderer-only privacy-cache failure: after an external purge snapshot at assistant state revision 3 removed assistant A, a late rename receipt at revision 2 restored A's old private display name inside AssistantPanel, even though App and trusted state did not revive it. The same independent oracle later added and reproduced two more real failures: selected memory trash was replaced by an implicit timeline target, and a successful memory mutation receipt that became stale before presentation deleted its digest identity, causing a retry to receive a new command ID.

Repairs:

- AssistantPanel now keeps the latest accepted snapshot revision in a ref and gates initial list plus create, rename, switch, set-primary, and archive receipts by request and operation generations. External snapshots invalidate older requests, clear stale busy/error state, and remove rename drafts for identities no longer present. Lower-revision snapshots cannot enter local state or invoke onSnapshot.
- RetentionPanel now gives explicitly selected memory trash precedence for empty-trash and sends only selected records that are actually in the trash zone, preserving each current object version. Changing to this intent drops non-trash selections. With neither an explicit memory selection nor a conversation target imported from Provider, the button is disabled and the UI says that the current page is not the complete trash. A Provider-prepared message/range/timeline original-trash target remains supported and is labeled as such.
- MemoryPanel now returns a tracked result with an explicit release step. The digest identity is released only after the caller verifies the same governance generation and accepts the successful receipt for presentation. A successful receipt discarded after cleanup retains its body-free identity for retry; an ordinary presented success releases it so the user can intentionally create the same content again with a new command ID.

Review and repair evidence:

- Before repair, the independent config reproduced the late rename failure at line 23, then reproduced the selected-trash and stale-success identity failures at lines 65 and 91.
- npm test -- --run --config .agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/retention-009-review-ui.config.ts: PASS, 1 file / 4 independent tests, after final formatting.
- New focused tests covering the three repaired components: PASS, 3 files / 15 tests.
- npm test -- --run tests/renderer: PASS, 15 files / 69 tests.
- npm run typecheck: PASS.
- ESLint with --max-warnings=0 over the repaired source and owned regression tests: PASS.
- Prettier check over the repaired source and owned regression tests: PASS.
- git diff --check -- src/renderer tests/renderer: PASS.
- Atomic-edit residual scan for the touched source/test directories: clean.

No shared build or Electron lifecycle was run in this repair, following root's instruction while independent trusted work was active. No independent oracle, trusted source, global document, Git state, Provider, or private data was modified. Write ownership for the repaired renderer/test files is returned to root after this update.
