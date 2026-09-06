# 011 root parent snapshot echo: red evidence

2026-09-07 05:08:51 local. Root added a React useState parent wrapper to the three existing AssistantPanel profile scenarios, supplying externalSnapshot and onSnapshot exactly as the App integration does. No product code changed for this run.

Command: D:\nodejs\node.exe node_modules/vitest/vitest.mjs run tests/renderer/assistant-011-root-parent-echo.test.tsx --maxWorkers=1

Observed tool output: exit 1; 1 file failed; 1 test failed and 2 passed; duration 1.38s. Failing scenario: refreshes a stale trusted snapshot while preserving isolated A and B drafts. The findByText result for the Chinese conflict notice was already detached at toBeInTheDocument (original generated line 137). This is a concise transcription of the actual tool result, not an untouched raw output file. Prettier subsequently formatted the test without changing its scenario.

Source cause to repair: stale-save refresh calls acceptSnapshot, which notifies the parent; the echoed externalSnapshot effect calls setError(null), removing the just-created conflict notice. This does not prove that the earlier Electron03 no-submit event had this cause. UI author has received a bounded repair task; trusted author notified to treat current Electron evidence as before the UI repair. Final independent review and proportionate post-repair verification remain required.
