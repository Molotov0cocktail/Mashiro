# Release v5 notification manual boundary
- Mashiro normally exited from main PID `249648`; the exact installed-path process count is `0`.
- Login is explicitly On: `Mashiro.Desktop` Run exactly targets the v5 EXE with `--mashiro-login`.
- The current shortcut/AUMID/CLSID/LocalServer32 are exact, and v8 tag `d8af21134c16e258` remains in Mashiro-only history after exit.
- Warm direct COM returned HRESULT 0 and navigated correctly, but it is diagnostic evidence and does not count as a physical click.
- `SendInput` returned zero; `keybd_event` exposed no NotificationCenter window; the guarded auto-hide taskbar point was not Explorer-owned.
- The proposed verified `Shell_TrayWnd` raise was rejected: `Automatic approval review failed: Error running remote compact task: Connection failed: error sending request`.
- All taskbar/indirect Notification Center, tray screenshot, and automation workaround routes are stopped; no unrelated notification content was read.
- Physical cold click remains `AWAITING_USER_ACTION`: press Win+N and click the newest exact `Mashiro 提醒` entry for 07:46; then only exact Mashiro PID/item/version-8 activation will be checked.
- The initial post-exit PowerShell 5 shortcut check misdecoded the UTF-8 Chinese path; retained `shortcut-after-exit-01.*` failed, while PowerShell 7 produced the valid `shortcut-after-exit-02.json`.