# 014 production data and delivery: implementation preparation

2026-09-07, root read-only preparation while012 implements. Reviewed product072dd39, docs closure6da9ee9;012 owns main/index/shared/schema until handoff. This plan does not implement014 or freeze a future schema number. Read [formal task](../../../doc/tasks/014-windows-data-and-delivery.md) and actual final012/013 HEAD before writing overlapping files.

## Current facts

src/main/data/data-root.ts rejects isPackaged before app.whenReady; dev/test creates data, runtime/userData and runtime/sessionData. ProviderService uses data/mashiro.sqlite, data/credentials and data/memory. MemoryService stores immutable Markdown versions referenced by memory_versions.file_name/body_hash; SQLite owns accepted metadata, permissions, source dependencies, suppressions, pending work, receipts and retention tombstones. A Markdown-only copy is not a backup. package.json has build/preview and version0.1.0, no production installer command. Existing ASAR/NSIS experiments are routes, not a usable installed current product.

## Bootstrap and location

Separate locator/bootstrap from opening AssistantService/ProviderService: production first opens a constrained recovery/setup window if no valid binding exists. Never invoke development fallback. Trusted native folder selection yields an opaque operation token and a display location; renderer must not acquire arbitrary filesystem read/write. Default ordinary-user location and custom data folder, including installation/data, must be tested. Store a minimal standard-user locator plus matching data-set UUID manifest. A valid existing locator with missing/unwritable/mismatched data enters recovery; cancellation preserves it and cannot create an empty replacement. Explicit new data-set creation is separate from relocating the known UUID.

Acquire runtime/data-set ownership before SQLite opens, in addition to012 application single-instance handling. Test two program locations pointing to one data set. Validate canonical paths and refuse unsafe link/reparse traversal where it could cause writes or cleanup beyond the chosen root. A data path is not permission to traverse unrelated files. Program uninstall enumerates only owned executable resources and empty owned directories; unknown files and data stay.

## Consistent backup and migration

A simple supported route is a visible maintenance mode: stop dispatch, cancel/drain in-flight work truthfully, close all data writers, then snapshot the complete authority plus accepted Markdown/required pending-file state into a new isolated destination with checksums and schema/data-set metadata. If any service refuses a safe close, abort backup and keep the original running/recoverable. Copying a live SQLite file alongside unrelated-time Markdown without quiescence is not accepted. Do not export plaintext credentials; protected blobs may remain same-user-only, with explicit re-entry when portability fails.

Prepare destination, validate all hashes and authority/content consistency, and only then switch the locator atomically. Crash injection before/after destination completion and locator replacement must show one recoverable binding. Preserve original data and rollback metadata; no rename/delete of the user's source as an implicit successful migration step. Backups are dated snapshots, but restoring an older backup over the current data must not silently erase newer correction/deletion suppressions. Define a checked recovery route retaining current suppression/version barriers or explicitly stop that unsafe overwrite; do not claim arbitrary older-backup restoration is already implemented. Loss of all current files cannot retroactively reveal changes absent from every surviving backup, and must be described accurately.

## Installer and update

Reuse qualified electron-builder26.15.3/NSIS route after adding exact local dependency/config under a dedicated014 change. Produce a current standalone unpacked artifact first and actually launch it outside the source/dev-server tree with no external Node dependency. Then build assisted per-user installer with program/data choices. Generate owned-file removal inputs from the complete final artifact, including builder-injected resources/elevate.exe; earlier spike proved an early file enumeration omitted it. Uninstall must wait for complete known-file cleanup, not merely mainEXE disappearance or launcher exit.

Two distinct versioned artifacts and schema/data fixtures are required for upgrade and recovery evidence. A supported manual update-installer route is acceptable if accurately exposed; do not label it automatic updating. Before newer schema opens, make a validated recoverable snapshot; an old executable must refuse an unsupported new schema. A failed update must provide an executable restoration procedure, not just advice to reinstall randomly.

## Final route evidence

Exercise ordinary-user install/start/tray/quit/restart, installation/data, custom Chinese-space path, lost locator/data permissions, credential protection, offline reminder, accepted memory and items/proposals/governance, upgrade/reinstall/uninstall/reinstall.012 notification activation requires actual shortcut identity and cold-start integration here. Synthetic fixtures only, no daily user data or disabled Windows protections.

The pending distribution-notices collector is a known-runtime preparation only. Inventory the actual final files, copy required Electron/Chromium and bundled package notices, and check final inclusion. No new project license grant or purchased signing is implied. Bind version, source commit, build input and artifact checksums; independent reviewer inspects the actual installed artifact. Only after overall docs coverage accepts the release scope, create a new tag/Release and upload complete assets, then download and compare hashes. Existing tags/assets are never overwritten. Both source remotes remain synchronized.
