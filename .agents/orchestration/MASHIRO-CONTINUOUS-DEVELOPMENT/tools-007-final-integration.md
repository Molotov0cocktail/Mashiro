# 007 final repaired candidate integration

Date: 2026-09-06. Coordinator evidence, awaiting independent final verdict and exact candidate commit. Builds on [initial integration](tools-007-integrated-verification.md), [independent findings](tools-007-review-initial.md), and [UI repair](tools-007-ui-repair.md).

After product writers returned ownership, `npm test` passed 25 files / 162 tests, and typecheck passed. Final repository lint initially found 13 unused symbols in three newly authored independent test fixtures; Reviewer removed only unused imports/helper/parameters, documented [pre/post hashes](tools-007-review-lint-cleanup.md), and reran both valid original oracles successfully. No product or assertion changed in that cleanup. Resumed `npm run lint`, `npm run format:check`, `npm run build`, and `node scripts/electron-f1-harness.mjs` all exited 0. No redundant paid call or full-suite rerun was needed after fixture-only cleanup.

Final real Electron PIDs: 59208 / 84996. Recovery Provider calls: 0; explicit subsequent call: 1. Tool operation recovery, temporary protocol non-persistence, credentials, permissions, history query and selected context all passed. Archived [raw sanitized evidence](tools-007-final-electron-evidence.json) SHA-256: `53F5F31D6A85255290A162E544B18B18DA3472FAE6E769A4F004BD23BA1FB8D4`.

Source hashes at that actual build/run:

- ProviderService: `135CBC1973BCAE246607D04C19B64FD63BF77A9098102CEAE35E326CA3F26B3E`.
- Tool execution: `1EAA2D60D9C1E178ED9FCC1FFAB89AB2A12F2A7877757BA2CBA20D97D70F6D92`.
- Tool repository: `59B9F5BE4C28C4F0CD6E8A735C9CFCE6E89458D3B75CEF89B25F9159C8FE11D4`.
- Electron harness: `3791F4D2331D15BEF30EB28450A424FDD7F49B8A4BAA056A9378B490FC0BF601`.
- E2E controller: `1909C25A6C03C1BFC7921814FE7000E7083B334399015DC90A8CAF573B72F62C`.

Final foundation validation exited 0 after adding the planned 008 contract. Dependency inputs are unchanged from the successful zero-problem integrated dependency tree. Command logs: `test-results/tools-007-final-*`. Live product evidence remains the actual earlier two-request clock loop; the UI repair did not modify that branch. Normalized capability limitations, six total synthetic requests and available usage 1515 plus first-probe unknown usage remain unchanged.

Independent Reviewer will verify this evidence against the exact committed candidate; this document does not label itself PASS, predict a future SHA, or close the overall program. Installation-route experiments included in nearby documentation are separate evidence and do not qualify a final installer or release.
