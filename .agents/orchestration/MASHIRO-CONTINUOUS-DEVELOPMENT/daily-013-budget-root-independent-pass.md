# Daily budget snapshot independent review

Root found the defect by inspecting the actual native verify screenshot: a completed job with one dispatched attempt displayed zero budget usage. The original Daily author added one post-begin refresh inside the existing transaction; the pre-dispatch budget check remains unchanged. Root did not implement this product change.

Independent review confirms RUNNING persists the refreshed snapshot before dispatch, success retains it, and failure reloads it from the persisted job. Pre-dispatch budget pause does not create an attempt. No schema, validator or budget allowance changed.

Root independently ran [four files / twelve tests](daily-013-budget-root-independent-01.json), all passed: current-attempt running/success/failure/reopen, pre-dispatch pause, existing usage/recovery, and the independent source/recipient boundary oracles. Trusted manifest-v2 has exactly one changed path: `src/main/background/daily-service.ts`, SHA256 `04965032CDCCFFEA671F8AEC563D3369A0DC419160FFCE09C29223BD63A958E8`. Its other 31 files are unchanged. The new regression test hash is `FD6A9E6B3E43FB2992FCE74243DE6143C4DABF96E9DEA8CF2F6F53B5ECF9BA80`.

Verdict: independent code and local budget behavior PASS. Native screenshot and retained full-domain seed are being refreshed separately; this is not final Windows delivery or PROGRAM_DONE.
