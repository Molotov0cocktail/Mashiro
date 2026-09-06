# 012 coordinator findings

2026-09-07. Ongoing implementation findings, not an independent final verdict.

## F1 real natural-language refusal and local-date mismatch

[First live diagnosis](reminders-012-live-diagnosis.md) preserved2HTTP200/zero candidate writes. Exact local replay identified whole-text negative-word rejection and UTC/local-date ambiguity. Author repaired complete-clause handling without authorizing negative/hypothetical/quoted reminder requests, supplied explicit-zone current local date, and proved known-not-applied only before business write with current storage evidence. [Original-sentence run2](reminders-012-live-product.md) passed2requests8810tokens, strict local tomorrow09:00, candidate zero schedules and idempotent confirmation. Status AUTHOR_AND_LIVE_CLOSED_PENDING_INDEPENDENT_REVIEW. Existing/unknown candidates must never be falsely marked not applied.

## F2 automatic refresh must preserve settings drafts and errors

Root read ReminderPanel.load calling setError('') and applyRuntime on every refresh. applyRuntime overwrote policyMode, window, merge and login settings even for the same runtime version. Trusted tick emitted changed every second without checking for change. This could erase an in-progress settings edit or a visible uncertain-result error. UI author was asked for same-version refresh/dirty-draft/error persistence and higher-version conflict tests, plus a real late-response assistant fence. The local policy beginsUNCONFIGURED; optional window-entry defaults are not a user decision aboutREM-002. Status AUTHOR_REPAIR_REQUESTED; no false claim of a reproduced test yet.

Trusted author was separately asked to emit changed only for actual observable changes, preserving periodic scheduler wakeups. This avoids unnecessary repeated full query/inspect work; UI still must be correct for manual or real concurrent refresh.

## F3 ordinary refresh must not orphan an in-flight mutation

Root read the load effect cleanup incrementing generation when refreshKey/load changes, while mutate finally clears busy only for the original generation. A same-assistant state refresh during a submitted mutation could therefore discard its receipt and leave controls busy. The assistant/item reset also needs an explicit busy lifecycle. UI author was asked for a deferred mutation plus same-assistant refreshKey oracle and late settings-result checks. Status AUTHOR_INVESTIGATION_REQUESTED; source finding only, not yet a reproduced failure.

## Other scoped decisions incorporated during implementation

Saved reminders survive ordinary item title/description edits and Provider credential loss; create/confirm CAS remains strict and completion/cancellation/deletion invalidate old dispatch. Merged notifications open a current reminder list rather than repeatedly navigating all items, and native activation duplicates go through one stable identity check. Reminder IPC is registered before renderer load. These are reviewed design corrections with author tests pending final review, not independent PASS.
