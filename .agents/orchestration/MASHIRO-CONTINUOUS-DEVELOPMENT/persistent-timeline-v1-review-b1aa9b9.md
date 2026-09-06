# Independent 005 repair delta review

VERDICT: REPAIR

Date: 2026-09-06. Reviewer: timeline_reviewer, independent gpt-6-astra.
Product baseline: f5aa9880828b2a0719b6b8c16d1e4e05c475dcd6.
Repair baseline: 842176053489e2d3d90037d7b36a31ef6129c415.
Exact reviewed HEAD: b1aa9b9a1db6973799f42850b268f84ee1fccbcc.
Route: persistent-timeline-v1, first bounded repair delta.
Initial Git/index/worktree independently clean. Eight changed files inspected. Reviewer changed no product files and made no commit/push.

## Decision

The original missing-credential/empty-save and mode-switch streaming reproductions now pass, and the authoritative document headers are corrected. The repair introduces two failing cases in the same renderer reconciliation boundary. A failed read is treated as proof of non-admission, and optimistic renderer message IDs are treated as proof of the number actually saved. These cases still violate preservation and truthful state requirements, so PASS is not available.

## Findings

### R1 — P2: failed or superseded read deletes accepted partial and labels sent input unsent

Location: src/renderer/src/features/provider/ProviderPanel.tsx:395-402 and 419-426. readTimeline returns null on stale read, failure result and exception at 150, 153 and 175.

The condition `!authoritative?.some(...)` is true both for a successful snapshot proving absence and for null, which means the authoritative state is unknown. Reproduction: a normal stream emits ALREADY_RECEIVED_FROM_PROVIDER, final persistence returns STORAGE_UNAVAILABLE, and the following timeline read also fails. The repair removes the entire captured request from the visible timeline, losing the already received partial, and displays ACTUALLY_SENT_INPUT as an unsent/unsaved draft. The request demonstrably ran because its delta was received. The same uncertainty also applies when an otherwise valid read is superseded by a later read/event.

Independent reviewer oracle failed with `expected null not to be null` for the received prefix. Existing final-write-failure coverage already establishes that a Provider request can have run while returning STORAGE_UNAVAILABLE; a subsequent unavailable read cannot prove otherwise.

Fix acceptance: distinguish successful presence, successful absence and unavailable/superseded read. Only positive proof of non-admission may move a request to a definitely-unsent draft. Unknown outcomes preserve available input, partial and identity with honest uncertainty; they must not imply that retry is safe or automatically retry. Preserve newer requests and accepted saved history during reconciliation.

### R2 — P2: successful explicit save falsely reports zero when trusted IDs were not refreshed

Location: src/renderer/src/features/provider/ProviderPanel.tsx:292-294, 307-308 and 317-324.

Reproduction: a temporary request completes successfully but its post-send timeline refresh fails. The visible rows therefore retain optimistic renderer UUIDs. Explicit save succeeds and returns the two real trusted message IDs with saved=true. Intersecting those IDs with the old UI unsaved IDs yields zero, so the UI claims “没有临时时间线消息被保存” while the returned rows show that both were saved. This is a direct consequence of the new ID-intersection counting rule, not a transport or persistence defect.

The independent oracle failed on the actual zero-save receipt. Fix acceptance: derive the receipt from actual trusted save information or a proven identity correlation; unknown/stale renderer IDs do not establish zero. When the number newly inserted cannot be established, an honest receipt stating the confirmed saved total is acceptable. Do not claim a zero/new insertion count without evidence. Preserve the original rejected-draft fix and duplicate-save idempotency. A narrow trusted/shared save-result DTO adjustment is permitted if necessary; renderer-provided body/history authority remains forbidden.

## Independent commands and results

- Exact Git HEAD/status and full repair delta read: HEAD matches above, initial clean. git diff --check 8421760..HEAD: exit 0.
- Original frozen review-ui.test.tsx via its external vitest.config.mjs: exit 0, 1 test. The original F1 reproduction is fixed.
- Original frozen review-stream.test.tsx via stream.config.mjs: exit 0, 1 test. The original F2 reproduction is fixed.
- npm exec vitest run tests/renderer tests/integration/timeline-service.test.ts: exit 0, 7 files / 25 tests, including 6 renderer files / 13 tests and 12 trusted timeline tests.
- New independent review-repair.test.tsx via repair.config.mjs: exit 1, 2 tests / 2 explicit product assertion failures, R1 and R2 above.
- Original reviewer report SHA-256 independently unchanged: 38399EF35CD24003CFA8167C7055E582D32C5101E4E1B2FC422B89BBC13DEB76. Its tracked archive is byte-identical.
- git diff --exit-code repair-baseline..HEAD -- src/main src/shared src/preload scripts package.json package-lock.json: exit 0, no differences. No new trusted/schema/IPC/transport/dependency behavior exists in this repair.

The previous independent full verify, populated-v2 migration/rollback and real Electron run remain applicable to unchanged trusted code. Previous run df964408-2b79-46dc-9ced-fc3c3faa7d54 used PIDs 59660/62500 and proved recovery calls 0 / subsequent explicit calls 1. They were not redundantly rerun for this renderer-only review. Static checks/build are executor-reported for this repair, not independently rerun after the new product failures made further qualification unnecessary.

## Reproducible reviewer artifact

Directory: C:/Users/30910/AppData/Local/Temp/mashiro-review-8421760-7fadd8f281e34a51a8e21b293b0b5712.

File: review-repair.test.tsx.
SHA-256: 42AD0A0C05CE0851EC77133E47E37D31D9E495EFC28E95B827B6737F9A2289BC.

Command from D:/Mashiro:

```text
node node_modules/vitest/vitest.mjs run --config C:/Users/30910/AppData/Local/Temp/mashiro-review-8421760-7fadd8f281e34a51a8e21b293b0b5712/repair.config.mjs
```

The R2 failure occurs at the forbidden false-zero receipt assertion. Its later exact two-message wording assertion is one admissible implementation, not a requirement to retain that exact phrasing; an honest authoritative saved-total receipt can use a correspondingly reviewed assertion. Do not weaken the essential false-zero/preservation oracles.

## Coverage and remaining boundary

The newly committed normal partial test covers mode switching, assistant switching and a delayed pending read after terminal event. Those paths pass independently. The original old security fixture's fixed wrong request ID was replaced with the actual captured ID and complete pair; its text-only/XSS assertions remain intact. This fixture correction is appropriate and not a test weakening.

Proposal/high-level headers now point to 005 and mark 004 historical, while preserving exact Provider qualification scope. F3 is closed. Current progress/task correctly remain review candidates; prior report remains immutable. No new security authority, dependency, schema or release scope is introduced. The unresolved defects are in UI state knowledge and save receipts, and require a coherent reconciliation correction rather than isolated optimistic-counter patches.

## Bounded repair / diagnostic handoff

Use this exact HEAD as the next repair baseline. Allowed scope: ProviderPanel and focused renderer tests, with the smallest justified shared/trusted save DTO or admission-result adjustment if a fresh diagnosis proves it necessary; narrow task/progress/design evidence updates only. Preserve all existing authority boundaries, message identities, no automatic retry, temporary non-persistence and transactional save semantics.

The coordinating agent has selected a fresh high-reasoning diagnoser/repair executor to choose a robust representation for known-present, known-absent and unknown state and an authoritative save receipt. Both new reviewer failures and both original frozen oracles must pass. Add tests for unavailable and superseded reads, accepted output preservation, stable/optimistic ID reconciliation, repeated save and newer-request isolation. If the same epistemic-state or counting failure persists through this second bounded repair, switch to formal route assessment rather than another local patch.

Next action: diagnosis and bounded repair, then independent exact-HEAD delta review. No product push before PASS. Existing user authorization for final reviewed main non-force synchronization remains valid and does not require a new per-SHA confirmation.

No paid/live calls, personal-data access, credential-source reads, Release or deployment occurred. PACKAGED/installer, multi-instance, full crash recovery and advanced Provider capabilities remain outside this evidence. Historical Toolhelp32 -003 remains failed/deferred/non-blocking and was not rerun or extended.