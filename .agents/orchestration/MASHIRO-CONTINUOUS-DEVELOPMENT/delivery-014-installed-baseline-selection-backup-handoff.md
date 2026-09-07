# 014 installed baseline selection and backup handoff

The installed unsigned `0.0.9-internal.1` baseline from source commit `8154d0e09fc95014b8d205f8ed70c0028557208e` completed the native existing-data-set selection and complete-backup-and-exit flow. This is a bounded installed-baseline result; it does not qualify upgrade, uninstall, signing, publishing, or release download.

The application selected `C:\Users\30910\AppData\Local\Temp\mashiro-install-full-Zbzmgp\全域 合成数据` only after the native shell address breadcrumb read back the exact path. Mashiro then showed that the selected data would be used after restart and that current data remained at its original location. The old main PID `173968` launched short-lived restart PID `190356`; Electron main PID `183252` then owned HWND `202512`. The application’s “查看当前数据位置” dialog displayed the exact selected path.

The installed UI showed one available assistant, consistent with the three database rows comprising one active identity, one archived identity, and one archived identity with a tombstone. It exposed 12 timeline messages, six formal items, two reminders, the governed memory data, one daily job/report, and the pending proposal `安装升级合成待确认提案`. The report retained accepted observation `E2E_DAILY_INFERENCE` with Memory `e814c421-b6ef-40b9-9515-349d16c0c305` version 1, while the separate statistics observation remained pending verification.

The complete backup used an initially empty synthetic directory. Mashiro displayed both the pre-operation scope and the final “备份已校验，程序即将退出。” receipt, then all installed Mashiro processes exited after acknowledgement. Offline verification matched all 13 manifest entries to both payload and source by byte length and SHA-256. The 14th payload file is the intentional `.mashiro-snapshot.json`, bound to the same backup and data-set IDs so the payload cannot be selected directly as live data. There were no reparse points, residual temp/failure entries, or unexpected backup-root entries.

The native route remained ownership constrained. Attempts that could not prove a Mashiro-owned target stopped before input. Writing a folder path into the shell filename field did not navigate and was correctly rejected by Mashiro. The successful helper activated the exact `ToolbarWindow32` address control, wrote only to its unique `Edit` child, verified the final breadcrumb, and submitted only the owned `选择文件夹` button.

Machine-readable evidence is in `delivery-014-installed-baseline-selection-backup-01.json`. The helpers are synthetic-scene-specific and are not product code.
