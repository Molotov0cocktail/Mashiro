# Released package data-file inspection

Read-only root check on 2026-09-08, tool `927849`, against `dist/windows-candidate-release-v7/win-unpacked/resources/app.asar` (15,514,291 bytes; published v0.1.0 candidate archive).

The installed `@electron/asar` `listPackage` returned 834 entries. No path matched SQLite/database extensions (`.sqlite`, `.sqlite3`, `.db`), a `location.json` or `.mashiro-dataset.json` file, or a `credentials`/`data` directory segment. No archive entry was extracted and no user database or credential was opened.

This supports the distinction between the application's packaged files and the previously observed per-user data locator. It is a bounded archive-path inspection, not a new complete secret scan, not a determination of the user's ordinary Explorer installation state, and not a root-cause diagnosis of the earlier startup dialog.
