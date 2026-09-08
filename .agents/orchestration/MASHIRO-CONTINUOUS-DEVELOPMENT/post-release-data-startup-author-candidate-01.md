# 019 trusted startup and data isolation — author candidate 01

Status: **AUTHOR_CANDIDATE**, not an overall or packaged PASS.

- Existing valid production data is preserved. A one-time native prompt identifies the current path and dataset, explains that the installer contains no business objects, and offers continue, data management, or exit.
- Native data management can create and atomically select a genuinely empty dataset with a new identity. It never copies assistants, history, memory, items, connections, credentials, or settings, and keeps the old dataset unchanged.
- Backup, restore, selection, and empty creation share a per-session maintenance mutex. A pending selection also blocks later maintenance and release.
- Startup failures now record only stage, allowlisted code, correlation ID, and cleanup state. Raw messages, paths, stacks, SQL, content, and credentials are excluded.
- Failure cleanup destroys the partial window, unregisters IPC, stops reminder shell resources, closes Provider then Assistant writers, and releases the production lease only after all closes are confirmed.
- Early pre-ready failures use a safe native error box. Cleanup uncertainty permits exit only and cannot reopen or switch data in the same process.
- BrowserWindow and reminder-runtime constructors roll back every side effect created before returning. Cleanup failure carries a private in-process FAILED marker while diagnostics remain sanitized.
- Assistant repository construction failure closes its SQLite store.
- Synthetic production startup passed with Desktop, Chinese, and spaces in the path.
- Final focused validation: 12 files / 40 tests PASS; full typecheck PASS; scoped lint, format, and diff checks PASS.
- The historical Desktop-subfolder generic failure remains NOT REPRODUCED because the released build had no durable stage diagnostic. Packaged 0.1.1 isolated-profile and Desktop-subfolder validation remains required.

Exact hashes and paths are in post-release-data-startup-author-candidate-01.json.