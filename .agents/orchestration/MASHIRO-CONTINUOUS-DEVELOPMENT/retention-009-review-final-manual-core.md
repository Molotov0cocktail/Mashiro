# 009 independent final review: MANUAL_CORE PASS

2026-09-07. Reviewer review_009, actual gpt-6-astra / medium; independent of the trusted and renderer implementations and all product repairs. Mode: high-risk Review under orchestrate-engineering-task. Verdict: **PASS for the frozen 009 MANUAL_CORE candidate and its honest missing-dependency rejection paths**. This is not whole-009 TASK_DONE, PROGRAM_DONE, packaged/install qualification or release approval evidence.

The product baseline is reviewed 008 `cc9c729cd5b65597049f988c41e3def97fcb0515`; observed docs HEAD is `c000b7d9739589909a80ed8aac1d2b64a569a3bb`, with uncommitted 009 product changes. The candidate is identified by its exact manifest, not by a future commit containing this report. Root may bind that unchanged candidate to a subsequent product commit without a self-referential report/commit loop.

## Exact candidate and independently executed checks

- [Reviewer manifest](retention-009-review-final-preimage.json), 102 source/test/script/package/config files, SHA-256 `3A263017FAD31CEE7C0ABFF32A4CC68CBA98DB2AFE3A3E958DE6E328C5508294`. Independent post-run comparison found **zero changed or missing files**.
- [Independent full-suite raw output](retention-009-review-final-tests.txt), SHA-256 `3EF70214F9D36555D2FF67F05CEECBDF0AC6BDE4F212CE7A599C04D23D6EB303`: **41 files / 255 tests PASS**, 00:55:27, duration 9.00 s. The shell was polled to final exit 0. This includes the two independent integration oracles, final retired-list repair and all renderer tests.
- Separate [original independent UI oracles](retention-009-review-ui-oracles.test.tsx) remain unchanged at SHA-256 `AB9D6B37FF331D02C07B4A4421A4F3FA1CEC5FC0D149696E5CA8BD3EA86C06B3`: **4/4 PASS**, 00:49:59, duration 1.52 s, explicit [review config](retention-009-review-ui.config.ts). The final source manifest matches those reviewed UI bytes. Additional independent renderer-only run was 15 files / 69 tests PASS at 00:50:21.
- Independently ran trusted TypeScript earlier in review and reviewer-test lint after its proportional cleanup; final complete static/build checks below were root-executed, not falsely attributed to this reviewer. Independent final `git diff --check` exited 0; existing LF/CRLF normalization warnings were not product failures.

## Product review and closed findings

Reviewed strict trusted retention DTOs/IPC and sender restriction; the original six assistant channels, sandbox settings and preload runtime boundary remain. Preview nonce/epoch/version binding and local confirmation preserve the distinction between a model-prepared intent and user authorization. Complete identities, scope expansion, retained objects and blockers remain visible; unconfigured automatic policy is explicit.

Reviewed suppression-before-cleanup, generation guards, exact SQL/Markdown/command/preview/protocol copies, owner-qualified round resources, old ambiguous cross-assistant round rejection, new duplicate zero-transport/atomic-write behavior, and retained-source recipient intersections. Independent suite includes shared/global and other-assistant private preservation, original withdrawal precedence, delayed Provider results, last-assistant restart/job management, quarantine interruption, ordinary file changes and unsafe path refusal. New model writes cannot accept a retired source, old command identity survives, and index rebuild does not revive cleared content.

All actual defects identified in this review are closed on the manifest:

1. [REPAIR 1](retention-009-review-repair-1.md): cleaning a private memory then purging its assistant created an empty-path file job that could never complete. The fix recognizes only canonical already-cleaned versions backed by prior done file/memory work, tombstone and original receipt evidence. Existing unpublished empty job resources recover narrowly without rewriting identity or relaxing safePath. The original failing oracle and 15 added adversarial cases independently passed; the final Electron sequence exercises the real lifecycle across processes.
2. [REPAIR 2](retention-009-review-repair-2.md): late AssistantPanel receipts restored a deleted private name in local UI. Request/operation/revision fences and rename-draft pruning now prevent that; trusted database resurrection was never alleged.
3. [REPAIR 3](retention-009-review-repair-3.md): empty-trash discarded selected memory identities in favor of an implicit timeline target. Explicit trash selection/version is now preserved, non-trash objects are excluded, and the first loaded page is not misrepresented as the whole trash zone.
4. [REPAIR 4](retention-009-review-repair-4.md): hidden late-success memory receipts released retry identity too soon. Only a current, presented successful result releases the digest; discarded late success retains a body-free identity. Ordinary visible success still allows a genuinely new creation with a new ID. The independent test established UI identity behavior; it did not claim an actual duplicate database row or Provider request.
5. [Final retired-list repair](retention-009-retired-list-repair.md): permanently cleared tombstones still appeared in ordinary includeTrash lists and counts. The final narrow filters remove those from daily lists/meters while preserving ordinary 009 trash, 008 suppressed trash, actual restoration, inspect, safe old receipts, jobs and internal tombstones. Independently reviewed both code changes and the discriminating tests; they pass in the final suite.

The initial concurrent-move oracle assumed both racing results must succeed. Evidence showed exactly one write, a safe STALE loser, and a stable subsequent receipt for the original ID. The overly strong assertion was corrected rather than misreported as data corruption. Reviewer-only cleanup/lint edits retained all product assertions and exact temporary-root validation; historical failure hashes remain in their reports.

## Final build, runtime and evidence checks

Read [root final validation](retention-009-final-validation.md), SHA-256 `A276274E3CF03F60A5250E6507F22FE8B3850EB89A8410E33F1A23BC0996C86B`. Root reports final typecheck, build, whole-repository lint/format and npm ls --all exit 0; prior foundation check was ok with zero warnings/errors for tasks 001–011, followed only by content changes. Scoped 274-file secret-pattern/residual scan found zero specified key/Bearer/temp/backup matches. These are finite checks, not proof against arbitrary secret encodings.

Independently verified [root build manifest](retention-009-final-build-preimage.json) SHA-256 `4251AD44E551DB0EB6535F578720AA72F2820482051F5547C8748420C6D4EC7F`; shared entries match the reviewer manifest with zero hash mismatch. Independently verified and read [Electron raw evidence](retention-009-final-electron-evidence.json), SHA-256 `02323C478EC05E0E8D7518012904A56EEF76F5CF02270D99559865D0227382C6`:

- Run `e0d07f95-902c-42c2-ab4e-bb1a12d38f8c`, fresh PIDs **99400 / 115408**, Electron 44.1.1 / Node 24.19.0 / SQLite 3.53.3, root execution exit 0.
- Real renderer DOM input and submit exercised the actual SHA-256 mutation registry and trusted persistence: enteredViaDom=true, exactly one added object, one receipt, version 1. Root retains this memoryUi evidence and copies the screenshot before guarded fixture cleanup.
- Completed prior memory cleanup job `c6bd5a37-5a8b-4df4-bc5f-38afe6268836` and assistant purge job `a3f7994f-56f2-480c-a093-1981dd8697c3` survive restart. Original history/selected-context/temporary/credential/operation/memory assertions were not weakened.
- Recovery transport calls **0**; explicit synthetic send **1**. No new live or paid Provider call is inferred.

The reviewer visually inspected the generated memory screenshot: Chinese top-level navigation and memory heading are readable. The screenshot stops above the created record; actual DOM assertions, not that screenshot, establish the below-fold creation result. This is not complete visual acceptance. view_image hit the known pre-read sandbox-helper failure; the same synthetic project image was read through the authorized host path, without a desktop capture.

## Scope retained for continuation

Manual zones, exact confirmed cleanup, narrow restoration rules, permanent assistant deletion in its approved original private chat/relationship/continuity scope, source retention and visible retryable jobs are qualified here. **RET-007 automatic parameters remain unanswered/UNCONFIGURED. Additional assistant-private user/event deletion remains blocked pending the user's scope decision. Real Q9 accepted chapter/summary/unfinished dependencies are not integrated; production original recycling honestly refuses missing evidence. Synthetic adapter tests do not qualify Q9.** Future items/proposals, complete backup/restore barriers, installation/update/uninstall, whole-product acceptance and actual release/download remain in the program queue.

No product, dependency, Git, Provider or private-data mutation by this reviewer. Reviewer authored only its isolated oracles and evidence. Unrelated distribution-notice preparation is not included in this product verdict. Root retains responsibility for candidate commit binding, authorized non-force remote synchronization, global coverage updates and continued program execution.
