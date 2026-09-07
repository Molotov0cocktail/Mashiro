# 014 installed login-startup mismatch

Status: REPAIR, discovered during installed baseline acceptance. This is not a platform permission gate.

The native verifier observed that enabling login startup created the synthetic installation's exact HKCU Run value named `Mashiro`, but the UI still reported disabled and the SQLite settings version remained zero. The verifier owns cleanup of only that newly created isolated registration, with exact preimage checks.

Root inspected `windows-reminder-platform.ts`: setter passes `name: 'Mashiro'`; getter uses `app.getLoginItemSettings(...).openAtLogin`. The application uses AppUserModelID `Mashiro.Desktop`.

The exact [Electron 44.1.1 Windows implementation](https://raw.githubusercontent.com/electron/electron/v44.1.1/shell/browser/browser_win.cc) explains the mismatch: `SetLoginItemSettings` selects a supplied name or the application ID; `GetLoginItemSettings` reads `openAtLogin` from the application ID. This makes the custom setter name inconsistent with the getter. The [API documentation](https://www.electronjs.org/docs/latest/api/app#appgetloginitemsettingsoptions-macos-windows) also distinguishes registration from the enabled launch-item state.

Repair scope assigned to the existing Sol executor: align the write/read identity; report actual system approval state; verify enable, disable, failure and actual installed behavior. Do not broaden registration scope or treat SQLite success as proof of OS startup registration. Any compensation must target only the operation's known registration, not unrelated startup entries. Root independently reviews the resulting candidate.

Existing 012 local and default-reminder evidence remains valid within its scope. Installed login startup is not PASS until the concrete mismatch and failure reporting are closed and the final artifact is checked.
