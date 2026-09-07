# 014 Windows data foundation — independent review R1

Date: 2026-09-07  
Reviewer: `/root/steward_013_ui`, actual `gpt-5.6-sol/high`  
Route: independent code review; this reviewer did not implement the reviewed data modules  
Repository HEAD observed: `01a4d8c68dcad371d1bf6f0779d058e5b2fa39fe`

## Candidate reviewed

| Path | SHA-256 |
| --- | --- |
| `src/main/data/production-location.ts` | `8A8C07B6D374C50780165446A7BFA719F467EDDF348593A2874BDD6C550E250D` |
| `src/main/data/production-lease.ts` | `BCB210E8FB3457975FE215C03AC025D4504B3319DF4970BFCC5ADF1009B2A4B5` |
| `src/main/data/production-initialize.ts` | `A523370544BBB1DACA41BCDF77D3ACF0B87D80E3F1858C9A6CEDB0EC9E812DE5` |
| `src/main/data/production-location-lock.ts` | `D49D068ABEEB634B9C542878DAC55F1284F35EFE2CF23C260456601D53752F9B` |
| `tests/unit/production-location.test.ts` | `8F004344AD19739182C9B765767C66DF6F1B2679CA29088F785986E0F5E01203` |
| `tests/unit/delivery-014-location-review.test.ts` | `3814BA61E396C0E64BEC4F87A0CFBB6F5B5D859E75041EC052B82AA06C977E59` |
| `tests/unit/production-lease.test.ts` | `4632D774170E6803524AF686FEB1EDDA4C498FE14C9A85BCB45263E7199E2610` |
| `tests/unit/production-initialize.test.ts` | `7C58BFC463498D786C4C8787B98B574D47879A663D543B47710687BC00858B2F` |
| `tests/unit/production-location-lock.test.ts` | `929405F970FC28730B99CDE52DDB887A1035D39119A9E3EA0006A885F05FBD01` |

The shared working tree also contained unrelated active Task 013 and Task 014 changes. Review conclusions apply only to the exact files and hashes above.

## Verification

- Focused Vitest: the five production location/location-review/lease/initialize/location-lock test files passed, **5 files / 29 tests**, 1.27 seconds, with `--maxWorkers=2`.
- Scoped ESLint passed.
- Scoped Prettier check passed.
- Scoped strict NodeNext TypeScript compilation passed.
- The reviewer inspected the Windows named-pipe ownership, canonical path validation, initialization ordering and failure preservation, and capability-token lock recovery paths. No packaged Electron, real production schema initialization, installer, update, uninstall, or release claim is made here.

## Blocking finding

### R1-1 — configuration writers are not required to hold the lease used to authorize lock recovery

Severity: blocking for this foundation slice. Verdict: **REPAIR**.

`ProductionLocationStore.bind()` creates `.location-write-lock` and commits the locator, but its signature has no `ProductionLease` and the method never calls `assertProductionLease`. `relocate()` delegates to the same unguarded method. In contrast, `recoverProductionLocationLock()` authorizes removal of an exact empty `.location-write-lock` solely by checking that its caller holds the OS lease for the configuration directory.

This permits the following valid use of the exported APIs:

1. Writer A enters `bind()` without an OS lease and creates the empty cooperative lock directory.
2. Process B acquires the configuration-directory OS lease because A does not hold it.
3. B calls `recoverProductionLocationLock()` and removes A's live lock as if it were abandoned.
4. A can still write and rename the locator. Its final `rmdirSync(lock)` can then throw after the locator was committed, returning failure for an operation whose persistent result changed.

The current implementation therefore does not establish the documented “under current configuration ownership” invariant at the write boundary. A future caller convention cannot make the exported low-level API safe against this sequence.

Required repair:

- Require a live, authentic `ProductionLease` for the configuration directory in `bind()` and `relocate()`, and verify it with `assertProductionLease` before creating the cooperative lock; or expose writes only through an equivalent coordinator that cannot bypass this check.
- Add an adversarial test that proves an active configuration writer and lock recovery cannot overlap through the public API.
- Add coverage for the post-rename cleanup race so a committed locator cannot be reported as an ordinary failed bind because another actor removed or altered its lock.
- Preserve the existing behavior for forged, copied, released, and wrong-directory tokens and for nonempty or linked lock paths.

## Non-blocking observations

Within the reviewed hashes, the remaining checked behavior matches the stage contract: canonical Windows directory checks reject UNC and reparse-point ancestors; initialization acquires ownership before writing, refuses nonempty directories, preserves PREPARING/partial output on failure, and finalizes READY only after the SQLite/header and manifest checks; the private WeakMap rejects structural or released lease imitations; exact nonempty and linked recovery targets are preserved.

This is an R1 repair verdict, not an independent PASS and not completion of Task 014 or the continuous program.
