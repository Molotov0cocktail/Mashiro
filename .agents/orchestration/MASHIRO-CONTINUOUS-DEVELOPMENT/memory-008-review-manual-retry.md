# 008 independent manual lost-receipt review

2026-09-06. Coordinator requested review of manual `newCommandId` behavior. Independent finding: **P2 REPAIR required** for unresolved user submission recovery, not general same-content deduplication.

MemoryPanel keeps the same filled create form after an IPC response failure and leaves Save enabled. Every submission creates a new command ID. Independent renderer oracle models a commit followed by a lost response, then clicks Save again without editing. Two distinct accepted IDs result, expected one unresolved intent identity. Observed run: renderer 3 tests, original two repairs PASS, this new test FAIL (accepted set 2 rather than 1).

A component-only ref is insufficient because App keys MemoryPanel by assistant, which is necessary to prevent stale assistant receipt display. Unknown identity must survive that remount within the renderer session. An additional independent remount oracle covers that boundary. It does not require persistence of unsaved form bodies across application restart, and does not authorize browser localStorage copies of business content.

Bounded repair should reuse the unresolved identity for the same assistant and exact mutation, recover already-committed trusted receipts, and release only on an appropriately known outcome. Different content is a different intent. A known uncommitted/unknown conflict must not silently generate a new ID. No automatic Provider request or changed temporary-mode business authority is needed. [Renderer oracles](memory-008-review-ui.test.tsx).