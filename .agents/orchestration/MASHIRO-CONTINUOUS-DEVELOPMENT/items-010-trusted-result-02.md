# 010 trusted repaired candidate — author verification

PROGRAM_ID: MASHIRO-CONTINUOUS-DEVELOPMENT. Program remains ACTIVE. This is an author handoff, not independent approval or release approval.

## Frozen scope

The repaired trusted candidate is recorded by the 42-file [SHA manifest](items-010-trusted-manifest-02.json), superseding the first trusted manifest. Renderer ownership and evidence remain in [the UI report](items-010-ui-result.md). No Git action or paid Provider call was performed by this author.

## Repairs and completed behavior

- Item updates exclude only the current target's prior self-reference, inherit real dependencies, deduplicate sources and reject overflow atomically instead of silently truncating. Indirect cycles remain rejected.
- Retained formal items preserve approved old recipients across subsequent item versions. Complete source-closure withdrawals take precedence over retained exceptions; live descendant permissions are rechecked and unrelated failures are not swallowed.
- Proposal identity comes from the complete matching topic sentence in trusted user text. Model-selected evidence length cannot bypass rejection, while substantive new conditions can permit a new suggestion. Unrelated later sentences and condition-only citations do not bypass suppression.
- Selected formal items support `prepare_item_update`: exact item ID/version plus complete candidate content produces a `replace-content` preview, with no immediate business write. Local confirmation applies the full change once; recovery preserves the original scope. Parent and related-source authorization remains enforced. A selected formal item cannot be silently converted into a new-item proposal.
- The Electron screenshot is now captured after selecting the items tab, exposing and scrolling to the newly created item card. The previous `items-010-trusted-ui.png` showed the application top with the conversation tab selected; it was not an items-panel visual verification and is superseded by the image below.

## Author evidence

- Trusted tests: 34 files / 217 tests PASS; [raw log](items-010-trusted-repair-tests.log).
- First final full run: 300 PASS / 1 timeout in the existing multi-batch retention scheduling test; [raw log](items-010-trusted-final-tests-02.log). Its elapsed time exceeded the unchanged 5-second test limit during concurrent host work. The unchanged file passed alone (11 tests), then the complete suite passed with other verification paused and two workers: **51 files / 301 tests**, 35.96 seconds; [raw log](items-010-trusted-final-tests-03.log). Assertions and timeouts were not weakened. No temporary independent oracle was included in this final count.
- Final project typecheck, lint, format check and build all exited 0. Dependency-tree and foundation checks passed in the earlier author candidate; repair introduced no dependency changes.
- Final two-process Electron lifecycle PASS: PIDs **128516 / 112004**, run `f606bb22-de4e-4460-a1cc-3ac9d4b7afbb`; [raw result](items-010-trusted-electron-02.json). It covers five kinds, stable receipts/restart, actual item DOM creation, and existing Provider/memory/retention integration. Restore transport made zero requests; the explicit synthetic action made one.
- [Final items screenshot](items-010-trusted-ui-02.png) was visually inspected by the author: items tab selected, six formal items and the new version-1 E2E item card visible, including conversational handling and edit controls.
- Frozen audit found exactly six assistant channels, no temporary reviewer tests and no scoped secret/database/temporary-backup residuals. The manifest includes hashes for the evidence and owned files.

Root separately reported real Provider update run 5 SUPPORTED: two requests / 7,577 tokens, pending preview without mutation, recovery, duplicate confirmation causing only one version increment and service reopen with zero calls. See [root raw result](items-010-live-update-run-5.json). This does not replace independent review.

## Handoff

All author verification processes have finished and owned source is frozen. Reviewer may restore the six immutable archived oracles to their original test paths and independently reassess these repairs and the full-field update path. The permanent public-retention regression originated from an archived oracle and was extended by the author; its author-run result is not an independent verdict. Independent final review remains pending. Root retains global records, cleanup decisions, Git and release authority.
