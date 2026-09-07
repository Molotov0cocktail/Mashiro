# RET pre-freeze independent observations

2026-09-08, independent Astra/medium. Not a final RET verdict.

Real approved schema18 copy migration passed separately: [copy report](retention-009-review-real18-copy.md). Its production SqliteStore upgrade does not substitute for the governed prepare workflow's pre-migration baseline read.

An independent in-memory schema17 counterexample reproduced `no such table: retention_policy` in readGovernanceBaseline: [original RED](retention-009-review-legacy-baseline-run-01.json). The author's upgrade fixture had an unprotected raw database lifetime; cleanup EPERM obscured this earlier error. The reader now skips this newly introduced table only for versions below 19. The original unchanged counterexample, a new schema18-versus-schema19 missing-table oracle, and the two real governed upgrade tests independently passed: **3 files / 4 tests**, [green run](retention-009-review-legacy-baseline-run-02.json). Version19 missing policy still fails closed. Original failure remains preserved. This is a concrete compatibility repair, not a generic Windows retry workaround.

One proportional performance sample used 1000 production-accepted 4KiB bodies, total 4096000 bytes, in a new temporary database. Policy construction measured **353.4 ms**, snapshot **335.8 ms**, and one new accepted write with the production quota guard installed **248.0 ms**. [Raw test](retention-009-review-measurement-cost-run-01.json), [timing result](retention-009-review-measurement-cost-result.json). Seeding preceded guard installation; the measured write did not bypass it. This was a single warm-cache sample and no time threshold was asserted. It demonstrates observable synchronous cost, not an extrapolated 100MiB timing or final performance FAIL. The fixture is opt-in and skipped in ordinary suites.

All reviewer fixtures use synthetic or explicitly approved copied data. No product files were edited by the reviewer, no installed app was accessed, and no key was read or decrypted. Final candidate hashes and remaining RET functional boundaries are still pending.
