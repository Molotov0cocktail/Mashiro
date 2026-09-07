# 018 independent old-round receipt review

Verdict: **PASS — limited source, local DOM and synthetic SQLite scope** for [candidate v1](memory-018-ui-manifest-v1.json). Reviewer: accept_016_final, assigned gpt-6-astra / medium, independent of all product implementation. Baseline/final observed HEAD is `99bf73d79c35b86973d65699b62cb91e49830edb`; the reviewed seven-file candidate is an uncommitted working-tree delta. Manifest SHA-256: `213D0A3ADFF3EE0ADA7B84E84BD91CF46E97B1513B8E08608C65FE9FA32B0135`.

This closes R016-01 in the [independent pre-acceptance report](review016-overall-preacceptance-repair.md) within the stated local scope. It does not approve final overall acceptance, installed Windows behavior, build/ASAR correspondence, release or PROGRAM_DONE. The original pre-repair RED and fixture timeout evidence remain unchanged.

## Independent final evidence

[Final bounded run](review018-final-focused.json): **10 files / 55 tests passed, exit 0**, one worker. The suite includes both original reviewer016 oracles, ten new reviewer018 adversarial UI oracles, three author tests, ProviderPanel tools/history regressions, RoundMemoryPanel and all three reviewer017 boundary files. This was a new reviewer execution after freeze, not a restatement of the author's run or a full-suite rerun.

[Final static and hashes](review018-final-static-hashes.json): independent Node and Web TypeScript each exited 0; ESLint on the candidate TypeScript and three reviewer-owned tests exited 0; read-only Prettier on all seven candidate files and three reviewer files exited 0. All seven manifest hashes matched before and after verification. The original two reviewer016 test hashes remain unchanged. Product diffs, both new components in full and the minimal CSS addition were read independently.

## Behavioral findings closed

- Browsing/searching an old interrupted round beyond the recent 384 receipts now provides a direct receipt control. Opening queries the existing strict API using original assistant/request identity and normal mode; the default 384 bound is unchanged. The original real DOM RED is green without changing its assertions.
- Actual SQLite creation of 386 operations, close/reopen and recovery still returns the original unknown operation by exact request ID; the independent persistence oracle remains green. No new runtime data was written into the repository.
- Pending memory confirmation uses the original confirmation ID and assistant. Repeated clicks while in flight invoke confirm once; a successful original receipt is displayed without model dispatch, memory-command reconstruction or an additional mutate call. The author cancellation case independently ran in the final suite.
- Unknown-result inspection performs a second read of the same original request, with zero confirm, mutate or Provider start calls.
- Wrong operation assistant or request identity rejects the whole scoped result. No misleading subset is shown.
- Assistant A→B→A and normal→temporary→normal discard late receipt reads and do not auto-reopen or reread the old target. Temporary mode has no old normal-round receipt entry.
- A permission evidence epoch immediately removes visible confirmation state. Actual history-read permission revocation discards a pending response containing formerly allowed citation excerpts.
- Cleanup removes the old round and rejects its late receipt. A confirmation completing after permission invalidation cannot repaint success or notify the old UI mutation callback.

The ten new reviewer oracles are in [review018-receipt-boundaries.test.tsx](../../../tests/renderer/review018-receipt-boundaries.test.tsx). They all passed on their first behavioral execution; no additional product RED was found in 018. A reviewer fixture's inferred boolean return was corrected using the exact TimelineApi query generic after the author reported a typecheck diagnostic; no assertion or runtime behavior changed. Its final independent typecheck passed. Reviewer writer backup files were precisely removed after final content-hash verification.

## Source and boundary assessment

OldRoundReceiptPanel owns bounded lazy read state, validates assistant/mode/operation request ownership and invalidates reads on collapse/unmount. HistoryContextPanel keys it by original assistant/request and ProviderPanel's assistant revision, binding, permission/memory evidence and retention generations. RoundToolReceiptPanel retains original confirmation identity, gates repeated in-flight confirmation and invalidates late confirmation continuations. Existing memory/item/reminder cards and labels are exported and reused; the earlier ToolExecutionPanel behavior was not rewritten.

The selected-round panel has explicit round identification, loading, failure, ownership rejection and empty states. Item proposal/update recovery, reminder confirmation, retention preview and source navigation preserve existing callback identities. Trusted permission/schema/storage APIs are unchanged. No SQL, path, credential, arbitrary network or broad IPC authority was added to the renderer; the six assistant channels are unaffected. Viewing or inspecting a receipt does not reconstruct a business command from its source text.

The author's earlier isolated RoundMemoryPanel empty-state failure remains described in the candidate report. No product fix weakened that assertion; this final independent run includes that file and passes. The old 5-second persistence-fixture timeout remains preserved as a technical fixture limit, not relabeled product success; only its documented per-test 20-second ceiling is used.

## Continuation

Root can integrate this exact candidate and run the required build/native checks proportionately; this reviewer intentionally did not overwrite the frozen build output while an internal schema18 installer was being prepared. That internal installer does not include 018 unless rebuilt from the integrated candidate.

016 still requires the actual RET-007 user decision, final artifact-level cross-domain/restart/governance evidence, installed schema15→18 migration/failure recovery/uninstall-reinstall protection, actual protected credential use, OS notification retention/click/cold activation and final login behavior. Final source/version/assets/third-party notices and actual release/download hashes remain outstanding. No new Provider call, credentials, personal data, installed-scene mutation, Git write, push or release occurred in this review. PROGRAM remains ACTIVE.
