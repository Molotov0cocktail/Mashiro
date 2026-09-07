# 014 notification repair — independent final review

Verdict: **PASS, limited to the frozen source and synthetic service lifecycle**. Windows notification-center retention, actual display and installed cold activation remain **NOT_PROVEN**. This is not overall acceptance, installer acceptance, or release acceptance.

Reviewer: `accept_016_final`, actual `gpt-6-astra/medium`; no product implementation, Git mutation, Provider request, desktop or registry action. Date: 2026-09-07.

## Frozen scope and identity

Reviewed [candidate manifest](reminders-014-notification-manifest-v1.json), SHA256 `907D83B2599A2F10B8A18C927456F4C39BE2C21E3A9F68A8B1FFE00247B886C4`, against the exact diff from base `0a1a2e5f7f6da40d9e2795f32ffcd5aea47d4e3c`:

- `src/main/reminder/reminder-service.ts`: `C0CB5023CDD9F4CB0D45E6F42A6FBE0364FB1548381CB4FED99A53404AB8730E`.
- `tests/integration/reminder-service.test.ts`: `72E07A74E2BAF91E39CCD80CC2789ADD8CE1085C25071A170BB537BE7319E266`.

Both hashes matched before and after verification. No renderer, schema, IPC, native adapter or production shutdown caller changed.

## Independent evidence

The original [late-failure RED](review014-notification-late-failure-red.json) remains preserved. Its unchanged three-test oracle now passes: a same-version valid reminder can move from display observation to failure in both durable rows; stale show cannot reverse failure; completion remains cancelled. No automatic redispatch is introduced.

The separate [first lifecycle run](review014-lifecycle-first.json) recorded five passes and one failure: `recover()` still accessed closed SQLite after process stop. The author added the missing stop fence; the independent assertions were unchanged. The final three lifecycle tests prove repeated close does not call native close, old show/failed/click and scheduling/activation entries do not access closed SQLite, and completing the final member of a merged notice closes that notice exactly once. A `prepare` spy distinguishes a real database-access barrier from swallowed storage errors.

Final reviewer execution: **10 files / 59 tests passed, exit 0** in [raw test results](review014-notification-final-tests.json). This bounded set includes reminder service/tools, approved recovery defaults, durable notification groups, governance restoration, login compensation and trusted boundaries. It retains coverage for current permission checks, candidate rejection, rescheduling, cancellation, latest-per-item recovery and restarted group activation. These are local mocks and synthetic SQLite, not native notification evidence.

Node TypeScript, four-file ESLint with zero warnings, and four-file Prettier all exited 0. See [static results and final hashes](review014-notification-final-static.json) and [initial hashes](review014-notification-final-before.json). No full-suite rerun or build was performed by this reviewer.

Independent oracle identities:

- `tests/integration/review014-notification-late-failure.test.ts`: `AFA7774B0B7FC4718C99208D0C18D7FCC83754480B026A803028D7433C4394CB`.
- `tests/integration/review014-notification-lifecycle.test.ts`: `2909429617AFDA9E8F2A1C927360785F5C672F64CAD4AFEB4EAC950C11682167`.

## Production semantics review

Read-only caller inspection confirms `ProviderService.close()` stops reminders before closing its SQLite store; `index.ts` then stops the reminder runtime, which calls the same service close again. The idempotent stop therefore covers the actual existing sequence without caller changes. Stop invalidates native and timer callbacks before clearing timers and detaching runtime callbacks. It does not explicitly withdraw delivered notifications.

Business withdrawal still uses the unchanged `reconcile()` logic: one surviving valid member retains a shared native handle; the last invalid member withdraws it once. Formal reminders are not implicitly cancelled merely because an assistant loses tool authority: existing trusted permission checks continue to control new writes and pending confirmation, while already completed business operations require explicit reversal under detailed design section 8.4. No permission relaxation was found in this diff.

## Remaining actual-artifact evidence

The [earlier diagnosis](review014-notification-diagnosis-repair.md) remains the source for the reproduced defect and version-specific Electron findings. Removing explicit shutdown close proves only the application no longer deliberately withdraws the toast. It does not establish native process-exit retention or Windows visibility. Previous absence while the app was still running also cannot be explained solely by shutdown withdrawal.

Continue through the single native installer steward: pair reminder state with exact-app WinRT history metadata while running, verify retention after ordinary exit of the repaired artifact, then activate the retained notification from cold state and prove the original durable group opens once without redispatch. Preserve invalid/cancelled-member exclusion and distinguish app state from actual platform results. If the toast remains absent, continue native root-cause diagnosis; do not label the platform unsupported or reduce the cold-activation requirement on this evidence.

Overall 016 acceptance, the unanswered RET007 decision, installation lifecycle and actual release/download verification remain outside this limited PASS.
