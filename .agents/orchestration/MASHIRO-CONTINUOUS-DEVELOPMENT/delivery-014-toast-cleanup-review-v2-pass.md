# Toast cleanup v2 independent review

2026-09-08, independent Astra/medium. **LIMITED PASS** for the frozen NSIS Toast cleanup repair, not installed Windows lifecycle acceptance.

[Manifest v2](delivery-014-toast-cleanup-manifest-v2.json) SHA256 `6C5561A7AA00E46C42608D2F6009277CB7B6F922BB852CA8200D4D5FD0F639D0`. Product `build/installer-login-cleanup.mjs` SHA256 `D840058C6C46066C6EBCD0699EAE0AF674F741B75BE504835D8CABF93EAFB169`; author fixture `28155736630E5AAC9E04C361BD7F7EF6BE95D71EF6C479ACE4ED0BB106C7EC5A`; independent original embedded-NUL oracle `CE04D81C977B195F287F55E4689E8F129D2EE48B03E37CAA9F0299AA4F5410CC`. All three matched before and after execution.

Independent **4 files / 18 tests PASS**, exit0: [raw result](delivery-014-toast-cleanup-review-v2-run-01.json). Actual installed makensis compiles isolated test installers/uninstallers; hidden execution touches only newly generated UUID subtrees under HKCU Software/Mashiro/Tests and reviewer/author temporary fixture roots. No real COM registration, current app, desktop or installed dataset was accessed. The original v1 RED preservation assertion is unchanged and now passes; the author's separate pointer-collision failure is retained.

Read-only inspection confirms complete REG_SZ authorization: expected unquoted or exactly-once-quoted executable paths have explicit UTF-16 sizes including terminal NUL; only the matching exact byte length allocates a bounded buffer. Both raw reads recheck type and actual byte count and perform full ordinal memcmp. Embedded-NUL suffixes cannot qualify through a truncated prefix. Query output length uses a distinct register and never controls the subsequent zeroing/allocation length; buffer bounds derive from the expected path. Allocation/read/type/length failures take cleanup paths without deleting the value.

Only the matched unnamed LocalServer32 value is removed. Named values and child keys are retained, keys are removed only if empty, and enumeration repeats the same index when a parent is deleted so adjacent owned matches are not skipped. Arguments, foreign paths, prefixes, malformed quotes and REG_EXPAND_SZ remain preserved in actual fixtures. Existing login tests also verify real update-flag skipping and register restoration. The function saves/restores its working registers; buffers and open handles have cleanup paths.

As with the existing login cleanup, the second comparison narrows but does not create an atomic Registry compare-and-delete primitive; concurrent external writes after that final read are not claimed impossible. The candidate introduces no broad subtree deletion or ownership inferred from a path prefix.

Root may integrate and rebuild the actual candidate. A subsequent real uninstall still must demonstrate removal of the exact previously owned activator registrations while data, unrelated fields and unknown program files remain protected. This scoped PASS does not close release or PROGRAM acceptance.
