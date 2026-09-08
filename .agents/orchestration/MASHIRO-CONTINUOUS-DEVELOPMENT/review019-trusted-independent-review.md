# 019 trusted-side independent review

Historical interim result: REPAIR pending the partial reminder-construction cleanup fix and final author manifest. This is a source/synthetic-test review, not a native startup or user-profile verification.

## Executed evidence

- `review019-early-startup-red-01.json`: original early runtime-path failure produced no visible diagnostic. Original index SHA256 79295A7657394173B644E3FC235550805A4AED9FE4F11851E4BAE4D8B6FF6172. The independent assertion was retained.
- `review019-window-load-red-01.json`: allocated window was not destroyed when loading rejected before returning its handle. Original create-window SHA256 D891F37940378E442A7CBA9CB537BC201AACC28E45EC05727B5D283C47B0508E. The raw test failed even though the enclosing command later completed formatting successfully.
- `review019-trusted-focused-01.json`: independent run, 7 files / 29 tests PASS. This includes both repaired original assertions, production-session creation/maintenance/CAS, selection confirmation, diagnostics and startup rollback.
- `review019-partial-cleanup-red-01.json`: 2 files / 4 tests, 2 PASS / 2 FAIL. Additional actual failures: security-handler installation outside the allocated-window try block; reminder recovery failure followed by tray destruction failure loses the incomplete-cleanup signal.
- `review019-partial-cleanup-green-01.json`: despite its prospective filename, the actual result is 5 files / 12 tests, 11 PASS / 1 FAIL. The window setup boundary is fixed; the reminder incomplete-cleanup assertion remains red. This file is not green evidence.
- Independent fixtures passed Node typecheck and scoped ESLint (fd105c). Their assertions use only mocked Electron and synthetic data, with no application launch or user-profile access.

## Narrow repair contract

Any post-allocation window setup/load/show failure must attempt local destruction before the factory returns. Destruction failure must carry `startupCleanup: FAILED`, preventing session release or recovery in an uncertain process. The current window implementation covers this.

If reminder startup fails before returning a runtime handle, detach failure must also carry this marker. Otherwise the main rollback has no handle to stop, falsely concludes COMPLETE and permits data recovery while an old shell resource may remain. Preserve the original error as internal cause; do not emit its arbitrary message in user diagnostics.

## Scope already inspected

The maintenance path serializes operations before awaiting preparation, rechecks ownership/quiescence and locator fingerprint, creates a distinct dataset identity with the production schema, preserves the previous database, and releases an uncommitted target lease on failure. Existing focused production-session tests were reused rather than duplicated. Diagnostics emit an allowlisted code, fixed stage and correlation ID, without arbitrary error text or private data. Final source hashes and one-time-selection acknowledgement coverage remain to be bound to the author's frozen candidate.

All original failures remain evidence. No conclusion here authorizes profile movement or claims that the user's actual startup cause is resolved.
## Frozen candidate conclusion — SOURCE LIMITED PASS

The remaining reminder rollback failure is repaired: the factory throws a fixed-code error carrying `startupCleanup: FAILED` when detachShell cannot confirm completion. The main startup cleanup consumes that marker before considering session release or recovery. Window setup, load and show are now inside the allocated-window cleanup boundary; destruction failure carries the same signal.

Frozen manifest: `post-release-data-startup-author-candidate-01.json`, SHA256 `DA5AEE7A22884DE75788D88F6B19705EFA7FCCDD95AD5F7BC3DD87CCA6934001`. Its actual contents are 11 product files, 9 listed author test files and 3 independent oracle files (23 total; the handoff's 8-author-test shorthand is inaccurate). All sizes and hashes matched before testing; all hashes matched again afterwards, with zero drift.

Independent final execution `review019-frozen-final-01.json` (6f6e37): 7 files / 29 tests PASS, including the original three reviewer fixtures without weakened assertions, startup rollback, reminder cleanup, production-session concurrency/CAS and selection acknowledgement. The existing-data test uses real synthetic production sessions: first explicit continue prompts once; reopening the same dataset invokes neither dialog; cancelling preserves locator/database bytes and creates no acknowledgement. Earlier independent 7-file / 29-test evidence also covers explicit fresh-ID maintenance and allowlisted diagnostics. Prior red results, including the misleadingly named interim green-01 file, remain failures in the historical section.

Final relevant product hashes:

- create-window: `06E78E8D95C57DDF1EE9CD98FBDAF10CF27797219DC1D0E29BBC477FCCBFAE68`
- index: `B7B32CCE6454C7CD23476ABE9E9E04EF3552AEF726636CF54CC15E9673B82171`
- reminder-runtime: `E90FD623A1E403815CBBF47160C9BFEA47938D6E0B3380201CE4CACF0C997554`
- production-session: `2A65B049A97EEBA0682FB948AFDAD9BF90226E71BBFE463F93181A1D78FE511E`

Independent oracle hashes:

- review019-early-startup.test.ts: `0AB43E5831A7C18C9853CA9FCEC70449B917E9D56EC12F492173B9A794A8CBB1`
- review019-window-load-cleanup.test.ts: `0DADAF5EBCD29500D95ADFAE12B62916410F4134E93BEE6AAABA2D3799E50215`
- review019-reminder-partial-cleanup.test.ts: `8C0FBD2830CA93DE35F244ACBE5F003E46046FC9A5AC64D2B29ACA5FC1C4A548`

No remaining blocker was found within this source/synthetic-test scope. This does not claim the user's historical Desktop-subfolder exception was reproduced or fixed, authorize further profile operations, or replace new artifact/native acceptance. Production data is retained and explicit choice is added; the implementation does not silently classify or delete existing contents as synthetic.
## Additional session-open diagnostic seam — REPAIR

A later bounded review found a gap not covered by the preceding SOURCE LIMITED PASS: production-bootstrap catches ordinary session-open failures, shows only generic text and returns null on Exit. Consequently main's failure handler never receives the original error. This affects the SESSION_PREPARE path, not the already repaired early/late startup paths.

Independent `tests/unit/review019-session-diagnostic.test.ts` (SHA256 `8ACD33F532C80198939A74093FF27F02B70E76FA0AFD9EC77A805EB9595BA1D7`) invokes the actual bootstrap with a synthetic session dependency throwing EACCES and a secret sentinel. The user chooses Exit. `review019-session-diagnostic-red-01.json`, command 7d138c, is 1 test FAIL: the displayed dialog has no SESSION_PREPARE stage. Static inspection also confirms this catch does not persist the diagnostic. Tested bootstrap SHA256 `F0A97C4FEC43B4A2463A6F2C053D6C435F21D6DF501E879ADD3F5921752068DD`. No real profile or database was opened.

Required narrow fix: classify and persist a safe diagnostic at this catch, include the same correlation ID and stage in the actionable existing dialog, retain ownership-loss propagation, and do not claim cleanup COMPLETE without evidence. The independent assertion additionally checks ACCESS_DENIED and excludes arbitrary secret error text from both dialog and file. Prior source conclusions and REDs remain historical evidence; final source qualification must include this seam.

Minor text finding: production-menu's current data detail contains a double-escaped newline before the uninstall explanation, displaying a literal backslash-n. This needs only a textual correction, not another mirrored test.
### Session-open repair verified — SOURCE LIMITED PASS restored

The same independent oracle passed unchanged in `review019-session-diagnostic-green-01.json` (8092b1, 1/1). Frozen bootstrap SHA256 `2C53883DC76AD5BDF7B377E5E52C04B0FE24D3D3C7C122EE31AE024022893EF9` now persists an allowlisted SESSION_PREPARE diagnostic and displays the matching correlation ID. Cleanup is explicitly NOT_STARTED, not an unsupported COMPLETE claim; ownership-loss propagation remains unchanged. Menu SHA256 `FAD662796166DA42C0C29C75F39DA735A9D27E9B3BA9AD42227C19DB32C6DDEF` corrects the literal newline. The original one-test RED remains valid historical evidence. This narrowly restores the source verdict for these two differences; all previously stated native/reproduction limitations remain.