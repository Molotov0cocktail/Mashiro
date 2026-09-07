# 014 independent v4 review — bounded local candidate PASS

Date: 2026-09-07. Reviewer: fresh independent `review_014_governance`, actual gpt-6-astra / medium. Production files were read-only throughout this review. HEAD independently observed: `a3550888d4d6d001f441fb73e806eef4729ca315`; the previously reviewed product `f04fe24` was only the baseline, not inherited qualification.

**Verdict: PASS for this frozen local governance candidate and the bounded synthetic scenarios below.** This does not qualify unlimited metadata capacity, final packaged restoration, the complete Windows lifecycle, overall product acceptance or release/download verification. PROGRAM remains ACTIVE.

## Exact candidate and verification

[Manifest v4](delivery-014-governance-manifest-v4.json): 65 files, SHA256 `88F7055BC6171B3B1108DB715C09F565D8A5097DA1AE365C599392F29D14E237`. Every file was independently hashed before and after the final run: zero mismatches. This includes the latest user guide, schema18 dependency and the two original protocol/credential regression oracles. The additional [session/recovery oracle](../../../tests/integration/production-governance-review014-independent.test.ts) is separately reviewer-owned.

[Final raw test report](delivery-014-review014-final-v4-tests.json): **26 files / 65 tests, all passed**, one worker, process exit 0. The suite covers governance journal/connection mechanisms, real production sessions, restore and purge, portable import, damaged current source, permission/version barriers, reminder outcomes, credentials, preparation and consent boundaries. No concurrent root full suite was running. It includes all original reviewer regressions unchanged in their behavioral assertions.

Final static command output, recorded from tool chunk `c7b64e`:

```text
numTotalTestSuites: 26
numTotalTests: 65
numPassedTests: 65
numFailedTests: 0
success: true
Checking formatting...
All matched files use Prettier code style!
eslint: 0
prettier: 0
typescript: 0
manifestFiles: 65
hashMismatches: 0
```

ESLint covered the frozen TypeScript paths plus the extra reviewer session test; Prettier checked all 65 frozen paths plus that test; TypeScript used `tsc -p tsconfig.node.json --noEmit`. Full repository build, final Electron/native and installer verification remain with the program integrator.

## Independent findings closed

- **R014-P1, protocol body remnants:** [original repair](delivery-014-review014-repair-v2.md) and both raw red runs remain. The repaired code collects affected segments from operation records, persisted result bodies and segment messages before removing identifying evidence. It clears affected segment messages and sibling operation/result payloads while retaining durable operation identity/terminal state. Independent operation-reference and result-only-reference oracles now pass both message-content and raw SQLite byte checks. Healthy-segment preservation and normal global/formal preservation are covered in the final suite.
- **R014-P2, obsolete Key resurrection:** [original repair](delivery-014-review014-key-repair.md) and [raw red](delivery-014-review014-key-red-01.json) remain. A deleted Key followed by an explicitly saved replacement no longer authorizes an older backup blob. Older connection versions get a non-destructive revocation marker, the restored connection version is raised to the ledger floor, and subsequent explicit persistent-Key saving produces floor + 1. Unchanged healthy credentials still decrypt; ordinary connection edits conservatively require a newly supplied Key. Dominance validation no longer bypasses version/revocation requirements merely because a connection is disabled. The guide states this conservative rule accurately.

The reviewer additionally proved real `openProductionSession` selection of a governed schema17 dataset, actual prepare migration to schema18, later governed writes and a second real session reopen. Another oracle reopens persisted committed/rolled-back pending tokens and checks exact settlement. A corrupt READY journal blocks maintenance and startup restore, preserving original SQLite, backup and locator bytes; the failed startup copy retains its snapshot marker and cannot be selected as a normal dataset.

The earlier [independent02](delivery-014-review014-independent-02.json) default timeout is retained as failed historical evidence. It occurred during simultaneous whole-repository work; the isolated diagnostic and final serial run passed. The IO-heavy dual-restore oracle has a 15-second technical test budget, not a product latency promise. No historical Toolhelp32 audit was rerun.

## Explicit limits and continuation

- Governance initialization/import currently reads its seed through an **8MiB metadata limit**. `seedEntry` writes its seed before this read; oversize failure occurs before registry insertion, preserving the existing registry. Portable snapshot writing and backup do not share that limit, so a sufficiently large backup may be created yet fail import into a new configuration. This is a real current recovery-capacity boundary, not measured large-scale performance and not a RET-007 product decision. The integrator must address/validate it before overall delivery; this bounded PASS does not waive that work.
- A genuinely new configuration can apply only the governance carried by its verified backup. It cannot reconstruct later information that was lost along with the original configuration. Existing known-but-missing/damaged READY ledgers still fail closed; the guide now distinguishes these cases.
- Credential evidence used synthetic protectors and values only. The previously rejected physical blob deletion route was never attempted or bypassed. Markers preserve encrypted bytes and reject reads; only a newly supplied persistent Key clears the marker, while temporary Keys remain transient.
- No paid Provider request, real personal-data access, product edit, commit, push or release occurred in this review. All reviewer tool processes finished. Continue with the program's capacity issue, integrated UI/native qualification, Windows lifecycle and actual release verification; TASK_DONE is not PROGRAM_DONE.
