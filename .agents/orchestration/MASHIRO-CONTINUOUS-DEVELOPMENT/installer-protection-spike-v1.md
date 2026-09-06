# Isolated NSIS data-protection spike

Date: 2026-09-06. Route SUPPORTED for precise owned-file removal, not final product/installer/upgrade acceptance. This independent experiment ran alongside 007 and did not modify its source or dependencies.

## Setup

Reused the prepackaged executable from [early packaging spike](packaging-spike-v1.md), exact electron-builder 26.15.3. New root: `C:\Users\30910\AppData\Local\Temp\mashiro-installer-protection-1ef4e8cdefdd4d30abbd3c7200053f2d`. Unique app ID `cn.mashiro.installerprotection.1ef4e8cdefdd4d30abbd3c7200053f2d`, per-user assisted NSIS, no elevation, no shortcuts or automatic app launch, no AppData deletion. Installation target was its `安装 空格\Mashiro` child; only synthetic data was used.

The default template recursively removes the installation directory, independently of AppData protection. The [custom macro](installer-protection-spike-v1-macro.nsh) replaces that removal block with exact owned program files and empty-directory removal. It never recursively removes the installation root. Source/rationale: [route preparation](packaging-data-protection-planning.md).

## Attempts and actual evidence

1. First official GitHub dependency download timed out. Command-level HTTP(S) proxy `http://127.0.0.1:7890`, already qualified for the project, downloaded official NSIS resources successfully. No mirror, TLS change or persistent proxy configuration.
2. Initial installer built successfully; SHA-256 `75379AA363657DFAE2545EB881A75D53F2C3020264BD45C6186D14ACAA119247`, Authenticode `NotSigned`. Ordinary-user install PID 58616 exited 0. All three preexisting synthetic file hashes were unchanged.
3. Same-version reinstall PID 64232 outlasted the 45-second observation window and subsequently ended. Its exit code was not captured; subsequent installed-file/data checks passed. This is not recorded as a verified version upgrade.
4. Initial uninstall launcher PID 25528 exited 0 and preserved all synthetic files, but left `resources/elevate.exe`. Inspection of the exact builder `nsisUtil.js` proved it injects this owned helper after the initial prepackaged manifest was enumerated. Added only that exact known path to the removal macro; no broader deletion was introduced.
5. Corrected installer built successfully, SHA-256 `FCAF44CBDC315B7F7D98E14E7D7336ABD2C957CF55E27249F968EF7569F439BA`, `NotSigned`. Reinstall after uninstall PID 91272 exited 0; corrected uninstall launcher PID 76260 exited 0. A first completion check ran when `Mashiro.exe` disappeared, before asynchronous cleanup finished, and reported the still-removing helper/uninstaller. Final all-owned-file check found exactly three synthetic data files, all original hashes unchanged. Future harnesses must wait for complete removal, not just launcher exit or disappearance of the main EXE.

The [sanitized result](installer-protection-spike-v1-result.json) records the exact three paths/hashes and honest intermediate failures. SHA-256 `11C6DA8AB84F355338A1ADCA855FE796051DB9C636058347C91E14339E75D8F8`. Final macro SHA-256 `37CD34B58B56EDC781FBDAD364BA4338FA1A63513996F5E0F0B097AD68EDB85F`.

## Consequences and boundaries

The final install directory contains only `data/synthetic-governance.json`, root `unknown-user-file.txt`, and `resources/unknown-user-file.txt`; no installed program remains. Temporary build artifacts and synthetic data are retained for reproducibility. No user security control was disabled; builder log text saying signing is not a signature claim.

Production must generate its removal manifest from the complete final artifact, account for injected helpers and old-version files, and preserve unknown/data files. This spike did not launch the installed app, exercise production locator/manifest setup, move real data, compare different application/schema versions, prove update rollback, or qualify a release. The reused early artifact still has experimental changes and packaging warnings; it is not distributable as the finished product. Those requirements remain in Q10-Q12 and must be tested on the complete candidate.
