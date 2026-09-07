# Task 017 renderer candidate v1

Status: **CANDIDATE — independent review pending**  
Model: `gpt-5.6-sol/high`  
Base HEAD: `a3550888d4d6d001f441fb73e806eef4729ca315`  
Manifest: `memory-017-ui-manifest-v1.json`

## Product result

Normal answers and historical answers now expose a default-collapsed “记忆来源与变更” panel bound to the real `assistantId`, `requestId`, mode and evidence generation. The panel pages `provided` and `changes` independently at 20 records per request, presents accepted-version details and real change receipts, distinguishes local preparation / dispatch started / response observed without claiming model adoption, and gives conservative wording for legacy recorded-only rounds. Temporary mode never starts a round-evidence read.

Users can open the existing memory inspection, correction, deletion and withdrawal flow directly from an evidence object without copying UUIDs. Obsolete versions expose no historical or current body substitution; when permitted, the user can deliberately open the current version with an explicit warning. User-facing copy states that model-received text can be a selection of at most 1000 characters while the detail view is the accepted version and is not a byte-for-byte outbound record.

## State ownership repair

Independent RED evidence found stale-body, delayed-response and target-replay gaps. The candidate now:

- keys rendered evidence to route plus refresh generation, so a mismatched state is not rendered for even one frame;
- cancels queued reads before invocation and checks route ownership again before committing responses;
- invalidates evidence on assistant, mode, request, connection/binding generation, permission and successful memory-object mutation changes;
- invalidates inspection/editor continuations immediately while preserving an unsaved correction draft and avoiding replay of an old navigation nonce;
- binds navigation to assistant snapshot generation and clears it on permission-generation changes, including A→B→A and permission remount paths;
- advances the parent evidence epoch immediately after a successful mutation receipt, before any follow-up list or inspection read, and preserves that receipt if those reads stall.

## Verification

- Reviewer-owned boundary oracle, after the final product edit: 3 files / 9 tests passed locally. This is execution evidence, not a self-issued independent verdict.
- Author Task 017 tests: 1 file / 8 tests passed.
- Complete renderer suite before the final one-line permission-target repair: 40 files / 167 tests passed. The final delta is directly exercised by the post-edit reviewer permission-target test.
- `tsconfig.web.json` typecheck passed after the final edit.
- Exact candidate ESLint passed with zero warnings after the final edit.
- Exact seven-file Prettier check passed after the final edit.

The renderer candidate is uncommitted and unpushed. Trusted main/shared/preload/data/reminder files and global progress documents were not edited by this executor.
