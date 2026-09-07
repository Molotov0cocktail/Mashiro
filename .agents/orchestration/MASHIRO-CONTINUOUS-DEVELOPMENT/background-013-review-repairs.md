# 013 independent review — repair findings

Reviewer: independent gpt-6-astra / medium. Scope: first background chapter increment on docs baseline 815e778; not all Task 013 and not PROGRAM_DONE. Synthetic data only; no paid calls repeated. Parent owns product and Git. This report is a stage record, not final candidate PASS.

## R1 — background creation aborts unrelated normal response (repaired)

The repeated Electron 02/03 expected interrupted / actual cancelled is caused by BackgroundService.acceptCandidate → MemoryService.backgroundMutation → MemoryService.apply.changed(undefined) → ProviderService normal inflight AbortController loop. Neither chapter navigation nor BackgroundService.configure itself cancels that normal stream. The original diagnostic [oracle](background-013-review-cancellation.test.ts) and [raw](background-013-review-cancellation.raw.txt) assert the old abort behavior and passed 1/1. This is historical diagnosis, intentionally unsuitable for the final green aggregate after repair.

The initial fixture-reordering suggestion was superseded: automatic background creation interrupting a user's normal answer is a product regression. No E2E ordering or interrupted expectation should be weakened. The independent [non-interruption oracle](background-013-review-no-interruption.test.ts) failed at the expected non-aborted signal [before repair](background-013-review-no-interruption-red.raw.txt), and passed 1/1 [after repair](background-013-review-no-interruption-green.raw.txt). It also checks that subsequent explicit user correction still aborts the live response.

MemoryService author hash 854a86462b278cc7b54d4fccbc0d268e6d4ca0da8b2ee95ad703b173df3ac3b6 changed to 09BBEE120535594E86C061AD529095CE87223A1D16C43B082967A1646C344318. The narrow exemption requires trusted background origin, remember action, and no existing target. Update/removal/permission revocation barriers remain. Initial 27-file author manifest independently checked: only this known MemoryService repair differed at that observation.

## R2/R3 — assistant route busy state and stale chapter body (repaired)

[Independent UI oracles](background-013-review-ui-races.test.ts) reproduce pending A configure → B → old A response leaving B permanently busy; and pending body read → current chapter UNAVAILABLE → stale response displaying withdrawn body. [Valid pre-repair red evidence](background-013-review-ui-races-red-02.raw.txt) has two failures and no unhandled errors. Earlier red raw is retained but had missing Provider list and unedited-save fixture errors; it is not the decisive evidence.

Root repaired route generations/reset and cache identities tied to current chapter/accepted memory/version/hash/availability. [Post-repair evidence](background-013-review-ui-races-green.raw.txt) passes four checks, including additional A→B→A stale visit and already displayed body invalidation after accepted hash/version changes. Observed repaired BackgroundPanel hash 33C65907C9BD9292A99527F2930892A540E87CCCD158059E6FF389A6D50FD490; further R5 work may supersede this hash.

## R4 — pending item confirmation omitted from source completion (open)

roundSource blocks pending memory/reminder/retention state but omitted itemReceipt PENDING_CONFIRMATION. The [oracle](background-013-review-item-pending.test.ts) uses actual ToolRepository transitions PREPARED → DISPATCHING → SUCCEEDED and a closed complete tool-call/result protocol. A prepare_item_update receipt remains pending user confirmation; roundSource wrongly accepts it. [Valid red](background-013-review-item-pending-red-02.raw.txt). Initial raw failed due fixture skipping DISPATCHING and is retained separately. Repair should both block unresolved state and allow actual terminal outcomes, avoiding permanent exclusion through a historical pending receipt.

## R5 — dirty configuration silently rebased onto newer version (open)

The fifth UI oracle edits a v1 model draft, refreshes to concurrent v2 configuration, and observes configure sent with local draft + expectedVersion 2. This bypasses optimistic conflict detection. [Evidence](background-013-review-ui-races-config-red.raw.txt): 4 pass / 1 fail. Retain draft base version and explicitly resolve configuration conflicts instead of silently upgrading its expected version.

The native Electron and true Provider observations remain parent-owned evidence, not renderer-mock claims. Final product manifest, complete static/test/native results, and repaired findings are still required before scoped acceptance.

## Later independent observations

R5 is repaired: [five-oracle replay](background-013-review-ui-races-config-green.raw.txt) passed 5/5, followed by [six-oracle final UI run](background-013-review-ui-races-final.raw.txt) passing 6/6. The extra case receives a real structured STALE_WRITE, retains the local draft, explicitly reloads saved configuration, and then saves a newly edited draft using version 2. No automatic draft rebasing is accepted.

[Focused independent replay](background-013-review-focused.raw.txt) passed 6 files / 27 tests: background service, schema migration, transport max-token forwarding, BackgroundPanel, ProviderPanel chapter use, and App chapter navigation. This run preceded the R4 source-completion repair and cannot qualify its later hash.

[UI manifest observation](background-013-review-ui-manifest-observation.json) independently matched seven of nine author files. Only the known root-owned BackgroundPanel and styles repairs differed. Final aggregate manifest remains pending.

R4 now also has [real ItemService terminal oracles](background-013-review-item-terminal.test.ts): create item → real preview → pending ledger receipt → explicit accept/reject → terminal source eligibility. Both initially fail at the pending-source guard [here](background-013-review-item-terminal-initial.raw.txt). The final test additionally models an unknown authoritative business receipt after a closed confirmation and requires conservative blocking; final result is pending repair.

Electron05 was read as parent-owned actual process evidence: run faa81bf5-6e34-4a30-a2cd-f85752b14e8a, PIDs 149476/146916, same chapter/memory identity on restart, budgetCalls 1, both phases DOM read/select and verify DOM send, background transport counts 1/1. It preceded the final UI race repairs, so a later final hash-aligned run is required for final acceptance. Existing reminder OS-click/login/cold-activation boundaries remain unproven/unrun as labelled.

## Permanent regression promotion

Root explicitly authorized promotion of the green R1 and six UI race oracles into `tests/integration/background-no-interruption.test.ts` (SHA C49A84E62384EFC10753FFEC53F6724C7FD564318D2227CE33F59545AC2B3A07) and `tests/renderer/BackgroundPanel-races.test.tsx` (SHA E7D0B8C5C0476D18A804E48088C33CC68DA7C76DAF0CF4EA32E38271704C5E1B). Only import paths, erased ProviderApi type assertions, and Prettier layout differ from the archived oracles; assertions and asynchronous ordering are unchanged. [Default-config verification](background-013-review-promoted.raw.txt): 2 files / 7 tests PASS. Exact two-file lint and web TypeScript check exited 0. These files are now owned frozen reviewer contributions to the final product validation scope; original archived oracle bytes remain intact.

The in-progress item portion of R4 passed [three independent cases](background-013-review-item-stage-green.raw.txt): missing confirmation/command blocks; real accept and reject resolve the frozen receipt; an authoritative unknown receipt blocks again. Retention completion semantics still awaited author freeze at this stage.

The retention tool preview's original epoch is invalidated by subsequent protocol/timeline writes. This alone is not a broken user confirmation flow: ToolExecutionPanel explicitly sends only the stored intent to the retention page, explains that a fresh trusted preview is required, and RetentionPanel clears the old preview and asks the user to review anew. Root/reviewer agreed that only an old-epoch still-pending preview can be marked EXPIRED_INTENT_ONLY with no receipt. Closed state without exact proof must remain blocked; no new preview outcome may be attributed to the historical tool preview.

## R6 — concurrent rejection can lose to a late accepting recycle (open)

While auditing the actual retention confirmation proof write, the [independent race oracle](background-013-review-retention-race.test.ts) creates a real accepted chapter and an eligible recycle-original preview. Accept yields during actual file validation; a separate explicit reject commits CANCELLED; the delayed accept then incorrectly returns success and executes. [First valid RED](background-013-review-retention-race-red.raw.txt), expected accept.ok false, actual true. The fixture uses the existing synthetic background-service setup with unchanged production services and real temporary accepted files. No private data or network is involved.

The confirmation transaction must recheck that the same preview/assistant/nonce/manifest is still pending before any effects. Epoch alone is insufficient because a reject does not necessarily change it. Root assigned the existing trusted file owner to repair this and authorized promotion of the green oracle into a formal integration test afterward. The red archive remains intact.

## R4/R6 closure and final reviewer-owned freeze

The final positive independent oracle selection passed [5 files / 11 tests](background-013-review-final-oracles.raw.txt), excluding the deliberately historical old-abort diagnostic. The additional [proof oracle](background-013-review-retention-proof.test.ts) passed [1/1](background-013-review-retention-proof.raw.txt): current pending blocks; later actual unrelated accept does not overwrite earlier rejection proof; a trusted invalidated marker means not applied; replacing proof with another actual command ID fails exact intent-hash matching; legacy closed `{}` blocks; a synthetic SQLite failure updating the proof rolls back both receipt and preview mutation.

The invalidated marker has exactly one product writer, inside confirm's transaction, limited to other rows still pending. The current confirmed row gets its own versioned command/accept proof in the same transaction as its receipt. Earlier closed proofs are not overwritten. Therefore INVALIDATED_NOT_APPLIED is distinct from arbitrary closed/no-proof state. Source resolution reads exact preview and command identities, validates assistant/nonce/epoch/intent hash, and checks cleanup-job completion; it does not scan other commands to infer an outcome.

R6 is repaired by transaction-entry rechecking of pending preview identity and the exact manifest after the asynchronous file validation. The unchanged independent race now passes. Its green logic was promoted to `tests/integration/background-retention-race.test.ts`, with only import-path/unused-import/format adjustments. The no-interruption formal test additionally uses a type-erased non-null assertion for the injected transport AbortSignal; archived oracle runtime behavior is unchanged.

[Final default-config promoted tests plus business receipts](background-013-review-final-promoted.raw.txt): 4 files / 16 tests PASS. Three promoted files lint and Node TypeScript check exited 0. [Exact reviewer-owned file and repaired source hashes](background-013-review-repair-hashes.json) record the final freeze. The no-interruption hash there supersedes its earlier pre-type-fix hash.

R1–R6 have no remaining review blocker. Scoped candidate acceptance still awaits root final manifest and complete/static/native verification; no statement here marks all Task 013 or the continuous program complete.
