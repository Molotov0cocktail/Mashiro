# Windows login-startup repair v2 handoff

The installed `0.0.9-internal.1` build reproduced a real identity mismatch: enabling login startup created `Run\Mashiro`, while Electron read `openAtLogin` through AppUserModelID `Mashiro.Desktop`. The UI stayed system-confirmed off and SQLite remained version 0. That old-build value was removed under its exact preimage guard and remains absent.

## Candidate behavior

`createWindowsReminderPlatform` now omits the custom registration name so Electron writes and reads `Mashiro.Desktop`. It passes the executable path with surrounding quotes. This is required because Electron 44.1.1 parses the query path as a command line before matching the executable. A user-scope item must match the AppUserModelID, current executable path, Windows enabled state, and `executableWillLaunchAtLogin`.

The complete expected command is validated by `openAtLogin`, which compares the AppUserModelID Run value to Electron's formatted current path plus `--mashiro-login`. The candidate deliberately does not compare `launchItems[].args`: Chromium reports command-line switches separately and Electron's launch item returned an empty `args` array for the real `--mashiro-login-probe-f2c4ba98` command.

Setting startup passes `enabled: true` or `enabled: false`, so Windows StartupApproved state is represented honestly. Compensation compares the current snapshot with this operation's post-write snapshot. When enabling leaves this operation's exact entry observable, an exact prior Mashiro command can be restored with the known fixed path/argument settings and its prior enabled bit. A successful disable and a concurrent move to another path both appear as no matching item, so a failed disable returns `UNKNOWN` without a compensating write. If an enable operation replaced a prior AppUserModelID entry that used another path or command, Electron does not expose enough information to reconstruct its switches; the candidate removes the unchanged exact entry written by this operation and returns `UNKNOWN` rather than claiming restoration. An observable concurrent Windows change is left untouched.

`ReminderService.configure` keeps the platform mutation token until the SQLite configuration transaction commits. Post-write read failure, storage failure with concurrent change, and unverifiable rollback return `STORAGE_UNAVAILABLE` with “提醒结果未确认，请核查原操作”. A verified restoration preserves the original failure. The service does not overwrite a newer Windows setting during compensation.

## Actual Electron evidence

`reminders-014-login-electron-probe-02.json` used Electron 44.1.1 with unique synthetic AppUserModelID `Mashiro.LoginProbe.f2c4ba98-c8e0-45ea-a899-1d29a6d36532`. Both its Run and StartupApproved values were absent before the experiment. The executable was the synthetic old installer copy under a Chinese path with spaces and matched SHA-256 `BA5AA5BD3A78EFB437A9F2FFF46CEB4E088204B0594BCDD0132B0CC72A1DE8E6`.

The quoted lookup was registered and effective. The unquoted lookup had no matching launch item and was ineffective. The Run command contained the unique switch although `launchItems[].args` was empty. Setting `enabled: false` kept the registration but made it ineffective and produced a StartupApproved entry.

Before cleanup, both exact registry fingerprints matched the values created by this experiment. Electron removed both values; guarded fallback deletion found both already absent. Independent `reg query` calls returned exit 1 for both exact values. The probe made no network calls and accessed no personal data. Historical `probe-01` remains a failed oracle: its first assertion incorrectly required unquoted `openAtLogin` to be false, and a later diagnostic tried to match a Unicode path through `reg.exe` UTF-8 output. Neither failure is a product failure.

## Validation and limits

The v2 focused suite passed 3 files / 19 tests. Full node and web TypeScript, scoped ESLint, and scoped Prettier passed. Tests cover exact-path quoting, omitted switch reporting, enabled and disabled restoration for the exact command, different-path and different-switch unknown outcomes, concurrent change, post-write read failure, rollback read failure, SQL compensation, and successful commit.

This candidate still requires independent review and validation in a newly built installer. The old installed executable does not contain this source. A final installer must verify actual Mashiro enable, disabled-by-Windows readback, disable, restart/login behavior, and persistent notification-center display/click/cold activation. The earlier reminder reached `DISPLAY_OBSERVED` and restored the minimized app, but transient toast visibility and user click were not proven.
