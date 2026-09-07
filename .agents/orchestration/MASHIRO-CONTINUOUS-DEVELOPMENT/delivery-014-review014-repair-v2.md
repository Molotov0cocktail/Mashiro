# 014 independent governance review — v2 REPAIR

Reviewer: review_014_governance, fresh gpt-6-astra / medium. Date: 2026-09-07. Production code remained read-only. Baseline supplied and checked against the working candidate: a3550888d4d6d001f441fb73e806eef4729ca315; previously reviewed product f04fe24 is not a verdict on this increment.

The [v2 manifest](delivery-014-governance-manifest-v2.json), SHA256 `603C3DFB5C00C6F32D9D6C5C57528ED7587003A419EA15F180F92C59DEBADF03`, contained 61 paths with zero independently observed hash mismatches. v1 differed only in the subsequently formatted credential vault. No release or installation verdict is given.

## Required repair R014-P1

A later Memory version barrier redacts the accepted object and Markdown but leaves the obsolete body in `protocol_segments.messages_json`. `redactGovernanceCopies` originally inspected operation rows and cleared matching operation/result payloads, without clearing their segment message copies. A search tool can also refer to a governed object only inside its persisted result, with no object ID in the operation arguments.

The independent [protocol oracle](../../../tests/integration/production-governance-review014-protocol.test.ts) uses actual AssistantService, MemoryService, ToolRepository and the production restore-governance application on an isolated snapshot-marked SQLite database. Both operation-reference and result-only-reference cases remain red with an explicit obsolete-body assertion. [First raw failure](delivery-014-review014-protocol-red-01.json); [expanded raw failure](delivery-014-review014-protocol-red-02.json). The expanded run is serial, five tests: three session/recovery tests passed and two protocol body tests failed. These are product assertion failures, not timeout diagnoses.

Repair the dependency chain before clearing identifiers: collect affected segments through operation records, persisted results and protocol messages; clear the affected complete protocol segment and its sibling operation/result body copies, preserving durable operation identity and terminal state. Keep unaffected segments and valid global/formal objects. Add result-only references and unaffected-segment preservation. Do not weaken the independent body and raw SQLite byte assertions. Freeze a new manifest before final review.

## Independent evidence already supported

- [Initial independent run](delivery-014-review014-independent-01.json): 10 files / 18 tests passed, covering mechanism, full restore, purge raw SQLite body scan, damaged source, portable backup, schema upgrade and credential markers.
- [New session oracles](../../../tests/integration/production-governance-review014-independent.test.ts): actual openProductionSession selects governed schema17, prepares schema18 with a new authorized instance, writes later governance and reopens successfully. A separate real-session reopen resolves persisted committed and absent rollback tokens. Damaged READY ledger blocks both maintenance and startup restoration; source, backup and locator stay byte-identical, and startup-copy snapshot marker keeps the failed destination unopenable.
- [Independent02](delivery-014-review014-independent-02.json) had 9 passes and one default timeout while root ran the whole repository concurrently. A bounded single-file diagnostic passed all three cases, with the IO-heavy dual-restore case taking 4.535 seconds. The expanded serial raw run above passes the same assertions. Its local test budget is now 15 seconds, not a product performance commitment.
- Trusted TypeScript passed with the new fixtures. Reviewer fixture lint identified a finally-throw cleanup style issue, to be corrected without changing the product oracle.

Credential review retained the approved non-destructive marker approach: encrypted blob stays untouched; any present/invalid marker rejects decryption, and only an explicit new persistent Key clears it. The prior automatic-review rejection of physical credential deletion was not bypassed. Fresh portable import can apply only governance present in its backup; loss of all later configuration-side knowledge cannot be reconstructed. Clarify this information limit in the user guide proportionately.

Verdict remains REPAIR until R014-P1 is closed against a newly frozen candidate. PROGRAM ACTIVE; actual packaged restoration, Windows lifecycle, overall acceptance and release/download validation remain separate required work.
