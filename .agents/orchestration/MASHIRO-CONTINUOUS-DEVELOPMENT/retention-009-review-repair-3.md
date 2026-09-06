# 009 independent UI review: REPAIR 3

2026-09-07. Reviewer review_009, actual gpt-6-astra / medium. Program ACTIVE; no FINAL PASS.

## P1: empty-trash UI discards selected memory targets

`RetentionPanel.tsx` targetForPreview returns `{ type: 'timeline' }` unconditionally for `empty-trash`, before processing selectedMemoryIds. Selecting a trash memory and choosing the permanent trash-cleanup intent therefore sends an unrelated timeline target. Trusted timeline empty-trash selects only retention_original_trash rounds; it does not collect memory trash. In production the real Q9 original recycling path is still blocked, so ordinary memory garbage cannot be emptied through this advertised action.

Independent real-component oracle selects one memory with retention=trash/objectVersion=2, chooses empty-trash and clicks full preview. Expected target is that explicit memory identity/version. Actual target is timeline. This is not an assertion about automatic whole-zone deletion; the user selection must not silently disappear.

Repair within the frozen API: preserve explicit trash memory IDs and current versions. Reject or explain mixed/non-trash selection. With no memory selection, explicitly label the original-round trash scope or require selection; do not call only the loaded first page the entire memory garbage zone. Keep complete trusted preview, blockers and local confirmation. No new default retention policy is authorized by this fix.

Command is the explicit config in [review UI config](retention-009-review-ui.config.ts). [Independent oracle](retention-009-review-ui-oracles.test.tsx) at 00:26:45, duration 1.60 s: 3 tests, 2 failed / 1 passed. This third test failed with `expected target.type=memories, received timeline`; the other failure remains the separately reported AssistantPanel late-rename issue. The App source-switch late-purge fence independently passed.

Only reviewer oracle/report changed. No product, Provider, personal-data or Git mutation. Root was informed for the active UI author's narrow repair; do not widen source scope or weaken tests to make this pass.
