# Release v7 artifact independent review

STATIC_PASS — admits the installer to the authorized ordinary-Explorer native migration test, not final release acceptance. Independent review_017_trusted, GPT-6 Astra / medium. No installer/application execution, system registration write or scene access by this reviewer.

Source867b401bdeeebe9a153b32d7a462376239a89bbd; runtime remains ea94184e3fb80943d333005d50372dacf1892ea3. Actual files in dist/windows-candidate-release-v7:

- Setup112587919 bytes, SHA256 8F33C7E10FA663F52EABD9418B2B51979D1E191B1C3F5D28606068F95FCDDB58.
- EXE245289984 bytes, SHA256 33F79D190010A5A6E0C3B9AFDC4D3E14020BCEA272BEDBD209508CFA684454D7.
- ASAR15514291 bytes, SHA256 7659DE497E76AD04CABDBF6956F9BC519ED8E0B3AF1E1FCC4F423B22DC459F0E.
- Blockmap118848 bytes, SHA256 A467228A923BCECDC6DF6DB4B24E34361FA62E0C3E0D6811F34A8B6138DF270D.

`delivery-014-release-v7-artifact-review.mjs` independently reads every manifest file and verifies size/hash, the five ASAR outputs against the reviewed frozen output and current out, all79 owned files, no default_app.asar/version residue, six license notices plus index hashes, dependencies/preload/root boundaries, schema19/cold navigation/policy-status markers, production AUMID and fixed old NSIS GUID. Generated owned-files.nsh is byte-identical to the final reviewed D4218B generator output. The four source/test references in A2C0E889…B621 manifest match. Result: `delivery-014-release-v7-artifact-review.json` (8d0eda, exit0).

Actual Authenticode/version read is `delivery-014-release-v7-artifact-identity.json` (59ba1c): setup and EXE both NotSigned, product Mashiro/version0.1.0 (EXE ProductVersion0.1.0.0). EXE and ASAR are exactly the previously checked v6 bytes, so v6 PE ASAR integrity and unchanged runtime qualification are reused on byte identity; no new PE resource verification is falsely claimed. The v6 physical v10 click/target success remains applicable to unchanged runtime, but the changed installer migration still requires native verification.

Initial checker attempt73f566 failed at an undefined manifest.commit before scanning: root's new identity manifest uses sourceCommit. The checker was adapted to that actual schema and rerun successfully. The surrounding PowerShell command's final read exited0; this does not convert the initial Node assertion into success. No package bytes were changed to obtain the result.

## Minimal native fixture contract

The scene is presently uninstalled. After this static admission, install v7 through real Explorer, launch the exact app through Explorer and explicitly enable login in its UI, then exit normally. To reproduce the newly fixed existing-owned branch without an unnecessary old-version installation, a reviewed synthetic seed may add only the absent legacy Mashiro.Desktop REG_SZ value for the exact authorized scene command. This is fixture setup, not a product migration result or manual cleanup. Require ordinary-Explorer context, exact installed identity, zero app processes, existing new Run exact and no pre-existing legacy value; if legacy exists, inspect/stop rather than overwrite. Preserve current StartupApproved bytes and all unrelated values; seed no credential, notification or business state. Record before/after and the intentional single addition.

Then run the same v7 installer through ordinary Explorer and independently read the ordinary view: legacy must retire, new exact command and current choice must remain, GUID/program/data/locator/unknown identities must match the declared scope. Do not delete residual old values after installation to manufacture PASS. Continue the already authorized lifecycle checks proportionately; synthetic NSIS tests already cover new-Off and concurrent changes, so no extra manual matrix is required solely to repeat them.