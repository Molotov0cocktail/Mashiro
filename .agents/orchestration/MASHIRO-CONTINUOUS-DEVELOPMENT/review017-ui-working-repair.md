# 017 UI independent working review

Current verdict: **REPAIR** on the pre-freeze UI workspace, not a final candidate verdict. Reviewer review_017_trusted is independent of all 017 product implementation. Trusted 13-path limited PASS remains separate. PROGRAM ACTIVE.

Six independent assertions reproduced product failures. The author was informed directly and is repairing owned product files; reviewer writes only the three independent test files below and dedicated evidence/reports. Root owns integration and the global progress entry.

| ID | Actual failure and bounded repair requirement | Raw evidence |
| --- | --- | --- |
| R-U1 | A changed permission/refresh epoch still synchronously renders the previous body's section before queued clearing. Bind rendered data to current authority generation. | [3-test RED](review017-ui-boundary-red-01.json) |
| R-U2 | normal → temporary → normal renders the former body before renewed authority returns. Repeated route strings must not revive an earlier generation. | [3-test RED](review017-ui-boundary-red-01.json) |
| R-U3 | An openTarget inspection started before refreshKey changes resolves afterward into the correction textarea. Invalidate both inspection state and its editing continuation. | [3-test RED](review017-ui-boundary-red-01.json) |
| R-U4 | Real App target state plus keyed MemoryPanel remount consumes an old target again after A → B → A; inspect count is 2, expected 1 without another click. Retire stale target ownership/generation. | [App RED](review017-ui-app-red-01.json) |
| R-U5 | Real App/MemoryPanel/RoundMemoryPanel correction reaches v2, but returning to chat retains old provided-v1 body. Every successful object mutation/confirmation/re-acceptance must invalidate parent evidence, not only tool writes or permission changes. | [correction RED](review017-ui-correction-red-01.json) |
| R-U6 | A queued normal refresh runs after temporary replaces it and starts two normal-data round calls. Cancel queued work before dispatch, not only its response. | [queued RED](review017-ui-queued-red-01.json) |

Independent tests: [round boundaries](../../../tests/renderer/review017-round-boundary.test.tsx), [App target](../../../tests/renderer/review017-app-target.test.tsx), [App correction](../../../tests/renderer/review017-app-correction.test.tsx). The App tests preserve real App and MemoryPanel behavior, with narrow mocked assistant snapshot events and Provider shells; the correction test retains the real RoundMemoryPanel. No native or packaged claim follows from these DOM tests.

Additional read-only observation sent to the author: historyBindingKey includes connection ID/base URL/model but excludes connection/binding versions and enabled state; successful settings apply only replaces the snapshot. Evidence refresh must cover these execution-receiver changes without weakening the historical permission contract. This observation is not numbered as another independently reproduced RED.

The three reviewer-owned UI files passed scoped ESLint after formatting. Formatting used fixed path allowlists, computed preimage SHA, race checks, same-directory temporary/backup files and postimage verification with rollback. No product or author-test edits, network, credentials, personal-data access, commits or pushes. Root is separately running serial trusted integration; reviewer does not duplicate that suite. Final conclusion awaits the author's frozen manifest and unchanged-oracle reruns.
