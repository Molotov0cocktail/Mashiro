# 008 independent review — initial REPAIR

2026-09-06. Reviewer did not implement product changes. Reviewed baseline `711463a9dd7fbcf16de73c413fe6ad0c56c311cc`, current HEAD `a5041632c09aa3d421654e56a1e76c9e109147bf` plus uncommitted 008 product candidate. No commit, push or paid Provider calls by reviewer.

Verdict: **REPAIR**. This is an intermediate report, not final qualification. Program remains ACTIVE through documented functionality, overall acceptance and actual Windows release lifecycle.

## Findings

1. **P1 — history search provenance lost when creating derived memory.** ProviderService records history search hits as current round dependencies, but the following faithful-summary/inference mutation only used its user-round, initial context IDs and direct memory hits. A search hit older than recent context therefore disappeared from the accepted memory sources. Independent oracle created an old source and 18 filler rounds, searched the old source in an actual synthetic ProviderService tool chain, wrote a faithful summary, then inserted the exact source withdrawal governance state. The memory still recalled (1 rather than 0). Root received this issue and added providedHistory tracking; the same unchanged oracle now passes.
2. **P1 — correction can successfully commit an unusable version.** A creation round A depends on memory v1. A faithful correction using A as context saves v2 with source A; source closure reaches v1, which fails current-version equality forever. The direct self-source filter in MemoryService.apply does not remove the transitive self-dependency. Independent service oracle receives SUCCEEDED for v2 but zero recall, expected one. Repair must retain other source and withdrawal checks; blanket removal of round dependencies is unacceptable.
3. **P1 — editing a second record can overwrite the first.** MemoryPanel.editRecord(B) changes the form but submitWrite takes target/version from the old inspection(A) until asynchronous inspect(B) returns. Save remains enabled. Independent deferred-inspection renderer oracle observes mutate targeting A with B's content. CAS on A can validly succeed, causing wrong-object modification. Freeze form and target/version together and reject any mismatched or unavailable inspection.
4. **P2 — event time shifts when saving an unchanged record.** editRecord slices an ISO UTC timestamp into datetime-local; submitWrite parses that value in the host local zone. Independent renderer oracle on Asia/Shanghai changes 2026-09-06T08:00:00.000Z into 2026-09-06T00:00:00.000Z. Repair must preserve the original instant and precision when unchanged, and consistently convert edited local input.

Related static risk sent to root: MemoryPanel is not keyed by assistant in App, and late mutation handlers can call stale assistant loadRecords after an assistant switch, receiving a fresh readVersion and replacing the new assistant's display. Address through instance ownership or generation guards and deferred mutation regression.

## Evidence

- [Independent trusted oracles](memory-008-review-oracles.test.ts), [renderer oracles](memory-008-review-ui.test.tsx), [isolated config](memory-008-review-vitest.config.ts).
- [First persisted run](memory-008-review-initial-oracles.txt): 4 tests, history provenance PASS after root's first repair, other 3 FAIL. Initial history failure occurred before that repair and was delivered with exact location to root; do not call the persisted run an original 4-failure run.
- Reviewer fixture failures (missing describe closure, then isolated JSX configuration) were corrected before meaningful product assertions. They are fixture defects, not product findings.
- Existing Windows hard-kill runner and child were read: real child termination at intent/file-temp/file-ready/before-commit gives no accepted object and NOT_APPLIED; after-commit retains one accepted object and SUCCEEDED. This supports process-crash windows, not electrical power loss or final Electron qualification.
- Existing live evidence is synthetic default transport create/reopen/search with 4 requests, usage 8246, not renderer-driven or final product-SHA evidence. Reviewer made no paid calls and read no credential.

Final independent full suite/static/build, final fresh Electron evidence review and exact-SHA comparison remain pending repair.