# 014 Windows lease/location foundation — independent review R2

Date: 2026-09-07  
Reviewer: `/root/steward_013_ui`, actual `gpt-5.6-sol/high`  
Route: independent review and adversarial tests; this reviewer did not implement the reviewed production modules  
Observed repository HEAD: `01a4d8c68dcad371d1bf6f0779d058e5b2fa39fe`

## Verdict

**PASS for the exact lease/location/initialize/location-lock foundation candidate in [R2 manifest](delivery-014-lease-foundation-candidate-r2.json), SHA-256 `BE0E5750F07D61AAE13154ADEA3422DA6EDB9DC2A25930FDEDDEA6149711C1A4`.**

This closes R1 finding `R1-1` for this bounded foundation. It does not review the later `production-session` stage and does not qualify production startup integration, full-schema initialization, packaged Electron, installer/update/uninstall, backup/migration, or release behavior.

## R1 repair assessment

`ProductionLocationStore` now permits lease-free read-only `inspect()`, while `bind()` requires a supplied `ProductionLease` and validates the WeakMap-backed capability against the canonical configuration directory before creating `.location-write-lock` or any locator temporary file. `relocate()` ultimately passes through the same guarded bind path.

After atomic rename, a lock cleanup failure no longer changes the bind result into a false failure. The authoritative locator is returned, the exact empty reserved lock remains visible, and the current OS owner can clear it through `recoverProductionLocationLock`. Before rename, the primary bind failure remains the reported operation result; lock cleanup cannot overwrite it with a later `finally` exception.

The named-pipe lease continues to exclude a second owner for the canonical Windows directory. Because every public locator write now verifies that same lease, a process that can acquire recovery authority cannot race a live supported writer and remove its cooperative lock.

## Independent tests

Added `tests/unit/production-location-lease-review.test.ts` with four adversarial cases:

- missing, structurally forged, released, and wrong-directory leases perform zero locator or cooperative-lock writes;
- an active configuration owner excludes a second owner, so the second process cannot gain recovery authority over the active lock;
- lease-free relocation remains read-only and preserves the existing locator byte-for-byte;
- a precise `node:fs` `rmdirSync` fault after atomic commit leaves the return value and on-disk locator correct, after which the still-held authentic lease recovers the empty lock.

Final focused execution passed **6 files / 33 tests** in 1.51 seconds. This includes the prior 29 location, Windows path, initialization, lease and recovery cases plus the four independent R2 cases.

Scoped strict NodeNext TypeScript, ESLint and Prettier passed for the four reviewed production modules and six test files. The first scoped static run exposed `no-unsafe-finally` at the earlier direct throw in `production-location.ts` and one reviewer-test closure narrowing/format issue. Root removed the unsafe `finally` throw while preserving the primary operation outcome; the reviewer fixed only the independent test. All scoped checks then passed on the manifest hashes.

No product code was written by this reviewer. No real dataset, Provider, personal data, Electron packaging, installation lifecycle, commit, push or release action was performed. Task 014 and the continuous program remain active beyond this bounded PASS.
