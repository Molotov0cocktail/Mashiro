# Governance restore and round memory — reviewed source checkpoint

PROGRAM ACTIVE. This closes the reviewed source checkpoint, not overall product acceptance or release. The next mandatory UI repair is [018](../../../doc/tasks/018-old-round-business-receipts.md), independently identified by [016 preacceptance](review016-overall-preacceptance-repair.md).

## Exact scope and verification

The staged product inputs merge governance v4, its seed v5/v6 delta, trusted017, UI017 v1 and login v2, plus their independent tests and the minimal Node-helper lint configuration. Root verified the applicable 84 trusted manifest hashes before integration and all reviewed manifests before staging. The index contains the reviewed 017 snapshot; new018 changes remain in the working tree and are not silently included.

- Trusted integration: [129 files / 578 tests passed](delivery-017-root-trusted-integrated-pass-01.md).
- Final renderer group: [40 files / 168 tests passed](delivery-017-root-renderer-final-01.json), exit 0 after the last R-U7 repair.
- Together these cover all **169 declared test files / 746 tests in this frozen candidate**. Newly created review016 regression tests belong to the subsequent open repair and are not represented by this count. The earlier whole-run 709/712 failure remains historical.
- Full node/web TypeScript and whole formatting passed. Whole lint passed after [correcting only the five Node helper environments](delivery-017-root-lint-route-02.md), independently [reviewed](review017-eslint-config-independent-pass.md). Product/test lint rules were not relaxed. The renderer run's duplicate synthetic job-key warning is retained in its tool output; it is not a product test failure.
- Actual production build exited 0: [raw build result](delivery-017-root-build-final-01.json). Rollup removed unsupported annotation comments in the exact installed Zod dependency; no dependency or executable behavior was changed for this warning.
- Existing isolated Electron lifecycle harness exited 0: [full raw summary](delivery-017-root-electron-final-01.json), run `dd98219f-c1d9-4925-9716-55b6b93d5733`, PIDs **186464 / 185996**, Electron **44.1.1**, Node **24.19.0**, SQLite **3.53.3**. Recovery transport calls were zero. Root visually inspected the archived daily verification image: accepted inference and its memory action are visible. This reuses the harness's existing cross-domain scenarios, not a claim that every new017 control was manually exercised in an installer.
- [Five built output files](delivery-017-built-output-01.json) are frozen so an internal schema18 installer can be built from this output without rebuilding the active018 working tree.

Independent scope reports remain authoritative: [governance v4](delivery-014-review014-final-v4.md), [seed delta](delivery-014-review014-seed-v6-final-pass.md), [trusted017](review017-trusted-independent-pass.md), [UI017](review017-ui-independent-final-pass.md), [login](reminders-014-login-independent-pass-v2.md). All original RED/REPAIR findings and their fixes are preserved.

## Remaining program work

018 must make old pending/unknown business receipts reachable from their actual old round. RET-007 still requires the pending user decision. Final packaged memory-source behavior, real credential decryption/core Provider execution, installation/update/reinstall/uninstall, reminders including a supported cold-activation route, independent overall/artifact review and actual release/download verification remain open.

The new schema15 pre-upgrade backup `be252177-5477-4b80-916a-862399a8e04c` matched all13 source/payload files independently. A later native reminder test deliberately changed its source to reminder v4, so that earlier source hash is not mislabeled as the current state. The installation owner must reconcile the next upgrade baseline. No new paid Provider request occurred in this checkpoint.
