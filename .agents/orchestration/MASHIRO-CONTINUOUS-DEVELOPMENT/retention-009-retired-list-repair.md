# 009 permanent cleanup list/count repair candidate

2026-09-07. Executor repair_009_cleanup, actual gpt-6-astra / medium. Bounded REPAIR requested by root after static inspection; PROGRAM ACTIVE, independent review still required. Git HEAD remained `c000b7d9739589909a80ed8aac1d2b64a569a3bb`; existing uncommitted candidate and other authors' work preserved.

## Discriminating evidence

New `tests/integration/retention-retired-list.test.ts` constructs three private synthetic memories: one permanently emptied through RetentionService, one ordinary 009 trash object, and one 008 confirmed representation suppression. Before permanent cleanup, includeTrash returns all three. After its COMPLETED job, two recoverable objects should remain.

At 00:51:39 the unmodified product failed both tests: query returned three object IDs instead of two, and overview trash objects was 3 instead of 2. Vitest reported 2 failed tests; the enclosing PowerShell command ended 0 because a following Get-FileHash succeeded, so that wrapper status is not test success. This confirms a product defect in the ordinary list and zone count, not a reason to erase internal tombstones.

## Minimal repair and preserved behavior

- `MemoryService.query` now skips `retired(record.id)` regardless of includeTrash, before visible-record projection. It does not filter every suppressed object.
- `RetentionService.overview` performs its existing tombstone exclusion before incrementing zone.objects. Accepted byte accounting retains the same exclusion.
- Both tests now pass. They also verify that ordinary 009 trash and 008 suppressed trash remain listed, both can actually be restored, and inspect, safe old memory receipts, the internal tombstone and completed governance job remain available.
- The earlier canonical cleaned-version proof and old-job recovery repair are unchanged. No schema, safe-path validation, cleanup manifests, permissions, sources, assistant channels, UI, global docs, dependency or Git changes were made in this repair.

## Validation and exact files

Focused rerun at 00:52:38: six files / 56 tests PASS, 4.91 s, exit 0. Command: `node node_modules/vitest/vitest.mjs run tests/integration/retention-retired-list.test.ts tests/integration/retention-cleaned-identity.test.ts tests/integration/retention-009-review-oracles.test.ts tests/integration/retention-service.test.ts tests/integration/retention-adversarial.test.ts tests/integration/memory-service.test.ts`.

Trusted `tsc -p tsconfig.node.json --noEmit`, changed-file ESLint and changed-file Prettier each exited 0. No build, Electron, full-suite repeat, Provider call, real personal-data access, commit or push in this narrow repair. Root coordinates final integrated qualification and independent review.

| File | Preimage SHA-256 | Final SHA-256 |
| --- | --- | --- |
| src/main/memory/memory-service.ts | 63EDA8B71D10FF8630933B0DB9839E3505943D0E8F0FDEB371B6E13753DBCD73 | 542CA3D91B0CC57364604EEF3F8D1700B66BC3FDA446669F75D2EE9F210D5EBB |
| src/main/retention/retention-service.ts | 886BE7A6A355A6F8FB1D39954845F8305F524E5125723950F40282BE581E6634 | 04EFBD38822E1E39AB6E6358802F652D539316FB52FDDC3B781C9256B753819B |
| tests/integration/retention-retired-list.test.ts | new file | 40D1E4DDBFCC608DA62A3CDB71B6AAEF91C124B065241CC54560E000D7B765FF |

Previous repair tests remain `FBE7D7EA9596AA764451E72B3A92AC3E15BEAE94153549A9C9ADB9F02232DE2F`. Current reviewer oracle observed at handoff is `4EE43E4A2377BE9FD3CD278984C106B1DC7E8BBAC05DB8CC85004687607BDF8E`; root owns its intervening lint/format cleanup. This executor did not edit either file in this repair and does not call the current reviewer file the historical original byte sequence.

Existing-file edits used authorized fixed-target, SHA-preimage-checked deterministic single replacements, same-directory temporary files, File.Replace backups, postimage checks and rollback on mismatch. New files used apply_patch. Targeted residual check found no repair temporary/backup files. No destructive broad cleanup, permission changes, history rewrite or historical Toolhelp32 route.

Sole authored files in this repair: the two source files, the new retired-list test and this report. Write reservations are released at handoff. Next: independent review of this delta and root's final current-candidate build/Electron qualification. No change to RET, AST extra-private, Q9 or release-program open boundaries.
