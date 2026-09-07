# 013 R4 / R6 bounded trusted repair

Status: IMPLEMENTED; independent review pending. Actual role: gpt-6-astra medium. This is not independent PASS or PROGRAM_DONE.

## Frozen change manifest

| File | SHA256 |
| --- | --- |
| src/main/background/background-sources.ts | c8979c53fe3154d34971600babceb05be71718efa32d38fc682bdf6ac24e4d4b |
| src/main/retention/retention-service.ts | 74f8b6ef850f3a894b4977d968abd6e63acc693dad519d92b139b7abe5047b12 |
| tests/integration/background-business-receipts.test.ts | 5a67b16d4181f0a43b18d6c2d4392ebe946ac2c5b50a2dee66d35d6547a6aeca |

Root authorized the retention-service narrow extension. No renderer, MemoryService, schema, shared DTO or Git changes in this repair.

## Behavior

Round sources resolve memory and item command receipts from current assistant-scoped durable authority; missing, pending and unknown authority blocks. Reminder previews use the current durable preview and, for accepted execution, the command receipt. Rejected reminder previews retain their explicit not-applied receipt. Historical text is retained with an explicit instruction that current resolved operations govern confirmation/execution status.

Retention pending uses the actual lowercase persisted enum. Only an older epoch pending preview becomes EXPIRED_INTENT_ONLY with null receipt. Closed previews now retain a small versioned commandId/accept proof, written with the command receipt in one transaction. Other pending previews receive an invalidated marker; later confirmations never erase existing closed proofs. Resolution directly looks up the assistant-scoped command, verifies the exact original preview/nonce/accept intent hash, and checks the matching cleanup job actually completed. No command-table scan remains.

Historical closed {} or missing/malformed/unverifiable proofs remain conservatively blocked. Invalidated markers describe only the original unconsumed intent; they do not attribute another preview's execution to it. These legacy closed rows have no retrospectively invented linkage.

R6: after asynchronous accepted-file verification, confirmation rechecks pending state, assistant, nonce and the entire original manifest inside the transaction before any mutations. A concurrent rejection therefore makes the pending acceptance stale; it cannot overwrite the cancellation or recycle originals.

## Verification

- Actual domain services: 8/8 passed, [raw domains](background-013-trusted-r4-domains-02.json). Memory accept/reject/missing authority; reminder accept/reject/unknown; retention UI fresh-preview accept/reject, expired original intent, later unrelated cleanup preserving proof, forged/legacy proof and unknown command; item unknown authority.
- Original independent item-pending, item-terminal and retention-race tests unchanged: 4/4 passed in executor rerun, [raw](background-013-trusted-r4-review-regression.json). This is regression reuse, not self-awarded independent review.
- Final focused run: exactly 2 matched files / 15 tests passed (background-business-receipts 8, retention-service 7), [raw](background-013-trusted-r4-final.json). Other supplied filter names did not match files and are not claimed.
- Scoped ESLint and Prettier passed for all three changed files.
- Node typecheck attempted; only failure was another role's newly promoted background-no-interruption.test.ts:38 optional signal. Root/reviewer notified; their correction and full static validation remain root-owned.
- Initial domains run had 6 pass / 2 fail because fixtures attempted to accept the old tool preview after protocol writes advanced the epoch. RetentionPanel deliberately re-previews the intent; tests now use that actual flow rather than changing epoch or bypassing validation.
- No paid Provider rerun, build or Electron rerun by this repair role. Prior evidence is proportional reuse; root owns final full/static/build/Electron and independent reviewer owns acceptance.
