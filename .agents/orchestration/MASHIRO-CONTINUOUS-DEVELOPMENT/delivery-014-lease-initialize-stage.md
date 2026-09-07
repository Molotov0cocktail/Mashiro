# 014 ownership and explicit initialization — root implementation stage

2026-09-07. Product baseline 95db9cfa93673ff6975ddb75ccba56b2d0264828; docs HEAD 01a4d8c68dcad371d1bf6f0779d058e5b2fa39fe was pushed and actually checked at both existing remotes. Root owns these data modules while the steward trusted/UI agents write separate domains. This is unreviewed implementation, not production-startup or packaged acceptance.

## Actual route evidence

[Synthetic Windows named-pipe experiment](delivery-014-lock-spike.mjs) and [result](delivery-014-lock-spike-result.json), tool chunk 22ae2f: host Node 24.18.0, first PID 149072 acquired; a second hidden owned process received EADDRINUSE; after terminating the first owned process, PID 152768 acquired the same pipe. The pipe exposes no business operation or data and uses a random qualification identity. No real dataset, registration or Provider was accessed. This establishes the OS exclusion/crash-release route on the host Node runtime; it is not yet a packaged Electron qualification. Later import-only fixes explicitly name Node process/timers/URL for scoped lint, without changing the executed mechanism.

## Candidate behavior

- production-lease.ts derives a local pipe identity from the validated canonical Windows data directory. Same-directory/case aliases exclude a second writer; independent directories remain independent. Release is idempotent. Unexpected loss invokes a required trusted callback, which production integration must connect to stopping data writers. The pipe immediately closes clients and exposes no command API.
- production-location.ts only exports its existing canonical-directory validation for reuse; the prior bounded location guarantees otherwise remain.
- production-initialize.ts accepts only an explicitly selected empty directory, acquires ownership before the initializer can open SQLite, writes/fsyncs PREPARING, invokes the trusted full-schema initializer, checks the database header and unchanged manifest, then atomically finalizes READY. Success returns the still-held lease. Failed initialization preserves the partial database and marker and releases the lease. It removes only a temporary file successfully created with exclusive open; a colliding foreign file is never removed.

The initializer callback is responsible for actual schema/integrity verification and closing initialization connections. Current tests use real SQLite with a synthetic minimal schema; they do not claim the full production schema was initialized. Explicit native setup/recovery, configuration-lock crash recovery, production main integration, consistent backups/migration, installer lifecycle and release remain required.

## Checks

[Lease and location tests](delivery-014-lease-tests-01.json): 3 files / 18 tests pass. [Initialization plus location/lease](delivery-014-initialize-tests-01.json): 4 files / 24 tests pass, start 09:39:19, 1.05 seconds. New assertions cover duplicate ownership, case aliases, release/reacquisition, distinct roots, junction rejection, nonempty directory preservation, partial initialization, invalid database output, finalization rename failure, and preserving a colliding file. Synthetic recursive cleanup checks the canonical OS-temp parent and exact owned prefix before removal.

Scoped strict NodeNext TypeScript, ESLint and Prettier for the five current source/test files passed, tool chunk 4b6858. Earlier scoped lint reported only the synthetic script's missing explicit URL import; it was corrected and scoped lint passed, chunk 45ac47. No full-suite claim is made while steward source is being actively implemented.

Current snapshot hashes (before any later ownership/bootstrap extensions):

| Path | SHA-256 |
| --- | --- |
| src/main/data/production-initialize.ts | A523370544BBB1DACA41BCDF77D3ACF0B87D80E3F1858C9A6CEDB0EC9E812DE5 |
| src/main/data/production-lease.ts | E9B9F2EEA14C0F519D888226FDA15709B40EAF573E30630FA7514E78734ED3D9 |
| src/main/data/production-location.ts | 8A8C07B6D374C50780165446A7BFA719F467EDDF348593A2874BDD6C550E250D |
| tests/unit/production-initialize.test.ts | 7C58BFC463498D786C4C8787B98B574D47879A663D543B47710687BC00858B2F |
| tests/unit/production-lease.test.ts | 4632D774170E6803524AF686FEB1EDDA4C498FE14C9A85BCB45263E7199E2610 |

## Configuration-lock recovery addition

The subsequent ownership capability is registered in a private WeakMap only after the actual OS lease is acquired. Forged/copied, released and wrong-directory tokens cannot clear a configuration lock. Under current configuration ownership, production-location-lock.ts removes only the exact empty reserved directory; nonempty directories and links are preserved. [Five-file verification](delivery-014-location-lock-tests-01.json) passed 29 tests at 09:50:55 (1.32 seconds), tool b5c0f1. Seven-file scoped strict NodeNext TypeScript, lint and format passed, c07b39.

Current added/changed hashes: production-lease.ts BCB210E8FB3457975FE215C03AC025D4504B3319DF4970BFCC5ADF1009B2A4B5; production-location-lock.ts D49D068ABEEB634B9C542878DAC55F1284F35EFE2CF23C260456601D53752F9B; production-location-lock.test.ts 929405F970FC28730B99CDE52DDB887A1035D39119A9E3EA0006A885F05FBD01. Earlier table hashes remain historical snapshots.

The platform rejected new-agent creation and reuse of the historical reviewer with agent thread limit reached. The existing steward_013_ui agent, which did not implement these data modules, successfully resumed to perform independent review using its actual gpt-5.6-sol/high setting. Root independently reviews steward product implementation, which root did not write. No author self-test is promoted to an independent PASS.

Next: complete this independent foundation review and explicit bootstrap. Formal production integration, full-schema initialization, backups and actual packaged lifecycle remain unqualified. The continuous program remains ACTIVE.
