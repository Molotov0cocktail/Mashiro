# Upgrade toast registration observation route

2026-09-08, independent Astra/medium. Read-only source analysis; no app, desktop or Registry operation. **NATIVE VERIFICATION REQUIRED**, neither installation PASS nor reproduced defect.

The missing ToastActivatorCLSID before first launch is compatible with the implementation. Installed builder template `include/installer.nsh:197` creates the shortcut and line 200 sets only AUMI. Electron 44.1.1 performs shortcut/registry initialization asynchronously before registering its runtime COM class factory. It reuses a CLSID from an existing shortcut, and unregistering the runtime factory does not itself delete persistent registration. [Exact Electron source](https://raw.githubusercontent.com/electron/electron/v44.1.1/shell/browser/notifications/win/windows_toast_activator.cc), lines 210–288 and 302–368.

Inference: replacing the shortcut can break identity continuity. The inspected registration path registers only the selected current CLSID; an old LocalServer32 entry by itself does not prove the new process will serve that old class. This is a risk to test, not proof that Windows routes a retained notification to the old class or that the installed product fails.

Native owner's bounded observations:

1. After first launch and registration settling, read the actual shortcut CLSID, AUMI, target and working directory, then that CLSID's LocalServer32. Keep the known pre-upgrade GUID separately; do not hardcode it as the expected current GUID.
2. Preserve the old notification tag/state before testing. After exit, distinguish current-GUID activation from old-GUID activation, recording HRESULT, process identity and actual business navigation independently. Process startup alone is insufficient. A physical retained-notification click is stronger routing evidence than manually selecting a COM GUID.
3. At actual uninstall, compare both known GUID registrations and shortcut presence. Scope any residual finding to exact prior ownership/path; no broad CLSID enumeration or advance cleanup. Builder `uninstaller.nsh:191` calls WinShell UninstAppUserModelId, which must not be assumed to clean arbitrary Electron COM registrations.

The pending RET candidate remains the next priority. No product change is proposed before the native observations distinguish registration timing, continuity and owned residual behavior.
