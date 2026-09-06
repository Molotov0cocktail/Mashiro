# Packaging spike v1

## Question

Can the reviewed Mashiro Electron `44.1.1` application run as a real packaged Windows executable, with `node:sqlite`, the sandbox preload, renderer resources, protected credentials, and restart persistence all working without a development server or source-directory working directory?

This is an isolated route qualification. It is not a product candidate, installer qualification, release review, or evidence that the document-to-release program is complete.

## Baseline and role

- Repository baseline at exploration start: `fb268174e5b14848c5345e52cf6c88ed6c6e1a5d`, `main`, clean.
- Mode: `Explore / Spike` under `MASHIRO-CONTINUOUS-DEVELOPMENT`.
- The child execution environment did not expose a verifiable model identifier. Environment inspection exposed Codex session/thread identifiers but no model setting, so this report does not claim that a role label proved an actual model switch.
- No product source, `package.json`, lockfile, global progress file, commit, push, Provider call, personal data, or system security setting was changed.

## Route and hypothesis

`ROUTE_ID = PACKAGED-ELECTRON-BUILDER-001`

Use exact `electron-builder@26.15.3` in unpacked directory mode. This route was selected over standalone `@electron/packager@20.3.0` because the same tool can later produce the intended NSIS installer/update artifacts. Official npm registry metadata queried during the spike reported:

- `electron-builder`: `26.15.3`, Node `>=14.0.0`
- `@electron/packager`: `20.3.0`, Node `>=22.12.0`
- Host: `D:\nodejs\node.exe` `v24.18.0`; `D:\nodejs\npm.cmd` `11.16.0`

Hypothesis: after removing the explicit historical F1 packaged-mode guard in an isolated copy, the current production build has enough correct resource and dependency structure to run from `app.asar`; Electron's built-in `node:sqlite` does not require a separate native addon.

## Isolation and controlled changes

Successful experiment root:

`C:\Users\30910\AppData\Local\Temp\mashiro-packaging-spike-v1-868b0913dab24b47b3c5e3bedc8dacf0`

The source was created using `git archive HEAD` and expanded under `source`. The unpacked package was then copied to `standalone\Mashiro`, and the executable was launched with `standalone\Mashiro\Mashiro.exe` while its working directory was the otherwise empty `empty-cwd` directory.

Two experiment-only source changes were made with exact-match, content-addressed replacement in that temporary copy:

1. Removed only the `app.isPackaged` throw from `src/main/data/data-root.ts`; SHA-256 `349F6E41FE9699AB45C33A84E7E2B5A898A95E53E0404FF3BCD6EEB43F9FC213` -> `C2F43BA945F9A3239E9B382E6517CA5B4B92BE1485B1E4216FAEE1DCE8F4864F`.
2. Added `app.isPackaged` to temporary E2E evidence in `src/main/testing/e2e-controller.ts`; SHA-256 `99C9E250E15FE1F5C0C4BAF92C08A43A686713F8FC61C82495E60C50832D407F` -> `2E7678289453796E7CA7BBFBA6F563DF58BCAF26A6C5A1D60074052A3E918C6B`.

The historical guard must not simply be deleted in the product candidate. The real implementation needs a production data-location profile and its locator/manifest/recovery contract first.

## Experiments and exit codes

### Attempt 1: temporary atomic writer

- `git archive` and exact guard match succeeded.
- `Move-Item` refused to replace an existing Windows file; command exit `1` before dependency restore, build, packaging, or application launch.
- First bad state: spike writer mechanism. No repository file and no candidate product state changed.
- Route delta: use same-volume `.NET File.Replace` with a backup, verify postimage hash, then remove the temporary backup.

### Attempt 2: dependency restore, build, and unpacked package

Executed inside the isolated HEAD copy, using default registry/TLS behavior and the committed lockfile:

```text
npm ci
npm exec install-electron
npm run build
npm install --no-save --package-lock=false electron-builder@26.15.3
node_modules\.bin\electron-builder.cmd --dir --win --x64 \
  --config.appId=cn.mashiro.desktop.spike \
  --config.productName=Mashiro --config.asar=true \
  --config.directories.output=packaged
```

All five commands exited `0`. `npm ci` restored 258 packages with 0 reported vulnerabilities. The production build emitted `out/main/index.js`, `out/preload/index.cjs`, `out/renderer/index.html`, CSS and JS assets. electron-builder reported Electron `44.1.1`, completed native-dependency processing, downloaded/extracted the official Electron ZIP, created `packaged\win-unpacked`, and updated ASAR integrity in `Mashiro.exe`.

Warnings to carry forward: package description and author are absent, the default Electron icon was used, several transitive packages emitted deprecation warnings, and npm's allow-scripts notice listed pending install scripts. None was hidden or treated as a release PASS.

### Attempt 3: packaged self-identification instrumentation

After the temporary `app.isPackaged` evidence field was added, `npm run build` and the same electron-builder command both exited `0`.

### Attempt 4: disposable runner syntax

The first generated runner had a missing newline between two environment-variable declarations. Host Node exited `1` with a syntax error before starting `Mashiro.exe`. This was a test-script first bad state, not a package failure. The runner was repaired by a single exact replacement; SHA-256 `FD86E8CF3E8AAC3FA6414FFCC9E157234C96A93566616A7EBF35B080660F04D8` -> `FE7DB69BA9358B4264DEAD55ABBED79E7E90CCFD3B3E7EBCC90F7751FD2F82D0`.

### Attempt 5: standalone packaged runtime

The repaired runner launched only the copied packaged executable, with no application/source argument, from the empty working directory. It locally removed `ELECTRON_RUN_AS_NODE` from each child environment and used the existing owned canonical OS-temp E2E data-root protocol. Exit `0`.

Observed evidence:

| Evidence | Result |
| --- | --- |
| Packaged self-report | `app.isPackaged = true` |
| Independent Electron PIDs | `84660`, `84304` |
| Runtime versions | Electron `44.1.1`; Node `24.19.0`; SQLite `3.53.3` |
| Renderer/preload | Existing UI-driven IPC seed and verify sequence completed |
| Window boundary | Existing harness enforced context isolation, sandbox, disabled Node integration, and web security |
| SQLite/restart | Assistant, Provider binding, normal timeline, interrupted partial recovery, and post-restart append checks passed |
| Strict temporary | Unsaved temporary content did not recover or enter SQLite/context |
| Credential vault | Persistent synthetic credential was protected; temporary credential did not persist |
| Restart Provider behavior | `0` automatic recovery calls; `1` explicit post-restart call |
| Stable startup error | Invalid trusted E2E root produced only the expected sanitized startup event |
| ASAR required entries | `out/main/index.js`, `out/preload/index.cjs`, `out/renderer/index.html`, `node_modules/zod/package.json` present |
| Executable Authenticode | `NotSigned` |

Artifact observations in the isolated root:

- `standalone\Mashiro\Mashiro.exe` SHA-256: `9B104B78F9CDF02F0910C403ACAAE9122300B30C03A7447E269DE6F7D61738D4`
- `standalone\Mashiro\resources\app.asar` SHA-256: `0215FB4D5500783EC15632CCF306B13CCE78B866B99B7DF8879C5D2F2B6A6926`
- Run summary: `source\test-results\electron-f1.json`

These are disposable spike artifacts, not release assets.

## Evidence delta and conclusion

`CONCLUSION = SUPPORTED`

Direct evidence now supports the technical route: Electron `44.1.1`, built-in `node:sqlite`, sandbox preload, renderer assets, Zod runtime dependency, Windows `safeStorage`, and the reviewed restart flow can operate from a real ASAR-packaged executable outside the source working directory. The previous `PACKAGED = NOT RUN` statement was historically accurate; this spike adds route evidence but does not qualify the current repository HEAD as packaged because the successful binary contains two explicit experiment-only modifications.

There is no technical reason to replace Electron, SQLite, or the preload architecture solely for packaging. `electron-builder@26.15.3` is a viable candidate tool, subject to a formal dependency/configuration review and actual installer/update qualification.

## NOT RUN / remaining product work

- Product implementation of production data-root selection, locator/manifest, path loss/rebind, install-directory `data`, or non-silent recovery.
- Default production-profile startup; the successful packaged run deliberately used the existing synthetic E2E test data root.
- NSIS installer generation and UI, custom program/data locations, ordinary-user permission checks, Chinese/space paths, tray behavior, or login startup.
- Installed launch, upgrade, downgrade policy, failed-upgrade recovery, uninstall, reinstall, or data-preservation verification.
- Migration of real or representative earlier-version datasets beyond the current in-app schema upgrade exercised by existing tests.
- Multi-instance, crash/power-loss recovery, disk-full/path-disappearance recovery.
- Code signing, certificate acquisition, SmartScreen reputation, Release creation/upload, download verification, or checksums for a release artifact.
- Any real Provider call or personal data. Paid call count for this spike: `0`.

## Candidate implementation contract

The formal packaging milestone should use a fresh product contract and independent high-reasoning review. Recommended scope/order:

1. Implement the confirmed production data-location contract first: production profile, minimal locator plus dataset manifest, explicit path failure/rebind behavior, ordinary-user writability probe, and isolation from development/test data. Preserve the existing trusted E2E root rules.
2. Add exact `electron-builder@26.15.3` to the lockfile and checked-in configuration with an explicit production file allowlist, app ID/product metadata, icon/resources, ASAR settings, artifact naming, and an unsigned-state declaration. Review transitive/deprecation and install-script warnings rather than silently approving broad scripts.
3. Replace the hard packaged throw only when the production data-root path is implemented. Add a packaged harness that asserts `app.isPackaged`, launches the packaged executable without a source argument from an empty working directory, and verifies ASAR contents plus the existing two-process SQLite/preload/credential/timeline flow.
4. Generate an internal NSIS artifact and test install, launch, update, uninstall, and reinstall in explicit isolated program/data roots including Chinese and space-containing paths. Verify data preservation and executable recovery steps before a release candidate is declared.
5. Keep installer qualification, release-candidate review, tag/Release publication, asset download, and checksum verification as distinct evidence stages even though those actions are already authorized by the current user instruction.

## Cleanup / residuals

- The successful disposable experiment remains under the exact temp root above so a subsequent packaging implementer can inspect evidence without rerunning downloads.
- An earlier failed unique temp root may also remain from Attempt 1; it contains only an archived HEAD expansion and the failed temporary writer state. No process remains running.
- The main repository receives only this report. No commit or push was performed by this Explorer.
