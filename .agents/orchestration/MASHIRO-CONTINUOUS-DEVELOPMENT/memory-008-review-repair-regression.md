# 008 independent intermediate repair regression

2026-09-06 22:02 Asia/Shanghai. Original history-provenance and correction-recall oracles both passed against the in-progress repair. New independent DAG oracle failed: 15 round nodes, each referring to all earlier rounds, no withdrawal and no obsolete memory, caused `assertSource` to throw PERMISSION_DENIED rather than accept. That single test took 2.7 seconds.

Cause: the new recursive provenance traversal uses an active recursion-path set, deletes its entries on return, and counts every visit against 4096. Shared DAG nodes are revisited along exponentially many paths. Ordinary recent-history dependency construction naturally creates this structure. The old closure implementation deduplicated nodes.

Required bounded repair: safely reuse completed traversal states, accounting for current-memory ancestor context where obsolete correction back-edges are permitted. Raising the limit merely postpones the failure. A global completed key which ignores those ancestor conditions can incorrectly reuse authorization, so that is not sufficient either.

[Independent oracle](memory-008-review-oracles.test.ts), test `ordinary shared history DAG is not mistaken for excessive provenance`. Raw observed result: 3 tests / 2 PASS / 1 FAIL, failing expectation not.toThrow received Error: PERMISSION_DENIED. This report describes an intermediate repair defect, not the final candidate.