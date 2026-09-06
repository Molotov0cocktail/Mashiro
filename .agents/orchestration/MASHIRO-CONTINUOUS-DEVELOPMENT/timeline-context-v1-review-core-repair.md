# 006 independent trusted-core review checkpoint

Date: 2026-09-06. Role: independent Reviewer, not involved in implementation. Route: timeline-context-permissions-v1 / attempt 1. This is an interim trusted-core review; renderer and final candidate commit are not reviewed. No overall PASS is given.

Baseline: `fb268174e5b14848c5345e52cf6c88ed6c6e1a5d`. Documentary HEAD at review: `c03c5adb05aa5e237fab0f528a1f25ccbd4825ab`; product changes are uncommitted. Candidate evidence SHA-256 independently checked: `6326FB4B3CC9C3CB721104CB279C00A8DFBA53010FC94416C60440B6F210E0E2`.

## Finding and bounded repair

P2: cancellation loses to malformed late transport results. In `src/main/provider/provider-service.ts:566–572`, `transportResultError(result)` and the failed-status branch run before the aborted-signal decision. After history recipient permission is revoked and the signal is aborted, a non-cooperative transport resolving a completed result with invalid usage changes the persistent response to `failed`, although cancellation should remain authoritative. Existing partial content survives and late body does not leak; the defect concerns trustworthy cancellation state.

Independent reproduction: create a completed historical pair, grant read and recipient permission, start a streamed recent-context request and capture the actual outgoing messages. Confirm transport received exactly HISTORY / reply / REVOKE; emit ACCEPTED_PARTIAL; revoke recipient permission; assert signal aborted; emit LATE_BODY and resolve completed with promptTokens=-1. The persistent response is `failed` rather than expected `cancelled`. This is a direct failure of 006's late-output cancellation oracle.

Repair scope: ProviderService cancellation/result processing and focused implementation tests only. Give explicit cancellation/revocation precedence over untrusted late result validation; retain accepted partial and null usage. Preserve genuine delta-overflow LIMIT/failed behavior and normal malformed-result rejection. Add malformed late usage, oversized late body and rejected-transport coverage as appropriate. Do not weaken or edit the independent oracle. Re-run focused tests and the unchanged independent test before requesting final review. No architecture or permission policy change is needed.

## Independent evidence

- `node node_modules/vitest/vitest.mjs run tests/integration tests/unit`: exit 0; 15 files / 82 tests passed.
- `node node_modules/vitest/vitest.mjs run .agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/timeline-context-v1-review-independent.test.ts`: exit 1; 1 passed, 1 failed. Cancellation oracle failed at line 127: expected cancelled, actual failed, with identical ACCEPTED_PARTIAL.
- The second independent test passed: populated v3 upgrade failure rolled back version and history; persistent credential file bytes were unchanged; successful retry preserved those bytes and reopened service actually supplied the synthetic key to captured transport. The first post-upgrade request contained only current input, proving no implicit recipient grant.
- Independent test fixture setup was reused from the existing integration fixture; its two additional test bodies and assertions were authored by Reviewer. The independent file SHA-256 is `A05A8C2629E0A8F42366F7DCD6256698D6D6CFF90A218F5B2ADE8545CDF7EE1A`.

Reviewed actual source: schema v4 migration/rollback, history permission repository, query and selected/recent context SQL, ProviderService authority/recipient/credentials/gates, strict DTOs, timeline IPC, preload and new Electron harness checks. Default recipient deny, assistant-scoped grants, endpoint path fingerprint, per-assistant CAS, literal query, selected ownership/completion/budget checks and history-read gating are consistent with contract in reviewed code and passing tests. Existing runtime transport protocol is unchanged; no new live capability is claimed. Exactly six assistant channels and preload runtime-only Electron/channel constants are preserved.

Permanent deletion and cross-domain deletion suppression remain future program work; this slice does not implement those paths. Renderer integration, complete final diff, full verify and fresh two-PID Electron lifecycle remain NOT RUN by this Reviewer at this checkpoint. Historical Toolhelp32 failure was not rerun, no -004 created. Prior 005 UI observation evidence is not replaced by this interim review.

## Tool and scope record

Default exec helper failed before process creation; approved host execution worked. Initial apply_patch add succeeded, but subsequent update failed before reading target; preimage remained `49C46DF0E8B649A7C31AD37A602C72F64E97243166145BFA32489592719C10E4`. A fixed exact path, preimage guard, deterministic fixture-prefix extraction plus independent test bodies, sibling temporary, atomic File.Replace with backup and verified postimage wrote only the Reviewer test file. Backup was removed after verification. No product, existing tests or global task documents were edited by Reviewer. No commit, push, external Provider calls, private data access or release actions.

Next: implementation owner repairs the bounded finding; controller integrates renderer and produces an exact candidate commit. Resume this same independent Reviewer for repair verification, complete diff and appropriate full validation before the final single verdict. The project remains ACTIVE and task completion does not complete the release program.
