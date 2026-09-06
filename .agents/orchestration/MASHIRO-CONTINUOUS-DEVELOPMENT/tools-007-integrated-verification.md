# 007 integrated candidate verification

Date: 2026-09-06. Coordinator verification, not an independent PASS. Product baseline `88a86a2dacc616ca3a6fa0ba63a345f059d88859`; intervening HEAD `e73fd7e56c37970579e04fcff618f5f77894d166` contains 006 closing documentation only. This report precedes the candidate commit and does not predict its own future SHA.

Both trusted and UI writers returned ownership before this verification. Core report: [candidate](tools-007-core-candidate.md); UI report: [candidate](tools-007-ui-candidate.md). All current product changes, including the final exact-limit history truncation correction, were present.

## Actual integrated commands

Using `D:\nodejs\npm.cmd`, each exited 0:

- `npm run test:focused`: 25 files / 157 tests.
- `npm test`: 25 files / 157 tests.
- `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build`.
- `node scripts/electron-f1-harness.mjs` against that build: fresh PIDs 71276 / 77272, run ID `dbb78aa3-40a9-459e-874e-2fe8b584cd74`, Electron 44.1.1 / embedded Node 24.19.0 / SQLite 3.53.3. Tool operation recovery, strict temporary non-persistence, history permissions/query and selected context passed. Recovery made zero Provider calls; the explicit subsequent send made one.
- `npm ls --all --json`: exit 0, zero dependency problems. An initial PowerShell `@($null).Count` display incorrectly printed one; inspecting the absent problems property corrected this display, with no dependency repair needed.
- Existing `validate_project_foundation.py D:\Mashiro --json`: exit 0, zero errors and warnings.
- Git diff whitespace, tracked generated/runtime files, high-confidence secret patterns and guarded-writer residual scans: zero findings. The first rg invocation omitted `-e` before a dash-leading pattern and did not execute a scan; corrected invocation completed with zero matches.

Raw command logs are under `test-results/tools-007-integrated-*`; foundation JSON is `test-results/tools-007-foundation.json`. Sanitized [Electron JSON](tools-007-electron-evidence.json) is archived unchanged, SHA-256 `550E29F5A93C5CBABB8B2C71430AB95464BD9C726ECB278530BC9B7D555AC1EC`.

## Test discovery and evidence integrity

Coordinator added `include: ['tests/**/*.test.{ts,tsx}']` to Vitest. Current product regressions remain in the 25 active files. Historical 006 reviewer snapshots retain their exact original bytes and fixtures in the orchestration archive; new mandatory API methods should not be retroactively inserted into those frozen historical snapshots. Independent 007 review uses its own explicit config/oracles. Reviewer must examine this discovery change and verify that active regression protection is retained; it is not permission to suppress failures.

## Actual live product boundary

Coordinator ran the [reviewed live script](tools-007-live-product.mjs), SHA-256 `B9701D326E0141A8A69E94F58651E80D31A83176FB27D7DCD97F9E94205DF985`, with a process-only authorized key. [Sanitized result](tools-007-live-product-result.json): two fixed-endpoint GLM requests, one actual clock operation, matching tool result, completed reply containing the exact tool UTC, usage 467 input / 54 completion / 521 total. No response/reasoning body or key was logged or persisted. Tool reasoning was absent, so preserved/interleaved thinking remains NOT_OBSERVED. This is a real ProviderService/default-transport flow, not a renderer-driven or cross-user-turn live test.

Program synthetic calls now total six (four earlier probe calls plus these two); available usage totals 1515, with the first probe usage still unknown rather than zero. No new private data, other project, release or final installer qualification is claimed. The independent reviewer decides candidate acceptance; the full program continues afterward.
