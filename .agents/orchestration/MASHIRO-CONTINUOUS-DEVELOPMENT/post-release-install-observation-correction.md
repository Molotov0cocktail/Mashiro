# Installation observation: ordinary desktop reconciliation

2026-09-08. This supplements, rather than replaces, `post-release-install-residual-native-diagnosis-01.{md,json}`. That first report observed the tool context; its stale Run/uninstall-registration findings must not be applied as ordinary desktop cleanup instructions.

Root compared observer v3 with the previously successful desktop observer. Filtering Explorer processes by a nonzero MainWindowHandle does not identify the desktop shell. The corrected observer obtains the actual GetShellWindow owner; it also uses a UTF-8 BOM and explicit UTF-8 JSON reads for Windows PowerShell's Chinese-path handling. It writes started/failure receipts so an absent final receipt is not mistaken for a successful observation. The earlier automatic-variable errors and missing receipts remain historical failures.

`post-release-shell-metadata-probe.ps1` SHA-256 `A5B72117085368549587CA94A06653238847A994305E4001FD8BA6E3EA8E87DB` was dispatched once through the existing desktop ShellExecute route (tool ae0b1c), without changing execution policy, starting Mashiro, opening business databases, or writing system registrations. The resulting observation at 18:48:25+08 is `post-release-shell-metadata-observed-01.json`, SHA-256 `566994A796DB28D293D8DF7531C04643CA368E7D8FC71C788F3D537703FB6EFE`. The observer PID 71984 has parent PID 8252, equal to the desktop shell owner, and is 64-bit.

- The ordinary desktop sees the same 243-byte locator, SHA-256 `0855654037482B0FC5C2EA2920D7B0C2767D56818D52382EB49B696576D82FA8`, pointing to data set `9f2cf384-daa4-4bb6-819a-33976e479c5a`. Its READY manifest and database file exist. Only metadata was inspected; the database was not opened.
- The exact fixed Mashiro uninstall GUID is absent in this view, unlike the tool-context observation. The three exact shortcut paths and three known executable paths are also absent. This does not prove no installation exists anywhere on the machine.
- Run/StartupApproved queries returned no values, but that observer merges read errors with absence. These results cannot authorize deletion or serve as a complete registration baseline.
- The database file's modification time is 18:09:31+08. Its contents must not be assumed to remain a disposable old fixture.
- The ordinary desktop also has no executable at System32/WindowsSandbox.exe. A subsequent read-only optional-feature query from the tool context required Windows elevation (df6bf2); feature state is therefore unknown. No feature or account was enabled/created.

Independent boundary review: `review019-shell-metadata-boundary.md`. The original startup exception remains unproven. The demonstrated data-locator reuse remains a valid repair target; stale registrations seen only by tools are not a reason to alter the user's ordinary desktop.

Installation verification will use the reviewed alternative of preserving the exact whole Mashiro profile by same-volume rename, using a fresh full profile for synthetic validation, and retaining both trees before any restoration. This is controlled preservation within the existing repair authorization, not an independent Windows security sandbox. No profile move has occurred yet; exact preflight, exclusive access, registration baselines and recovery checks are required before execution.
