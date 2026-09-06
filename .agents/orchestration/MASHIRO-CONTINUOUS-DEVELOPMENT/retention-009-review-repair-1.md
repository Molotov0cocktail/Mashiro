# 009 independent review: REPAIR 1

2026-09-07. Reviewer: review_009, actual gpt-6-astra / medium; independent of implementation. Product baseline 008 cc9c729; docs HEAD c000b7d9739589909a80ed8aac1d2b64a569a3bb plus uncommitted 009 candidate. UI was still being finalized, so this is not a whole-candidate PASS. Program remains ACTIVE.

## P1: previously cleaned memory prevents assistant cleanup completion

Reproduced through real SQLite/MemoryService/RetentionService with synthetic data:

1. Create assistant A and one private continuity memory.
2. Confirm withdrawal; wait for its cleanup job to reach COMPLETED.
3. Preview and confirm permanent deletion of A. Preview has no blocker and confirmation succeeds.
4. A is removed from active identities, but the new job reaches FAILED_RETRYABLE / UNSAFE_PATH instead of COMPLETED.

`retention-service.ts` plan collects every memory_versions file_name, including the empty string written by cleanSql after prior completed cleanup. It creates a new file job item for that empty string. safePath correctly refuses it. Retrying cannot change this immutable job resource. Repeated cleanup/empty-trash of an already cleaned record has the same structural risk.

Repair: recognize already physically cleaned version identities while building manifests, or otherwise make these placeholder resources idempotently complete without weakening safePath. Preserve genuine unsafe-name rejection, stale-file protection and old job identity. Add coverage for cleanup then assistant purge, repeated empty-trash, and an ordinary malformed non-empty path remaining rejected. Also consider legacy/in-flight jobs containing the already emitted empty placeholder; this is currently an unpublished schema-7 candidate, so migration policy should be explicit.

Independent failure at `tests/integration/retention-009-review-oracles.test.ts:202`, test run 00:05:09, duration 1.20 s, exit 1:

```text
Test Files  1 failed (1)
Tests       1 failed | 1 passed (2)
Expected: { state: 'COMPLETED', error: null }
Received: { state: 'FAILED_RETRYABLE', error: 'UNSAFE_PATH' }
```

Oracle SHA-256 at failure: `417234F43614C443520BD37D0396E3DD82B1A9DFD0B18B007B262678633713AB`.

## Evidence already obtained

- Independently ran trusted suite: 23 files / 167 tests PASS, 23:59:07, duration 8.43 s, exit 0. This does not cover the new lifecycle counterexample.
- Independent oracle checked concurrent identical move: exactly one version increment; the concurrent loser returns STALE, and a subsequent identical command returns the successful receipt. Wrong nonce and permission changes leave zero deletion jobs. An initial assertion that both concurrent results must succeed was too strong and was corrected after confirming safe eventual identity; it is not reported as a product defect.
- Independent oracle passed online random-marker scan of memory objects/versions/commands/previews/index and retention previews/commands/jobs/items; rebuild does not revive the source, old command keeps identity, and a new model memory write using the retired source is refused without creating an object.
- Trusted TypeScript passed after reviewer-only test addition. Product files were not edited. No Provider request, build, Electron execution, commit, push, personal-data access or global-doc edit by this reviewer.
- Static App source-navigation/list late-result risk was sent to root/UI author for verification before UI freeze; no unproven disclosure is asserted.

Review scope remains MANUAL_CORE plus honest missing-dependency rejection. RET automatic policy, extra private user/event purge decision, real Q9 accepted-summary/unfinished dependencies and Q10 backup/install qualification remain outside this limited pass. No whole-009 or program completion claim.

The reviewer retains sole write ownership of its oracle until notified; trusted author may read/run it but should not edit it. All edits used fixed file scope; an existing-file apply_patch attempt failed before target read with helper setup-refresh, followed by authorized preimage-checked atomic replacement with backup/postimage checks. Synthetic temporary directory paths are verified before recursive cleanup.
