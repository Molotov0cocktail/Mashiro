# Production data and installer route preparation

Date: 2026-09-06. Program ACTIVE. Read-only preparation alongside 007; no installer execution or new packaging qualification is claimed.

## Confirmed scope

Sources: detailed-design section 5, high-level-design section 8, ARC-003/004 and program G04-G09/Q10. Program and data locations are independently selectable, including installation-directory `data`; ordinary-user writability is required. A missing/unavailable/mismatched data location must enter recovery rather than silently creating another empty dataset. Update/uninstall preserve data. Development, synthetic tests and production stay isolated. Network/cloud/shared concurrent storage is not a first-release promise.

## Observed installer hazard

Inspected the existing isolated spike's exact `electron-builder@26.15.3` dependency, `app-builder-lib/templates/nsis/uninstaller.nsh`. Its default removal branch calls `un.atomicRMDir` during update and subsequently `RMDir /r $INSTDIR` (line 187). The `customRemoveFiles` macro branch replaces that entire default removal block (lines 161-188). AppData deletion is controlled separately later in the template. Therefore `deleteAppDataOnUninstall: false` alone does not protect installation-directory `data` or other unknown files under the program directory.

Source copy: the `source/node_modules/app-builder-lib` directory in the isolated root documented by [packaging spike](packaging-spike-v1.md). Official reference locations: https://www.electron.build/nsis/ and https://www.electron.build/configuration/ ; the web renderer exposed no readable body in this inspection, so the actual versioned local template is the evidence for the deletion behavior.

## Proposed engineering route and discriminating checks

- Use a per-user assisted installer with explicit program-directory choice. Integrate the independently chosen data location into installation/first setup without creating a dataset before a clear user action. Use a trusted native directory picker; renderer receives bounded display information and opaque selection identity, never filesystem authority.
- Use a versioned minimal locator and matching dataset manifest. Validate identity, ordinary-user read/write and startup state before opening SQLite. Missing locator offers explicit open-existing or create-new choices; inaccessible known locator offers retry/rebind and does not initialize a replacement. No disk-wide discovery.
- Production cleanup must remove only owned program artifacts, using a reviewed manifest/custom removal implementation. Preserve `data`, locator and unknown files. Avoid relocating personal data into an uninstall temporary directory. Require actual update/uninstall tests; an option name or template inspection is not acceptance.
- Serialize app access to a dataset, keep migration preflight/recovery explicit, and test interrupted relocation/copy before publishing a new locator. Backups preserve database, credentials and future Markdown/governance/source/deletion state; credentials remain subject to Windows user/machine protection.
- Test installed standalone executables in default and Chinese/space custom locations, including installation-directory data. Verify permission failure, missing/renamed root, manifest mismatch, full-disk/write failure, restart, update failure recovery, uninstall and reinstall with populated synthetic data. Final qualification must rerun on the complete-domain release candidate; early route evidence cannot settle it.

No product semantics requiring user choice were invented here. Final implementation details, exact schema/IPC and executable tests belong in the selected stable task contract; Q10 remains queued and NOT RUN.
