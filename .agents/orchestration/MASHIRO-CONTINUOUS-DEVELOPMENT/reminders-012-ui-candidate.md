# Reminders 012 renderer candidate

Frozen renderer candidate for task 012. This handoff records the UI slice only; it is not an independent final PASS. Root owns the unified suite, build, Electron validation, documentation, commit, and release decisions.

## Product behavior

- Adds a first-class reminder center and reminder controls inside the current formal item detail. The item due date is shown as separate data and is never copied into a reminder.
- Shows the complete local date, offset-bearing instant, and IANA time zone. Repeated DST wall-clock times require an explicit offset choice; nonexistent times cannot be saved.
- Shows the trusted reminder states in Chinese, including scheduled, display observed, result unknown, failed, recovery pending, cancelled, and handled. A displayed notification is not described as read, handled, or added to a calendar.
- Notification navigation opens the reminder list for merged notifications and revalidates current assistant permissions plus the current formal item before opening one item.
- Conversation `prepare_reminder` output stays an unscheduled candidate until the user explicitly accepts it. The renderer rereads the trusted preview and compares item identity, item version, title, command, and mutation before confirmation.
- Runtime settings preserve `UNCONFIGURED`; no catch-up duration is guessed. The UI reports the tray-running promise, explicit-exit limit, notification support, and login-startup confirmation without changing Windows settings directly.

## Refresh and recovery barriers

- F2: same-version runtime refreshes preserve an unsaved catch-up draft and its error. A higher trusted version creates an explicit conflict that the user must load; a lower version cannot overwrite a successful configure receipt.
- F3: ordinary same-assistant refreshes do not invalidate an in-flight reminder mutation or runtime configuration. Their receipts remain scoped to the original operation and busy state is released. Assistant and item authority changes still fence late results; a late query from another assistant cannot overwrite the current UI.
- R4: an unknown reminder mutation result, including structured `STORAGE_UNAVAILABLE`, sets a ref-level write barrier before payload hashing. No create, reschedule, cancel, or handle command can be submitted until the original command reaches a trusted terminal result through the visible recovery action.
- R5: the selected DST instant must remain a member of the current candidates. Editing either the wall clock or time zone clears the previous choice, so an offset selected for an earlier wall clock cannot be reused silently.
- R6: conversation confirmation generation is tied to stable assistant and confirmation IDs. A same-candidate parent snapshot refresh merges state monotonically without dropping a deferred trusted receipt or leaving the button permanently busy.
- An explicit candidate rejection remains locally terminal after a trusted `CONFIRMED_NOT_APPLIED` receipt even if the post-confirm preview reread fails. It cannot expose another accept button or schedule a reminder.

## Verification

- Renderer suite: 22 files, 106 tests passed. Evidence: `reminders-012-ui-renderer-tests.raw.log`.
- TypeScript: `npm run typecheck` passed. Evidence: `reminders-012-ui-typecheck.raw.log`.
- Scoped ESLint over the nine TypeScript/TSX implementation and test files passed with no output. Evidence: the intentionally empty `reminders-012-ui-eslint.raw.log`.
- Scoped Prettier check over the ten-file manifest passed. Evidence: `reminders-012-ui-format.raw.log`.
- Independent Reviewer repair oracles R4, R5, and R6 each passed 1/1 in `reminders-012-review-ui-{unknown,dst,confirm}-green.raw.txt`; Reviewer reported R1-R6 closed at this frozen product hash.
- All renderer writer `.bak` and `.tmp` files were removed by exact path; the final residual count is zero.

The exact ten-file paths, SHA-256 values, byte counts, evidence hashes, and reviewer oracle paths are in `reminders-012-ui-manifest.json`. This slice did not run the build or Electron lifecycle harness; root started those checks after the product hash froze.
