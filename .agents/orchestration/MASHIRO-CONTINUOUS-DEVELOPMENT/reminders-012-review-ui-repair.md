# 012 independent UI review — REPAIR

2026-09-07, gpt-6-astra / medium. UI had not yet frozen; product files remain author-owned. R1/R2/R3 trusted repair is independently green: original 3 oracles, event oracle 1, and focused reminder-service/reminder-tools/item-service/item-domain-oracles 4 files / 34 tests. R3 event green raw is retained separately.

## R4 — P1 unknown command identity bypass

ReminderPanel.mutate keys the registry by mutation payload. When a create call loses its receipt, editing the time changes that key and sends a new create before the previous operation is known. The original create may have committed, so this can duplicate plans and evade the stable-identity recovery contract.

[Independent UI oracle](reminders-012-review-ui-unknown.test.tsx) performs create, throws a synthetic lost receipt, changes time, clicks save again: API mutate is called twice rather than once. [Actual red output](reminders-012-review-ui-unknown-red-2.raw.txt). The preceding red.raw file is a Reviewer configuration failure (automatic JSX absent), not product evidence; config was corrected to explicit automatic JSX. Root also identified the structured STORAGE_UNAVAILABLE branch retains a command but fails to set unknownCommandId.

Repair requires a function-level pending identity barrier, including asynchronous digest/double-click windows, all unknown envelopes and transport throws. Resolve the original identity before any new mutation identity; RESULT_UNKNOWN or lookup failure remains blocked. Preserve assistant ownership and remount registry recovery, and ensure terminal recovery enables subsequent work.

## R5 — P2 obsolete DST offset choice

Create TimeEditor passes setWallClock directly, retaining chosenDueAt when the wall clock changes. dueAt uses that stale selection for any non-singleton candidate set, without checking membership. Selecting 2030-11-03 01:30 America/New_York UTC-04 then changing to 01:45 leaves save enabled and submits the prior 01:30 instant, while neither new radio is selected. A zero-candidate gap can similarly retain the stale instant.

[Independent DST oracle](reminders-012-review-ui-dst.test.tsx) and [red output](reminders-012-review-ui-dst-red.raw.txt) confirm the save button incorrectly remains enabled. Every wall-clock or zone change must clear the selection; dueAt must derive only from the current candidate set. Require a new explicit choice for overlap and block gaps.

Both findings were sent to the UI author and root. Author will repair products and permanent regression tests; Reviewer retains these independent oracles unchanged and will rerun them at freeze. No paid calls or native/packaged claims. Final acceptance awaits root candidate manifest and integrated verification.