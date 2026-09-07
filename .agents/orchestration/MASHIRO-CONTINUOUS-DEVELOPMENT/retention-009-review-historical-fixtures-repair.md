# Historical independent fixture schema19 repair

2026-09-08. Parent assigned exactly two existing reviewer fixtures; no product file changed. The root's original `retention-009-root-integrated-01.json` failures remain preserved.

`production-governance-review014-independent.test.ts` now removes the newly introduced policy tables before constructing governed schema17, then expects the actual current version19. Store close is protected by finally. Session replacement, later committed tombstone, pending-token and damaged-ledger assertions remain intact. SHA256 `75E4577C14D276956220E2DD53CD20D4030F528962D994E4BB0674337009975F`.

`reminder-notification-schema-independent.test.ts` expects19 after successful migration. Its version14 collision/rollback and malformed notification-schema assertions remain intact. Raw/migrated database close is protected by finally to prevent assertion failures being masked by Windows cleanup errors. SHA256 `4A278AA816411BD7BADB5800B40EFA29D65BB73DCD8186C98533A8E048FC28A3`.

Independent focused execution: **2 files / 5 tests PASS**, exit0, [raw output](retention-009-review-historical-fixtures-run-01.json). Scoped ESLint and formatting passed. The initial standard patch helper failed before reading files; an exact newline-aware atomic replacement with preimage/postimage checks was used. An initial replacement attempt rejected a newline mismatch before mutation, then the corrected attempt succeeded.
