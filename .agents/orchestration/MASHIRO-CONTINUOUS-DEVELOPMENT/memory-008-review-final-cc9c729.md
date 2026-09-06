# 008 independent final product review

Verdict: **PASS** for exact product `cc9c729cd5b65597049f988c41e3def97fcb0515`, independently queried on 2026-09-06. Reviewed baseline: `711463a9dd7fbcf16de73c413fe6ad0c56c311cc`. Parent before 008 was docs-only `a5041632c09aa3d421654e56a1e76c9e109147bf`.

Reviewer did not implement product code, commit, push, access credentials or make paid Provider calls. PROGRAM remains ACTIVE. This slice does not qualify complete physical cleanup, warehouse/background features, items/reminders, full backup/restore, packaged installation/update/uninstall, or release/download verification.

## Findings and repairs

All actionable product findings in [initial review](memory-008-review-initial.md), [intermediate graph regression](memory-008-review-repair-regression.md), and [manual retry review](memory-008-review-manual-retry.md) are closed.

- Actual history-search hits now join faithful-summary/inference sources and are rechecked before continuation/commit. An old source outside recent context cannot be forgotten by the derived memory's governance.
- Corrected current memory can resolve obsolete self-dependency back-edges while preserving original round/source withdrawal and permissions. Old-version history roots remain restricted. Only request-local trusted successful correction receipts allow the current active continuation exception; it is not a persisted history exemption.
- Graph traversal caches completion by source and current-memory ancestor context. The intermediate implementation's repeated dense-DAG traversal caused false PERMISSION_DENIED after only fifteen rounds; the independent counterexample now passes without raising the limit or relaxing source checks.
- The edit form freezes its record identity/version, preventing a delayed inspection of B from writing B's body into A. Event editing converts local input correctly and preserves unchanged instants, including subminute precision.
- Assistant-keyed components isolate late mutation display. A parent-owned, bounded memory-only pending-command registry keeps unresolved manual operation identity across remounts. Identical unresolved retries reuse the same trusted command; a positive receipt releases it. Strict temporary behavior and persistent-browser-storage boundaries are unchanged.

No assertions were weakened to accept these repairs. The remount oracle passes the parent-owned registry introduced by the repaired App, while retaining its one-accepted-identity expectation. Initial isolated reviewer fixture errors (describe closure and JSX configuration) were fixed before meaningful assertions. Full lint subsequently caught the registry's ref read during render; lazy useState now provides the same stable registry without disabling the rule.

## Independent verification

- Complete active suite: **28 files / 196 tests PASS**, generated report `test-results/memory-008-review-active-final.json`.
- Separate [trusted oracles](memory-008-review-oracles.test.ts) and [renderer oracles](memory-008-review-ui.test.tsx), using [isolated config](memory-008-review-vitest.config.ts): **7 tests PASS**. They cover searched-source withdrawal, correction recall plus preserved withdrawal, dense provenance DAG, wrong edit target, event instant, same-form lost-receipt retry, and remount identity.
- The only product delta after the complete test run and final Electron run was App's ref-to-state registry container. Independent focused revalidation: **2 product files / 10 tests PASS**, plus **4 renderer oracles PASS**. Final typecheck, full lint, format and build all passed; [raw final output](memory-008-review-static-v2.txt). The preceding lint failure is retained in [earlier output](memory-008-review-static-final.txt).
- Independent `npm ls --all` passed. Foundation validator passed with no warnings. Baseline-to-candidate diff whitespace checks passed. Scans of 250 then-current tracked/untracked repository entries found no runtime/generated/residual files; bounded credential-token patterns across source, tests, scripts, docs and orchestration artifacts found no matching files. These are scoped checks, not a claim of mathematically complete secret detection.
- [Reviewer source/validation snapshot](memory-008-review-verified-source.json), SHA-256 `B384AA5626DF092988AC9B7DA84AC9A2D43E59BE2CD47DB4F8920AF0B84034EE`: all **76** source/test/script files match the final working tree; product diff against exact candidate is empty. Package manifests/lockfile remain unchanged.

## Actual process and live evidence

Coordinator launched the fresh Electron harness; reviewer inspected its implementation, raw result and source hashes. [Electron evidence](memory-008-final-electron-evidence.json), SHA-256 `4A28AC9F6C860448DD66326F81A482D20835797492D9F816B964B50A1F0F627B`, has distinct PIDs **99292 / 7536**, run `54db278d-4470-492e-8e89-e826cd636bf8`, memory IPC lifecycle verified, temporary memory tools rejected, recovered operation identity, zero recovery calls and one explicit subsequent call. Committed JSON blob and working raw bytes independently match. Reviewer did not launch a duplicate lifecycle run.

The [Electron-tested source manifest](memory-008-final-source.json) differs from final bytes only in App's registry container. Its final SHA-256 is `B08E644AFEC27EC3E12012A68819BE07DDFD85833C1D2AE72BF54AC69910F4EE`; focused UI/static/build qualification covers that small delta. [Manifest v2](memory-008-final-source-v2.json) independently matches all 76 final files. The older Electron process is not claimed to have run later App bytes.

The [hard-kill runner/evidence](memory-008-hard-kill-evidence.json) supports actual Windows child termination at intent/file-temp/file-ready/before-commit/after-commit: uncommitted windows accept zero objects; committed state retains its receipt. This is not an electrical power-loss claim. Accepted Markdown files precede a SQLite transaction that commits accepted version, governance, command and tool receipt; orphan files do not become accepted on recovery.

The [real core-role run](memory-008-live-product.md) remains scoped to coordinator's default-transport synthetic natural-language create, service reopen with zero calls, context-none search and accurate recall: **4 requests, 8246 observed tokens**. Its earlier failures and incomplete observer flags remain preserved. It is not renderer-driven live or final-release qualification; no new paid repeat was needed for local provenance/UI repairs.

## Commit and closing boundary

Six assistant channels and sandbox/preload invariants remain intact; new memory input/output DTOs are strict. Global/private read, write, inference and actual-endpoint receive remain distinct. Delete representation, withdrawal, source impact confirmation and suppression are separate; model parameters cannot provide local confirmation. Local user inspection does not itself authorize model access. Markdown file/hash inventory is an input to Q10 complete backup, not a delivered backup feature.

At exact-SHA inspection, the only untracked files were coordinator's two known docs preflight reports; no product drift existed. The added `.gitattributes` rule is narrowly limited to `memory-008-review-*.txt`, preserves text bytes going forward and excludes only their raw EOF blank-line check. Initial candidate blobs for four reviewer TXT outputs nevertheless contain LF while original working files contain CRLF; independent comparison proves their normalized contents identical. Coordinator then added docs-only commit `c6a3363bd923be7ad540ce7e0502fb35aa06bd6b`, without rewriting the candidate. Reviewer independently verified that its only four changed paths are those TXT outputs, each committed blob now exactly equals its original working bytes, and diff checks pass. Product source is unchanged. This archival correction is independently accepted and does not change the product PASS.

Coordinator may close 008 documentation, synchronize reviewed main non-force to both existing remotes, and continue the authorized remaining program queue. No repeat user approval is required within the recorded authorization.