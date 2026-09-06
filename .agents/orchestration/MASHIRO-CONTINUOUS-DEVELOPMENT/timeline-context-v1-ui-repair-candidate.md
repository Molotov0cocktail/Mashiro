# 006 UI repair candidate evidence

Date: 2026-09-06. Role: original UI Executor, bounded REPAIR. This report is candidate evidence for independent re-review, not a PASS verdict.

## Baseline and scope

- Candidate baseline and unchanged HEAD: `02fab34e462f9cf2444ee591c5519fb4f5667dea`.
- Repair input: `timeline-context-v1-review-ui-repair.md`, SHA-256 `4BB6A72065416C8B74309CBC092563B2DE3F79AF6A63D9AA74FC7B3F7556FB56`.
- Unchanged independent oracle: `timeline-context-v1-review-ui.test.tsx`, SHA-256 before and after `D8F82E1B9431BE816DCCE0D1060B6FA65E0FE7AB4CD481EFDAB1D1888DD69880`.
- Product/test write scope was limited to:
  - `src/renderer/src/features/provider/HistoryContextPanel.tsx`
  - `tests/renderer/ProviderPanel-history-context.test.tsx`
- No independent test, trusted code, ProviderPanel, global document, dependency, commit or remote was changed.

Other shared-worktree state belongs to parallel roles: `src/main/provider/timeline-repository.ts`, integrated/reviewer reports and `doc/tasks/007-provider-tools-execution.md`.

## Confirmed red state

Independent command:

`node node_modules/vitest/vitest.mjs run .agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/timeline-context-v1-review-ui.test.tsx`

Before repair: exit 1, 1 file, 2 tests, 2 failures.

- Expected literal query ` 空 格 `; received `空 格`.
- After successful `query: ''` / `nextCursor: 50`, failed `NEW_QUERY` search caused older-page request `NEW_QUERY / before: 50` instead of `'' / before: 50`.

Repository regressions were added before product repair. Command:

`node node_modules/vitest/vitest.mjs run tests/renderer/ProviderPanel-history-context.test.tsx`

Before repair: exit 1, 6 tests total, the two new tests failed at the same two assertions; the prior four tests passed.

## Repair

The repair is intentionally two semantic changes:

1. Search submit passes `view.draft` unchanged. Leading/trailing spaces and whitespace-only strings retain literal query meaning; empty string remains the all-history query.
2. Starting `loadHistory` now changes only pending UI state (`loading` and `error`). It no longer overwrites the committed `query`. A successful accepted result updates `query`, `messages` and `nextCursor` together. Rejected results, thrown errors and superseded/late results retain the prior successful triple.

Repository tests additionally exercise rejected search, thrown older-page loading and rejected clear-search. After each failure, displayed old messages and the successful cursor remain paired with the successful query. The next older-page request still sends `query: ''`, `before: 50`.

## Final verification

All commands below ran after the final test-only TypeScript correction.

- `node node_modules/vitest/vitest.mjs run .agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/timeline-context-v1-review-ui.test.tsx` — exit 0; 1 file / 2 tests.
- `node node_modules/vitest/vitest.mjs run tests/renderer` — exit 0; 7 files / 25 tests.
- `npm run typecheck` — exit 0; node and web TypeScript projects.
- `npm exec -- eslint src/renderer/src/features/provider/HistoryContextPanel.tsx tests/renderer/ProviderPanel-history-context.test.tsx --max-warnings=0` — exit 0.
- `npm exec -- prettier --check src/renderer/src/features/provider/HistoryContextPanel.tsx tests/renderer/ProviderPanel-history-context.test.tsx` — exit 0.
- `git diff --check -- <two owned files>` — no output.
- Focused credential-segment scan over both owned files — no matches (expected `rg` exit 1).
- Writer residue scan over both owned directories — no output.

Postimage hashes:

- `HistoryContextPanel.tsx`: `3BBF282EF108B042C108341AC1C5C6E55F5C6DD67C918768E331839394E48F65`.
- `ProviderPanel-history-context.test.tsx`: `5F974ED4A735922935D518F410B3821E0CEFD835973C8C0D0C97A83E62285023`.

## Tooling and external actions

`apply_patch` failed before reading the first target due to the known Windows sandbox setup-refresh error. The target hash remained unchanged. Writes then used the previously reviewed host route with fixed target allowlists, preimage SHA-256, deterministic exact replacements and expected counts, sibling temporary files, explicit same-directory rollback backup, atomic `.NET File.Replace`, postimage SHA-256 and residue checks.

No Provider call, credential use, dependency action, commit, push, tag, Release or installation action occurred.

## Handoff

The two bounded UI findings are repaired with unchanged independent assertions and repository regressions. Full integrated verification/build/Electron evidence and independent verdict remain with the coordinator and Reviewer. Program state remains ACTIVE beyond task 006.
