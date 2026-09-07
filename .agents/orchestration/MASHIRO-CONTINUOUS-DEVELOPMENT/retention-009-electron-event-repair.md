# RET-007 Electron and status-event repair evidence

## Failures

- The first schema 19 Electron seed failed at the synthetic memory command: the persisted command was `NOT_APPLIED` because the startup capacity audit was still `UNKNOWN` after the preceding tombstone and permission transitions. The fixture now waits, with a bounded poll through the public retention policy API, for `audit.state === COMPLETE` before the capacity-increasing correction. Production fail-closed behavior is unchanged. The original evidence is `retention-009-root-electron-01.raw.txt`.
- The next isolated run completed the memory workflow but observed zero temporary messages before shutdown where the unchanged harness expected six. A read-only policy audit completion emitted the same event as real governance revocation, so ProviderService cleared sessions and aborted requests.

## Product repair

- Read-only audit/configuration progress uses `policy-status`. It remains visible to the UI without invoking the Provider revocation callback.
- App and ProviderPanel ignore `job-status` and `policy-status` for request/governance invalidation. A real cleanup with the same epoch is still consumed.
- RetentionPanel refreshes global policy status and preserves an unsaved policy draft during both audit and job progress.
- Actual expiry continues to revoke affected Provider state; the existing independent expiry oracle remains green.

## Verification

- Typecheck, focused ESLint, and focused Prettier: exit 0.
- Focused author/independent regression: 6 files, 21 tests, all passed.
- Independent frozen review: 7 files, 22 tests, all passed; nine author hashes matched (`retention-009-review-notification-final-pass.md`).
- `npm run build`: exit 0.
- Isolated two-process Electron harness: `E2E_SUCCESS_RETAINED`, run `0564cace-6084-472a-926f-b3b76111b621`.
- Seed PID `216688`; verify PID `225880`; Electron `44.1.1`, Node `24.19.0`, SQLite `3.53.3`. Exact harness stdout is retained in `retention-009-electron-final-run-01.raw.txt`.
- Synthetic root retained at `C:\Users\30910\AppData\Local\Temp\mashiro-f1-e2e-0Rjaw6` for root review. Seed retained six temporary messages before shutdown; verify retained zero after restart. Seed and verify retention jobs both reported `COMPLETED`.

The run used only synthetic data and did not touch the installed application state.
