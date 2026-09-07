# Daily current-attempt budget snapshot repair

The stored RUNNING job captured its budget before operations.begin inserted the current attempt. The same stale object propagated to COMPLETED, and the error path reread that stale RUNNING row for FAILED.

The sole product change refreshes `job.budget = this.budget(config)` immediately after operations.begin, within the same transaction and before attempts++ / RUNNING update. The pre-dispatch budget gate is retained. Failure settlement does not refund a dispatched attempt; a budget pause before begin adds no attempt.

- Product: `src/main/background/daily-service.ts`, SHA256 `04965032CDCCFFEA671F8AEC563D3369A0DC419160FFCE09C29223BD63A958E8`.
- Regression: `tests/integration/daily-budget-snapshot.test.ts`, SHA256 `FD6A9E6B3E43FB2992FCE74243DE6143C4DABF96E9DEA8CF2F6F53B5ECF9BA80`.
- [RED 01](daily-013-budget-snapshot-red-01.json) and [RED 02](daily-013-budget-snapshot-red-02.json) both reproduce completed/failed snapshots omitting the current attempt. Their third test had author fixture mistakes (oversized memory title, then output-token budget below the schema minimum), corrected without changing the product oracle.
- [GREEN 01](daily-013-budget-snapshot-green-01.json): 3 files / 10 tests passed, including four new checks for RUNNING against the actual operation attempt, completed and failed persistence/reopen, and pre-dispatch paused zero usage; existing usage/recovery tests included.
- Targeted trusted TypeScript, ESLint and Prettier completed with exit 0. No schema, global docs, 015 implementation, remote calls or commit/push changes. UI writer notified to add native budget assertions; independent review remains root-owned.
