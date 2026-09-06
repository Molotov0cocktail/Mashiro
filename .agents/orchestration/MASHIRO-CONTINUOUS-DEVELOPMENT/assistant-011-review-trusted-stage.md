# 011 independent trusted-stage review

2026-09-07. Reviewer: review_011, gpt-6-astra / medium as assigned; no product implementation. Stage review only; final whole-candidate verdict remains pending UI freeze and integrated evidence.

## Candidate and scope

Baseline supplied: reviewed product ab11110a45c6ddb65bd114547225dd4e329bba11 and docs closure 4c044f9c269fa90ed7e9677a4603601268e343eb. No Git commands were run by this reviewer under the assigned restriction. Independently read AGENTS, orchestration skill plus modes/role-contracts, progress, 011 contract/actual plan and stage/live/root findings.

All 23 files matched the trusted-stage manifest at verification. Manifest SHA256: cefc6e77c4fa482f1ed5c8e1617a426154cea049db3cdad6329c2bd4b34b2282. This is not a future UI manifest or commit approval.

## Source conclusions

No additional trusted-stage blocking defect found. Reviewed strict rename/output schemas, NFC/LF/code-point bounds, optional-field compatibility, active/tombstone checks and transactional double CAS. Schema 8->9 adds only profile columns, verifies defaults/constraints with rolled-back probes and rolls back collisions. Provider captures a frozen profile once per request, counts escaped system content in normal/temporary budgets, leaves permission/tool scopes trusted, and composes old protocol context starting at its last user message; old system persona is not reintroduced.

Root F1 closure independently inspected: purgeAssistant clears persona and resets avatar in its existing purge transaction. Read original red and green evidence; reran the public purge oracle. F1 is closed for the trusted-stage candidate, subject to final manifest equality. Six assistant channels, strict IPC output validation, Zod-free preload channel runtime imports and sandbox/contextIsolation/nodeIntegration invariants remain intact.

## Independent machine evidence

Command: npx vitest run tests/integration/assistant-011-review-independent.test.ts tests/integration/assistant-profile.test.ts tests/integration/retention-service.test.ts tests/unit/assistant-contract.test.ts --maxWorkers=1

Exit 0; 4 files / 19 tests. 18 are author/regression tests independently rerun, not claimed as newly independent assertions. One new reviewer scenario uses actual services with fake transport: alternate A/B temporary sessions, hostile JSON-looking persona, then clear A persona; outgoing messages retain one current system profile, preserve A session, exclude B session/profile and exclude A old profile, with no tools enabled. It passed on first execution; no independent red run is claimed, and no product was mutated to manufacture a red.

[Original reviewer test](assistant-011-review-independent.test.ts.txt), SHA256 7737ecd07c8128a6a6f5f2394d8370ac9dd13a6f0776cb944b6e6f0a4c5e4ecd. [Raw tool command output](assistant-011-review-trusted-run.txt). Test source archived byte-identically before its exact active test path was removed. Synthetic fixture cleanup completed in finally. Reviewer did not run full/build/Electron, credential access, paid calls or Git.

The two-request live role increment was inspected as service-only evidence; 402 tokens and same-process reopen do not prove UI or two fresh PIDs. No paid rerun is needed solely for this report.

## Unfrozen UI observations, sent to author/root

F2 ready-driven memory/item focus exists and late switch catch now checks request/governance versions. Two additional source-level risks require discriminating author evidence before freeze:
1. While noncurrent-assistant configuration switch is pending, main-tab selection does not invalidate the configuration navigation generation. A late resolution can override the user's newer tab; test deferred switch then tab then resolve/reject.
2. App reconstructs ProviderPanel configurationFocus on every render; ProviderPanel effect depends on the object and retains the history request. A later parent render can replay history navigation and reset user-selected temporary mode. Test same nonce with a new prop object after choosing temporary. Consume focus once per nonce or equivalent if reproduced.

These are reported risks against an unfrozen UI, not a trusted-stage failure or final product PASS. Final review must inspect fixes/oracles, exact whole manifest, static/full/build/Electron and real navigation.

## Tooling and continuation

Default exec failed before process startup (setup refresh). Approved require_escalated was used for scoped reads/test execution. Initial apply_patch created the reviewer one-line file; later reads failed in helper. The reviewer then used exact one-line preimage and fixed path, sibling create-new temp plus rename and postimage hash. One syntactic typo was corrected under exact SHA/unique-match before the first test run; this is test preparation, not a failing product run. Incorrect guessed read paths were corrected by rg discovery; no files were modified by those failed reads.

Stage complete; await root followup with final candidate. PROGRAM remains ACTIVE through subsequent product and delivery tasks.
