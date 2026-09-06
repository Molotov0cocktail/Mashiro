# 012 independent trusted review — REPAIR

Reviewer: gpt-6-astra / medium, 2026-09-07. Product baseline 072dd39771e01b29bbced93f49e20a996f1e2cab; independently queried HEAD 6da9ee983ab6ffa51b77c4dd14c97ef10a142c49. UI was not frozen. This is a trusted-stage verdict, not final acceptance or PROGRAM_DONE.

The 32 entries in reminders-012-trusted-manifest.json matched actual file bytes before repair. Manifest SHA256: 594A6CE760D4B8F6624F3F227BFA479C0ADCC00BCF962B161F1024A8D14DA8C0. Parent owns subsequent product repairs; Reviewer changes no product files.

## Findings

- P1 / R1: Item completion or cancellation does not persistently invalidate schedules at the item transaction boundary. ReminderService.reconcile only observes the item's current status on a later query/tick. Completing and reopening an item before that observation revives the original schedule. Independent fixture created one reminder, transitioned item completed then open without a tick, advanced to due time and observed DISPLAY_OBSERVED; expected CANCELLED and zero notifications. Persist the invalidation together with the terminal item transition so reopen cannot erase it. Preserve reminders during ordinary title/description changes and preserve atomic rollback.
- P2 / R2: dispatch stores one shared batch notification under each occurrence key. reconcile closes that notification when any member is cancelled/rescheduled/completed, even if another member remains valid. Independent merged fixture cancelled one occurrence and observed shared notice.closed=true. Manage the notification as a batch, removing invalid membership but retaining the notification while a valid member remains; stale member callbacks must remain inert and final-member invalidation must close it. Do not create duplicate replacement delivery.

## Independent evidence

Command: D:/nodejs/node.exe node_modules/vitest/vitest.mjs run tests/integration/reminder-schema.test.ts tests/integration/reminder-service.test.ts tests/integration/reminder-tools.test.ts tests/unit/reminder-boundaries.test.ts — exit 0, 4 files / 22 tests.

[Independent oracle](reminders-012-review-oracle.test.ts), [config](reminders-012-review.config.mjs), [raw red output](reminders-012-review-oracle-red.raw.txt). Command: D:/nodejs/node.exe node_modules/vitest/vitest.mjs run --config .agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/reminders-012-review.config.mjs — exit 1, 2 failed / 1 passed. Fixture setup was reused from the author's service fixture; the three assertions/scenarios were authored independently. The passing new scenario proves after-show interruption without an observed show becomes RESULT_UNKNOWN after recovery, never replays automatically, and only explicit rescheduling creates another occurrence. Notification adapter is synthetic; no new native or paid claim.

## Covered boundaries and remaining work

Read AGENTS, orchestration skill/modes/role contracts, active progress/012 contract, shared contract and reminder design decisions. Inspected schema10 migration/collision rollback, strict trusted IPC input/output and sender validation, Zod-free preload runtime imports, unchanged six assistant channels, item source/recipient permission checks at candidate preparation and confirmation, stable command reservation, candidate zero-dispatch and unknown recovery, runtime/tray lifecycle and Windows adapter. UNCONFIGURED remains the unapproved default. Saved local reminders intentionally survive Provider key removal and origin assistant retirement; pending dialogue acceptance still checks current assistant/source/item permissions. Reminder proof contains source references, not copied private round bodies.

Existing native Electron evidence remains author evidence: two actual PIDs, observed Notification show, close-to-hide, same tray handler injection and persisted identity. OS mouse clicks, cold activation, packaged startup registration/installation remain NOT RUN; 014 must qualify those. Existing real Provider results are service-level synthetic evidence, not renderer/native evidence. No Reviewer paid calls, personal data access, Git mutations, build or E2E execution.

Next: parent repairs R1/R2, updates exact candidate scope/hash and tests; Reviewer reruns the unchanged independent oracles and reviews repair diff. Await UI freeze, then inspect final UI and root integrated verification before final verdict. REM-002 unresolved defaults cannot be silently approved and TASK_DONE cannot become PROGRAM_DONE.