# Task 014 notification state and shutdown candidate v1

Status: **CANDIDATE — independent review pending**  
Model: `gpt-5.6-sol/high`  
HEAD observed at freeze: `0a1a2e5f7f6da40d9e2795f32ffcd5aea47d4e3c`  
Manifest: `reminders-014-notification-manifest-v1.json`

## State-machine repair

For an unchanged reminder identity and version whose item remains valid, a native `failed` event may now move `DISPLAY_OBSERVED` to `FAILED`. The existing `DISPATCHING` and `RESULT_UNKNOWN` settlement paths remain. A stale `show` cannot move `FAILED` back to display; cancelled, handled, expired, invalid-item and version-mismatched records remain protected. `FAILED` remains outside the scheduler's deliverable states, so the transition does not redispatch the reminder.

Both reminder and occurrence rows are still updated in the same existing store transaction. No schema, IPC, renderer, platform adapter or notification content changed.

## Process stop versus business withdrawal

`ReminderService.close()` is now the idempotent process-stop operation used by both the existing `ProviderService.close()` and reminder runtime stop path. It marks the service stopped and advances the callback generation before clearing timers. The following stop entries are fenced before any database work:

- delayed native `show`, `failed` and `click` callbacks captured by dispatch;
- the result-unknown settlement timer;
- scheduler `tick()` and startup `recover()`;
- activation through `activateGroup()` and `activateBatch()`;
- attempts to attach a new runtime after stop.

Process stop does not call the native notification handle's `close()`, so an already-dispatched Windows toast is not deliberately withdrawn during an ordinary exit. Business completion, cancellation, deletion, invalid membership and cleanup still run through `reconcile()`. Its existing shared-handle logic retains a merged notification while any member remains valid and closes it once after the last member retires.

Other business methods were not changed into hidden no-op successes; closed storage continues through their existing trusted error handling. ProviderService and runtime interfaces and shutdown ordering remain unchanged.

## Verification

- The unchanged independent transition and lifecycle oracles pass locally: 2 files / 6 tests. They include `DISPLAY_OBSERVED → FAILED`, no reverse transition, terminal cancellation protection, close followed by database close and late callbacks, and one-time withdrawal of a merged notification after its final valid member retires. This is execution evidence, not a self-issued independent verdict.
- The author reminder-service suite passes: 1 file / 18 tests.
- The bounded reminder regression passes: 11 files / 60 tests.
- Node TypeScript, exact scoped ESLint and exact two-file Prettier checks pass.

Actual Windows notification-center retention, visible display and cold activation remain unproven by this candidate and require the planned installed native verification. No desktop or native notification action, build, Git add, commit, checkout or push was run by this executor.
