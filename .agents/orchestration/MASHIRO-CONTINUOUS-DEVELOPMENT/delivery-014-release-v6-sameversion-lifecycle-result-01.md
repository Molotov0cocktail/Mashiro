# Release v6 same-version lifecycle result

This report is limited to the authorized synthetic installation scene. It does not change product source, build output, registry state, or runtime data.

## Same-version overlay: REPAIR

- The reviewed v6 setup was launched through the real Explorer desktop. PID 61596 had Explorer PID 8252 as its direct parent.
- The installer showed the exact existing Chinese install directory. Automatic launch was unchecked to preserve the postinstall-prelaunch checkpoint.
- The pre-overlay record is named `sameversion-preuninstall-02` because it reused the reviewed snapshot phase vocabulary; it was actually captured immediately before the overlay.
- Across the overlay, the 18 data-tree entries, locator, and unknown-file hashes were byte-identical. The installed EXE and ASAR matched the reviewed v6 identities, and the fixed uninstall GUID existed.
- In the real Explorer registry view, the new `io.github.molotov0cocktail.mashiro` Run value was the exact enabled scene command, but the exact same-scene legacy `Mashiro.Desktop` Run value remained. This is a product REPAIR because both entries can request login startup.
- The first Windows PowerShell 5.1 observer lacked a UTF-8 BOM and could not faithfully compare the Chinese path. Its failure is retained, while the BOM-corrected v2 observation is the basis for the result.

## Ordinary uninstall: PASS for the observed cleanup and preservation boundary

- After one real Explorer launch of the installed application, Electron registered shortcut CLSID `{88058F74-4FE1-4431-8581-09F8762BDEBC}` to the exact installed executable. The app then exited through its normal menu and reached zero exact processes.
- The installed v6 uninstaller was launched through the real Explorer desktop and completed normally.
- The post-uninstall real Explorer observation found both the legacy and current Run values absent, the pre-overlay `{145B11B4-27B4-4C65-8585-F689F4C2CBB9}` and post-overlay `{88058F74-4FE1-4431-8581-09F8762BDEBC}` COM registrations absent, and the Mashiro shortcut, fixed uninstall GUID, executable, ASAR, and uninstaller absent.
- The data directory remained present. Its 18 entries, the locator file, and the unknown file were byte-identical to the immediate pre-uninstall snapshot.
- Tool-host and real Explorer registry views were observed to differ. System-registration conclusions above use only the direct-Explorer wrapper evidence; the tool-host snapshot remains useful for file preservation.
- Final scene state for this slice: Mashiro is uninstalled and has zero exact installed processes. No manual Run/COM/shortcut cleanup and no reinstallation occurred.

The exact evidence inventory, byte sizes, SHA-256 values, and relative links are in [delivery-014-release-v6-sameversion-lifecycle-archive-manifest-01.json](delivery-014-release-v6-sameversion-lifecycle-archive-manifest-01.json).
