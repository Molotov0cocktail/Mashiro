# 014 independent integration seams — bounded observation

Date: 2026-09-07. PROGRAM ACTIVE; this is not the final governance, installer or release verdict.

Root independently inspected the credential revocation path and confirmed that only an absent marker permits protected-blob decryption; malformed, directory and dangling-link markers fail closed. The protected blob is retained. The user guide now distinguishes unusable revoked credentials from physical deletion and explains the need to provide a new Key.

Root updated its existing production-entry fixture to forward the new fifth migration-authorization callback. Only two lines changed; the original writer/locator/lease assertions remain. An initial CRLF-specific exact replacement failed before writing; two unique single-line replacements then succeeded.

The actual command ran `production-entry-independent.test.ts`, `production-governance-reminder-independent.test.ts` and `credential-revocation-boundary.test.ts`: 3 files, 7 tests passed, exit 0. Raw evidence: [delivery-014-root-seams-01.json](delivery-014-root-seams-01.json). It covers entry failure preservation, cancelled/handled/healthy reminder restoration, and revocation marker boundary cases. It does not establish a complete schema17-to18 installed upgrade or final governance acceptance.

A later scoped lint check identified `no-unsafe-finally` in the root reminder test cleanup. Root moved the unchanged absolute temporary-root and prefix checks into `cleanOwnedRoot`; no assertion or cleanup boundary was weakened. Scoped ESLint and Prettier checks both exited 0. The seven-test runtime evidence above predates this mechanical helper extraction; final integrated tests will cover the resulting candidate.

New 014 implementation remains under its author's single-writer ownership. A fresh independent reviewer must review the frozen final governance candidate. The separate 017 trusted candidate is already in fresh independent review; installer notification visibility, lifecycle verification and actual release remain pending.
