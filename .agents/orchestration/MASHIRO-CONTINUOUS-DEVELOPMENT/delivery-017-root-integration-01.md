# 014/017 integration observation 01

PROGRAM ACTIVE. This is not final candidate acceptance.

After schema18 central wiring and the shared round fixture were present, root ran `tsc -p tsconfig.node.json --noEmit`: exit 0. The subsequent whole repository run used the existing Vitest configuration (`maxWorkers: 2`) and saved [raw full result](delivery-017-root-full-01.json): 158 files, 712 tests, 709 passed and 3 failed, exit 1. Other independent suites were executing concurrently on the host.

Failures were the legacy retention migration, approved-snapshot startup substitution, and session ownership-loss tests. Their recorded durations were approximately 5.925s, 10.980s and 10.004s. The JSON reporter only retained `STACK_TRACE_ERROR` definition stacks, so it alone does not prove the precise timeout cause.

Root reran just those three files with one worker and both default/JSON reporters, changing no test assertion or deadline. [Diagnostic run](delivery-017-root-failure-diagnostic-01.json) passed 8/8, exit 0; corresponding tests took approximately 2.330s, 1.496s and 0.537s. This supports host contention as an explanation but does not turn the original full run into PASS. Final integration will avoid simultaneous competing suites and rerun the complete required checks after the login/UI differences are ready.

The independent 017 trusted PASS remains limited to its frozen 13 paths. The separate 014 governance candidate is under fresh independent review. Login v1 has a concrete [independent repair finding](reminders-014-login-independent-repair-01.md). Windows lifecycle, notification visibility, overall acceptance and release/download verification remain pending.
