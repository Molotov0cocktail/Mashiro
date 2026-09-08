# Post-release install and locator residual diagnosis

Observed read-only on 2026-09-08. No Mashiro process was started, no database row or credential was read, and no registry, locator, installation, shortcut, or data file was changed.

## Proven current state

- No `Mashiro.exe` process was running at `2026-09-08T18:15:23+08:00`.
- `%APPDATA%\Mashiro\configuration\location.json` is a regular 243-byte file, SHA-256 `0855654037482B0FC5C2EA2920D7B0C2767D56818D52382EB49B696576D82FA8`. It points to the authorized synthetic data set `9f2cf384-daa4-4bb6-819a-33976e479c5a` at `C:\Users\30910\AppData\Local\Temp\mashiro-install-full-Zbzmgp\安装 旧版本\data`.
- The pointed directory, READY manifest, and SQLite file exist. The manifest carries the same data-set ID. Only file metadata was read; database contents were not opened.
- The fixed per-user uninstall registration `5555e988-f7b5-5fe3-b6bd-8df3b21f793e` still names Mashiro 0.1.0 and points to the same test installation directory, but its executable and uninstaller no longer exist.
- The current login Run value `io.github.molotov0cocktail.mashiro` also points to the missing test executable. The legacy Run value and both corresponding StartupApproved values are absent.
- The exact user Start Menu, user Desktop, and public Desktop `Mashiro.lnk` files are absent. The expected default executable paths checked are also absent.
- No Mashiro crash dump or WER report name was present. The bounded Application-log query did not yield a Mashiro event because the event message renderer failed with a Windows resource error. Mashiro's runtime directories contain Chromium metadata but no app-owned startup log.

## Cause and boundary

The reuse of the synthetic data set is proven. Packaged startup always derives a stable `%APPDATA%\Mashiro\configuration` directory. A valid READY locator is opened automatically without asking for a new selection. The installer intentionally preserves app data. A packaged acceptance run under the ordinary Windows profile therefore leaves a production locator that a later custom or default reinstall inherits. The package did not need to contain the synthetic rows for this to happen.

The exact exception behind the earlier generic startup dialog is not proven. The released outer startup catch discards the caught error and records only `MASHIRO_STARTUP_FAILURE`; no durable stage/error code is kept. The present machine cannot reproduce that launch because the registered executable and shortcuts are gone. The stale uninstall and Run metadata proves an inconsistent installation and can explain missing/dead launch entries, but it does not by itself prove which internal startup exception produced the dialog.

## Reproduction

1. Run the packaged application under the ordinary Windows profile and explicitly bind a synthetic production data set.
2. Exit, then reinstall to another program directory without removing `%APPDATA%\Mashiro\configuration\location.json`.
3. Start the packaged app. `ProductionLocationStore.inspect()` returns READY and `openProductionSession()` opens the stored data path before any selection UI, so the reinstall uses the synthetic data set.

## Safe repair direction

- Isolate future packaged acceptance with a dedicated Windows test account/profile or an explicitly trusted test profile that separates configuration, runtime, governance, credentials, data, and OS integration. A separate database directory alone is insufficient.
- Preserve normal reinstall behavior for real user data. Do not reset every locator, special-case the known UUID, or delete the current synthetic-root data because it may now contain user additions.
- Provide one trusted data-management flow during healthy startup and recovery: show current location and data-set identity; allow select-existing, create-new-empty, restore, or cancel. A new empty data set gets a fresh ID and does not copy objects, connections, credentials, or runtime settings. Commit a locator change only after validated preparation, quiescence, lease ownership, and compare-and-swap checks.
- Retain a sanitized startup stage and allowlisted error code. Show a concrete Chinese reason and recovery actions while keeping paths, stacks, bodies, and credentials out of renderer IPC and generic telemetry.
- Treat stale uninstall/Run/shortcut metadata separately from data selection. Cleanup may remove only values proven to belong to the missing expected Mashiro installation; preserve unknown or concurrently changed values and keep the data directory intact.

Verdicts: `DATA_LOCATOR_CONTAMINATION_PROVEN`; `INSTALL_METADATA_INCONSISTENT`; `SPECIFIC_GENERIC_STARTUP_EXCEPTION_NOT_PROVEN`.
