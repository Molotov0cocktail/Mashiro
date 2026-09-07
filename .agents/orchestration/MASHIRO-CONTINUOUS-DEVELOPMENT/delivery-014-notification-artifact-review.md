# Notification candidate independent artifact review

Verdict: **STATIC_PASS — internal artifact only**. Reviewer `review_017_trusted` (requested gpt-6-astra / medium) independently inspected `dist/windows-candidate-notification` without executing the installer/application or using the desktop. Source HEAD observed: `f4fb5c7c064e0e24bbd0d360cdf7a8b208a0027f`. Product source, package/lockfile and packaging code/config have no working-tree difference from that reviewed commit. This is not final release, installed/native notification or activation acceptance; PROGRAM ACTIVE.

## Exact identity

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| Mashiro-0.1.0-win-x64-setup.exe | 112572235 | cba1270a795a9fa0bacfcd8d8224b4c8b43a594e69e552cce1083943c402ae5d |
| win-unpacked/Mashiro.exe | 245289472 | f5566cedb14af2c2908717b12860fbeba4eb6bba12be25f722bc919009164f05 |
| win-unpacked/resources/app.asar | 15431590 | 7fddad7fda3e7ed19e754fb9704b61b7ad1f0e0a9ecdf879aa41d836d30702bc |

All three independently read identities match [packaged hashes](delivery-014-notification-packaged-hashes.json). The installer and main EXE report Mashiro 0.1.0 (EXE productVersion 0.1.0.0). Both actual Authenticode statuses are **NotSigned**; no signing or trust claim is made. [Raw identity/source evidence](delivery-014-notification-artifact-review-identity.json).

## Actual package checks

[Independent ASAR/resource checks](delivery-014-notification-artifact-review-raw-02.json), exit 0, establish:

- All five ASAR application outputs match the frozen [build output manifest](delivery-014-notification-build-output.json) and current local output bytes: main JS, preload CJS, HTML, renderer JS and CSS.
- ASAR root entries are exactly `node_modules`, `out`, `package.json`. There is no project-root source/tests/docs/scripts/Git/agent/runtime-data tree. Vendor Zod distribution source/tests are not misclassified as project test leakage.
- The actual package is `mashiro` 0.1.0, ESM, with main `./out/main/index.js`, exact runtime dependencies and no devDependencies. Actual inventory is react 19.2.8, react-dom 19.2.8, scheduler 0.27.0 and zod 4.5.4; every version matches the committed lockfile and notice inventory.
- All six license/notice entries exist inside the unpacked installation root and match their recorded hashes. The four package licenses also match the corresponding dependency license bytes. Electron and Chromium notices are present and hash-bound.
- `mashiro-program-files.json` has 79 unique safe owned paths, exactly matching the actual 79 unpacked files, including `resources/elevate.exe`, ASAR and notice resources. No missing/extra files, unsafe owned paths, data directory ownership or symlinks were found. This is a static ownership-list check, not an uninstall execution test.
- Main/preload/renderer paths resolve to actual ASAR entries, and both HTML asset references exist. Actual main bundle retains contextIsolation, sandbox and disabled nodeIntegration. The actual preload has only Electron as its runtime require dependency.

The first review read used POSIX separators with the Windows ASAR API and failed before output comparisons; [original audit-tool failure](delivery-014-notification-artifact-review-raw.json) is preserved. The reviewer confirmed the archive's Windows path representation, corrected only the read helper, then completed the checks. No artifact was changed and no product failure was inferred from that tool error.

## Remaining boundary

This review did not execute or install the NSIS package, extract and compare its embedded installed payload, occupy the desktop, exercise notification display/warm/cold activation, validate upgrade/uninstall or perform a download/release. Installer identity is bound to the recorded candidate hash; actual installation equivalence and behavior remain dedicated native acceptance work. Existing RET/user gates and real notification outcomes are not resolved here. No product/Git changes, Provider calls or personal-data access occurred; only these dedicated review reports were added.
