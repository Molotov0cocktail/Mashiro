# 009 cleaned identity repair candidate

2026-09-07. Repair executor: repair_009_cleanup, actual gpt-6-astra / medium. Route: bounded REPAIR of the independent [REPAIR 1](retention-009-review-repair-1.md). PROGRAM ACTIVE; this is implementation evidence, not independent PASS or whole-009 completion.

Baseline/final Git HEAD remained `c000b7d9739589909a80ed8aac1d2b64a569a3bb`; pre-existing uncommitted 009 and concurrent UI/coordinator work preserved. Sole edits: `src/main/retention/retention-service.ts`, new `tests/integration/retention-cleaned-identity.test.ts`, this report. No dependencies, migration, other source files, global docs, Git mutation, Provider calls or personal-data access.

## Reproduction and first bad state

Original independent oracle SHA-256 `417234F43614C443520BD37D0396E3DD82B1A9DFD0B18B007B262678633713AB` ran unchanged at 00:10:39: 1 file, 1 passed / 1 failed, exit 1. Line 202 reproduced `FAILED_RETRYABLE / UNSAFE_PATH` after a completed withdrawal followed by assistant purge. Source preimage SHA-256 was `38F2EAABCD49995658FA24F87E5F21BED00FAF002E667F31E3B6DED6DF5BB8DA`.

The planner inserted the empty `memory_versions.file_name` created by successful SQL cleanup into a new file manifest. `safePath` correctly rejected it. New repair tests initially ran at 00:14:52: 15 tests, 4 failed / 11 passed, exit 1; failures distinguished repeated cleanup, prior memory item completion before whole-job completion, and old persisted empty resource reopening/explicit retry.

## Repair

- The planner skips only the canonical tuple `file_name=''`, `body_hash=SHA256('')`, `metadata_json='{}'` with a version-0 memory tombstone and independently persisted prior done memory item. Every file item of that prior job must be done, its original retention receipt must identify the job, and the tombstone epoch must not postdate that receipt.
- Whole-job COMPLETED is intentionally unnecessary: after the memory item is done, later SQL bookkeeping can fail without invalidating its completed physical cleanup. The final test injects a real `after-item-memory` fault, verifies FAILED_RETRYABLE/STORAGE_UNAVAILABLE, and then completes a second empty-trash action.
- For already persisted unpublished schema-7 empty resources, drain performs no file action only when the resource hash is exactly SHA256(''), the current job has associated memory items/empty versions, and every such version has the same proof from another job. Original job/resource/hash identity remains unchanged; the normal item completion transition marks it done. No migration or manifest rewriting is introduced.
- `safePath`, managed filename validation, quarantine, hashes for actual files, permission evaluation, retained sources and assistant purge scope are unchanged. Non-empty invalid paths always reach existing rejection. Empty values with absent/inconsistent evidence remain FAILED_RETRYABLE.

An intermediate test found that a new confirm recreates a missing tombstone. The guard was tightened to compare the original cleanup receipt epoch, preventing this new tombstone from serving as historical proof. The counterexample remains in the test suite and passes.

## Verification

- Final product source plus initial complete repair tests: `node node_modules/vitest/vitest.mjs run tests/unit tests/integration`, 00:17:13, 25 files / 184 tests PASS, 8.04 s, exit 0. This includes existing retention service/adversarial, permission, shared-source, Provider and migration coverage plus the unchanged independent oracle.
- The last edit strengthened only the interruption test from a synthetic job-state edit to the real existing fault hook. Final focused rerun at 00:18:59: `node node_modules/vitest/vitest.mjs run tests/integration/retention-cleaned-identity.test.ts tests/integration/retention-009-review-oracles.test.ts`, 2 files / 17 tests PASS, 2.72 s, exit 0.
- Trusted `tsc -p tsconfig.node.json --noEmit` passed; trusted ESLint passed while excluding the unchanged reviewer oracle's known two `no-unsafe-finally` issues, which root owns for later proportional cleanup. Final changed-file lint also passed. Changed source/tests Prettier passed; the final fault-test variant was formatted in its temporary file before atomic replacement.
- Fifteen new tests cover repeated withdrawal/empty-trash/delete-representation/purge; path/hash/metadata/tombstone/prior-item/prior-file evidence corruption; real late interruption; legacy empty resource restart and explicit retry; malformed resource, wrong hash, wrong metadata, absent association and absent independent proof.
- No build or Electron run in this repair slot. Earlier 23/167 and PIDs 113640/112668 apply to the pre-repair candidate only. Root must arrange current integrated verification and a reviewer who did not implement this repair.

## Exact bytes and handoff

Final source SHA-256: `886BE7A6A355A6F8FB1D39954845F8305F524E5125723950F40282BE581E6634`.

Final added tests SHA-256: `FBE7D7EA9596AA764451E72B3A92AC3E15BEAE94153549A9C9ADB9F02232DE2F`.

Independent oracle remained original SHA-256 `417234F43614C443520BD37D0396E3DD82B1A9DFD0B18B007B262678633713AB`. It was neither formatted nor edited.

Default process setup-refresh failed before execution; an existing-file apply_patch failed before reading its target, whose preimage was verified unchanged. Authorized require_escalated commands used fixed targets, exact SHA preimages, deterministic unique matches, same-directory temporary files, File.Replace backups, postimage checks and rollback on mismatch. Temporary/backup files from these edits were removed. New report creation uses apply_patch. No ACL, owner, safe.directory persistence, reset, force, history rewrite or historical Toolhelp32 route.

All three file write reservations are released after this report. Next: independent repair review and root's integrated qualification. RET automatic policy, extra assistant-private user/event semantics, real Q9 dependencies and the overall release program remain unresolved outside this repair scope.
