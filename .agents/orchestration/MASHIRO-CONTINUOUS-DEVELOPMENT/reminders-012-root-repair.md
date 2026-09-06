# 012 coordinator repair after independent review

2026-09-07. The original author manifest and independent red evidence remain unchanged. [Independent stage REPAIR](reminders-012-review-stage-repair.md) found two confirmed defects. An attempt to restart the original author returned agent thread limit reached; root performed the bounded repair while the independent Reviewer retained product read-only ownership. The Reviewer was subsequently resumed successfully for independent revalidation.

## Changes

ItemService.saveItem now persists CANCELLED into each non-terminal reminder in the same item transaction when the item becomes completed/cancelled. Every existing full-edit/transition/confirmed replacement path uses this save point. Reopening the item does not revive that occurrence. Ordinary title or description edits still retain plans. ReminderService.reconcile removes invalid member mappings first and closes a shared native notification only if no valid member still refers to it. Its callbacks continue to recheck current state.

The [three-file repair manifest](reminders-012-root-repair-manifest.json) SHA256 A180E8D8B34215EBF767BC84D80742DD7B13D928E8AD4965855A4CBF181B9A71 includes ItemService, a new path beyond the author's32-file manifest. No schema or dependency changes.

## Validation and limits

Root reran the unchanged reviewer config/oracle:3/3 passed, including both previous failures. This is author-side revalidation, not an independent final PASS. Four permanent regression cases cover completed/cancelled then reopen between ticks, receipt failure rolling back both item and reminder state, and the last merged member plus old click.

[Trusted full suite](reminders-012-root-trusted-repair.raw.txt), SHA25619C939206373D16BB231A9E77B2D795EF2932E7A86101450A8BA8FEF8AFC101B, passed39files/253tests. Concurrent typecheck found the new rollback test called private readItem; product code was unchanged, and the test was corrected to the public inspect API. Final focused reminder service15/15, node TypeScript and exact three-file ESLint then passed. The full raw therefore precedes that final test-only correction; final whole-suite validation follows UI freeze.

UI author separately reports22files/105tests, typecheck and scoped lint/format, with F2/F3 covered; its final cleanup/manifest is pending. Final combined build/Electron and independent whole-candidate review remain required. Earlier native E2E02 is not silently relabelled as post-repair evidence. No additional paid Provider call was made.

## R3 follow-up: committed cross-service changes must reach the UI

Independent follow-up confirmed that the new ItemService SQL cancellation bypassed ReminderService's in-memory dirty flag, leaving a mounted reminder list stale. The service now compares an ordered persisted projection of reminder record_json and current item.version against the last successfully broadcast state. Construction reads no clock; query cannot consume a change; same-state ticks do not rebroadcast, and force settings notifications update the same snapshot. A permanent regression verifies one cancellation event followed by no duplicate.

Final [R3 three-file manifest](reminders-012-root-repair-r3-manifest.json) SHA256348B2F0D752E6326F2B0413B97D0907EF7B9AAF7FD989C127F7625F6BC530391 supersedes the earlier repair manifest. Root focused16/16 and node typecheck passed. Reviewer independently reported the event oracle1/1 green, original3/3 green, and related4files34tests passing. Final UI/combined artifact review remains pending.
