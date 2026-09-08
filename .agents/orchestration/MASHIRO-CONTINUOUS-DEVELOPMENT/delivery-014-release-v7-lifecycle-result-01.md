# Release v7 login-migration lifecycle result

This result is limited to the authorized synthetic installation scene. No Provider request or credential access occurred.

## Initial install: PASS

- The independently admitted v7 setup identity was `8F33C7E1…CDDB58`; its installed EXE and ASAR were byte-identical to the v6 identities already used for the successful user physical notification click.
- The first setup window displayed the default Programs directory and was cancelled before installation. The same reviewed setup was relaunched through the real Explorer desktop with the authorized scene directory as the final NSIS `/D` argument; the installer UI read back that exact directory.
- Automatic launch was unchecked. At the postinstall-prelaunch checkpoint, the exact EXE, ASAR, and uninstaller were present; the 18 data-tree entries, locator, and unknown file were byte-identical to the uninstalled baseline; and exact installed processes were zero.
- A direct-Explorer observation found both legacy and current Run values absent, the fixed uninstall GUID and Mashiro shortcut present, and the data root present. This is the expected default login-Off state.

## Explicit login-On and synthetic precondition: PASS

- The installed app was launched through Explorer and displayed the retained synthetic dataset, including the existing `E2E_NORMAL_USER` history marker.
- The Reminders page initially reported login startup Off. The setting was explicitly toggled On and saved through the product UI, which then displayed `已由系统确认开启`.
- After normal product-menu exit and zero exact processes, a direct-Explorer observer found the current `io.github.molotov0cocktail.mashiro` Run value equal to the exact installed command and the legacy value absent.
- The admitted seed then created only the absent legacy `Mashiro.Desktop` REG_SZ with that same exact synthetic-scene command. It rechecked the current value before writing, did not modify the current value or either StartupApproved value, and recorded the before/after state.

## Same-version v7 overlay: PASS

- The same v7 setup was launched through Explorer with the seeded duplicate Run state. Its UI retained the exact existing install directory; automatic launch was unchecked.
- A direct-Explorer post-overlay observation found the legacy Run value absent and the current exact Run value preserved.
- The 18 data-tree entries, locator, and unknown file remained byte-identical. The installed EXE and ASAR still matched their reviewed identities, and exact Mashiro processes remained zero at the prelaunch checkpoint.
- The post-overlay app launch came directly from Explorer, displayed the same dataset marker, and reported the login checkbox On with `已由系统确认开启`. No setting was changed and no Provider request was made.

## Evidence boundary

- v7 changes only the same-value legacy Run migration branch. Its installed EXE and ASAR match v6, and its uninstaller is byte-identical to the v6 uninstaller (`BEF780A2…0592F`). The completed v6 ordinary uninstall matrix is therefore reused; v7 was not uninstalled again.
- The v6 user physical notification-click result is reused because the installed application bytes are identical. Notification click was not repeated for v7.
- Real desktop Run conclusions use only direct-Explorer wrapper evidence. Tool-host registry views were previously shown to differ and are not used for those conclusions.
- No manual post-overlay deletion or correction of the seeded legacy value occurred.
- Current scene state after this slice: v7 is installed and the post-overlay Mashiro instance is running as PID 67640 for the final UI observation.

The exact file inventory, byte sizes, SHA-256 values, and relative links are in [delivery-014-release-v7-lifecycle-archive-manifest-01.json](delivery-014-release-v7-lifecycle-archive-manifest-01.json).
