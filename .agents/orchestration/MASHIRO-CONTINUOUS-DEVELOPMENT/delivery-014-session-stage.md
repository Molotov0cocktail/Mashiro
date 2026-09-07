# 014 explicit production session coordinator — unreviewed stage

2026-09-07, root implementation. This stage is separate from the lease/config-lock independent review and is not covered by its eventual PASS.

`src/main/data/production-session.ts` acquires the real configuration lease, recovers only its empty reserved lock, inspects the locator, and obtains the dataset lease before opening SQLite. A trusted selection callback distinguishes cancel, create, selecting an existing dataset and relocating the known UUID. Cancellation creates no default replacement. Only explicit create initializes a full `SqliteStore` schema and verifies integrity/foreign keys before the READY manifest and pointer commit. Existing-data preparation receives a cancellation signal and must implement the caller's verified backup/migration policy; a preparation failure must not change the old pointer. Ownership loss cancels preparation and rejects subsequent commit/return. Successful sessions retain both leases until application writers are closed and `release()` is awaited.

[Four tests](delivery-014-session-tests-01.json), tool66278d, passed: explicit real full-schema initialization with steward tables, same dataset reopening without a second prompt, cancelled first use/recovery preserving data and pointer, and two program configuration directories competing for the same dataset. Scoped strict NodeNext TypeScript and ESLint passed, tool437b45. No native dialog, production main integration, backup/migration implementation, packaged startup or installer claim is made. This module is not imported by production main yet.

The existing `ProductionLocationStore` bind/relocate lease repair is independently reviewed in a separate foundation report. Its original tests now acquire/release authentic leases without changing the existing behavioral assertions. Those fixture changes are not removal of previous acceptance conditions.

Next: independently review the session coordinator, implement trusted native setup/recovery and consistent full-data preparation, then integrate startup and actual packaged validation. Keep the program ACTIVE; this stage cannot end Task014 or the overall release program.
