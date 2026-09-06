# Independent 005 candidate review

VERDICT: REPAIR

Reviewer: timeline_reviewer, fresh independent gpt-6-astra, not involved in implementation.
Date: 2026-09-06. Mode: Review, using orchestrate-engineering-task review contract.
Baseline: f5aa9880828b2a0719b6b8c16d1e4e05c475dcd6.
Product commit: 6f9f33db032780128ef79aa97c1efdae2b68bf88.
Reviewed final candidate HEAD: 842176053489e2d3d90037d7b36a31ef6129c415.
Route: persistent-timeline-v1, candidate attempt 1.
Initial working tree/index: clean, independently queried. No product edits, commits or pushes by reviewer.

## Findings

### F1 — P2: rejected temporary input is discarded after a false save receipt

Location: src/renderer/src/features/provider/ProviderPanel.tsx:260, 271, 279-286; contributing send failure handling at 307-330 and 347-356. Trusted pre-admission rejection: src/main/provider/provider-service.ts:358.

With a binding but missing credential, submit a temporary message. The renderer clears the draft and creates two optimistic visible messages, while the trusted service returns CREDENTIAL_MISSING before creating any session messages. The UI retains these optimistic rows. Click “保存到此助手时间线”: trusted returns success with zero messages, but the UI replaces its rows with that empty array and claims “已将当前临时会话中 2 条尚未保存的消息保存到‘Alpha’的正常时间线”. The only visible copy of the user's input disappears, and nothing was saved. Other pre-admission failures can reach the same boundary.

Independent renderer oracle failed with the exact false two-message receipt. A separate real ProviderService oracle confirmed CREDENTIAL_MISSING, empty temporary and normal snapshots, successful empty save, and zero transport calls. Thus this is not based on a hypothetical mock response. Deriving the receipt from the old renderer count violates the explicit-save result contract.

Required correction: retain rejected input as an explicitly unsent/unsaved draft or another clearly recoverable representation, distinguish it from trusted session rows, reconcile actual accepted rows without erasing unsent user text, and report only the actual successful save result. Merely changing the receipt to zero while dropping the input is insufficient. Do not add renderer-supplied history authority or automatic Provider retries.

### F2 — P2: mode/assistant reread erases a normal stream's received prefix

Location: src/renderer/src/features/provider/ProviderPanel.tsx:126-136, with the mode/assistant read effect at 207-217. Trusted normal read: src/main/provider/provider-service.ts:293; src/main/provider/timeline-repository.ts:19-37.

During a normal stream, receive a prefix, switch to temporary and back to normal (the same issue applies to leaving and returning to an assistant). The normal snapshot reads the pending database placeholder, whose content remains empty until finalization/close. Line 136 replaces the live renderer transcript with this snapshot, erasing the prefix. Subsequent deltas append only their suffix until the final result repairs the display. This makes already received output disappear during a supported navigation flow.

Independent renderer oracle failed because RECEIVED_PARTIAL_MUST_REMAIN vanished after the third read. A real ProviderService oracle independently confirmed the normal snapshot is blank/pending while service memory holds the prefix, and that ordinary close correctly persists that prefix as interrupted. Disk recovery is sound; active UI reconciliation is defective.

Required correction: merge or preserve active response content by captured assistant/request/mode identity while retaining trusted message identity and metadata. Protect against stale reads, including reads racing terminal events/final responses, and do not retain a stale optimistic terminal status over a newer authoritative terminal state. Cover both mode switching and assistant switching/parallel response isolation.

### F3 — P3: authoritative design headers still describe 004 as awaiting review

Locations: doc/proposal.md:3-10 and doc/high-level-design.md:3-10.

These unchanged top-level sections still call themselves current, require independent/final docs review for 004, and describe SQLite as containing only connection/binding state. They conflict with the reconciled 004 final PASS and 005 candidate implementation. Apply a narrow current-header/005-link update and label the old 004 sections historical. Preserve their exact endpoint qualification limits and NOT RUN boundaries; no broad historical rewrite is required.

## Independent verification

- Exact HEAD and clean status queried using D:/Git/Git/cmd/git.exe with command-scoped safe.directory. Baseline-to-HEAD scope: 37 changed files. Product/package/transport boundaries and changed test assertions inspected; package.json, package-lock.json and chat-completions-transport.ts have no baseline differences.
- npm run verify: exit 0. Focused and full each 20 files / 80 tests; typecheck, lint, format, build and real Electron lifecycle all pass. Existing suite therefore does not catch F1/F2.
- Real Electron run df964408-2b79-46dc-9ced-fc3c3faa7d54: fresh main PIDs 59660 / 62500; Electron 44.1.1, Node 24.19.0, SQLite 3.53.3. Normal/saved temporary IDs/content recover; pending partial becomes interrupted; temporary session resets; actual persistent credential protection and restored credential use pass; recovery transport calls 0, subsequent explicit send calls 1. Output is in the ignored test-results/electron-f1.json from this independent run.
- npm ls --all --json: exit 0, no problems. Foundation validator: exit 0, ok=true, errors/warnings empty. git diff --check baseline..HEAD: exit 0.
- Scoped credential-pattern scan: zero matches (rg no-match exit 1). Tracked generated/runtime/credential file scan: zero. Scoped temporary/backup/reject residual scan: zero. These are bounded scans, not a proof that arbitrary secrets cannot exist.
- Relative markdown link target scan: 57 links checked. Current entry/task/report targets resolve. Seven relative links inside the byte-preserved relocated historical progress snapshot no longer resolve from that snapshot directory; their original doc/tasks base is evident. This does not block the current entry and does not justify rewriting preserved historical evidence. A separate explanatory link map can be added later if useful.
- Executor handoff SHA-256 independently matches 29120A202E78E4F421F833291F1DCDF7CE20B9B6B7D91F44A8A3BBD0E1D1B5B6. Archived 004 review/push/continuation hashes match reconciliation: C284C416AAE64E7D5E615BFA6D8C7D54E35425C7453A87E4FA5D8AE827714AA9 / D8B2C437671E7B442B5DF9E4901A8A78B2EB1E3C226A62EF554FCC06BA2075A7 / 559A30979F1E751AB1ADF1A5138F03D12A2839AC2EAD7B0F8798C1FFB4EB0B76.

### Additional reviewer-owned oracles

All are outside the repository in C:/Users/30910/AppData/Local/Temp/mashiro-review-8421760-7fadd8f281e34a51a8e21b293b0b5712. They use the real candidate renderer or service; only the renderer API fixture is mocked and its relevant service responses were separately reproduced.

- review-ui.test.tsx SHA-256 F77F966CDF845FD09F4A911CA51D0E5A0D1EDBEC86F63F1A7A5B3D5BEE1462CA. Run from D:/Mashiro: node node_modules/vitest/vitest.mjs run --config C:/Users/30910/AppData/Local/Temp/mashiro-review-8421760-7fadd8f281e34a51a8e21b293b0b5712/vitest.config.mjs. Exit 1, one product assertion failure for F1.
- review-stream.test.tsx SHA-256 8724A204E8CD3E06BD137E10F0E99D827CE0EC327D6158703ACA6F62325DC032. Same command with stream.config.mjs. Exit 1, one product assertion failure for F2.
- review-trusted.test.ts SHA-256 668C36399A36F4230ACEE78604AD1C89CFF18FBFFF6D906A3C036EF548151462. Same command with trusted.config.mjs. Exit 0, two independent real-service tests confirming the reproduction premises.

First isolated renderer attempt failed before importing tests because Vitest interpreted a C-drive absolute include under the D-drive root incorrectly. Setting the isolated config root to its own directory resolved this fixture/tool issue; the next run produced the product assertion failure. Default exec helper also failed before creating a process; legitimate escalated host execution worked. Neither tool issue is a product finding or a user gate.

## Acceptance and security coverage

Trusted normal storage, explicit-save atomicity/idempotency, pre-send save failure with zero calls, failed/cancelled/interrupted states, pending recovery, shutdown partial preservation, and no automatic resend all have independently passing oracles. Populated v2 migration and injected second-DDL failure rollback preserve assistant IDs/state/revisions, connections/bindings and independent decryptable vault bytes. Normal context selects at most 16 complete eligible pairs within 64,000 UTF-16 units including input; other-assistant and unsaved-temporary content is excluded. UI remains limited to the documented latest 100 messages; no pagination is promised by 005.

The explicit target-active-assistant interpretation is acceptable: trusted execution verifies that exact assistant is active and resolves enabled connection, binding/model and credential synchronously before transport; no renderer history, endpoint override or “authorized” assertion is accepted. Requiring equality to the global selected assistant would defeat the approved captured-target parallel/switching behavior. No privilege expansion to private business data is present. Connection/credential revocation and archive cancellation use the captured recipient/request. Six assistant IPC channels remain; two narrow timeline channels validate strict inputs/results. Sandbox/contextIsolation/nodeIntegration and the runtime Electron-only preload remain intact. Text uses React text rendering.

The old migration test updates remove the additive v3 table before emulating v1 and adjust the final version expectation; they preserve the previous identity and rollback assertions. Existing late-response tests now use synthetic read failure to retain their local transcript assumptions; they still test original routing but do not establish successful normal-read reconciliation, which explains the F2 gap. No test skip or lint suppression was introduced.

UI acceptance is incomplete for F1/F2. F3 is a narrow documentation consistency correction. The three findings fit the existing route and do not require a product decision or architectural replan.

## Bounded repair contract and next action

Repair baseline: exact candidate HEAD above. Allowed scope: ProviderPanel.tsx and focused renderer tests; a narrowly justified shared/trusted timeline adjustment only if needed for truthful synchronization; doc/proposal.md and doc/high-level-design.md current sections; current task/progress and sanitized repair evidence. No transport, dependency, broad schema or unrelated feature changes.

Required regression coverage: F1 missing-credential or disabled-connection rejection retains the submitted draft; save does not claim or discard unaccepted text; existing accepted temporary history still saves transactionally and repeated save remains idempotent; failure keeps unsaved state; pre-send storage failure causes zero calls. F2 normal stream navigation preserves all received text exactly once, same and other assistant requests remain isolated, and delayed reads cannot regress newer terminal content/status. Integrate equivalent repository tests without weakening prior assertions. Keep IDs/trusted authority and no automatic retries intact.

Run focused renderer/service tests and ordinary static checks; run the full product chain if trusted behavior, lifecycle, schema or IPC changes. Return precise repair HEAD/diff and results for independent delta review. The already-passing baseline migration/Electron qualification need not be repeatedly rerun for a renderer-only/docs repair without new risk. F1/F2 must be closed before any PASS. Final later docs-only closing changes receive proportionate fact/link/format review, not another full qualification.

No new live/paid calls, credential-source reads, personal data, Release or deployment occurred. Existing unchanged transport qualification is reused. PACKAGED/installer, multi-instance, full crash recovery and advanced Provider capabilities remain NOT RUN/out of scope. Historical Toolhelp32 -003 stays failed/deferred/non-blocking and was not rerun or extended. No remote push was attempted by reviewer; authorized non-force dual-remote synchronization follows an exact final independent PASS, without a new per-SHA approval request.