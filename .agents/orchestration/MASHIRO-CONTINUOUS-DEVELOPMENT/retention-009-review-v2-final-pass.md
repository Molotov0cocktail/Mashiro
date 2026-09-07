# RET v2 independent final source review

2026-09-08, independent Astra/medium. **LIMITED PASS** for RET policy v2 source and the measured performance repair. This is not final packaged/native or overall release acceptance.

Frozen [manifest v2](retention-009-author-manifest-v2.json) SHA256 `1324C5187EAD1CE0CB1BB071A3305CDBFFA86E28513CDE040AC0901CA68E27EE`; all43 product/author-test hashes matched before and after independent verification. Policy service `0289950562727295F57C1FB23A8B4D8A568230CB84C80BD4D5CF6777D3565120`; policy schema `ADCA791EDBDAB5D72E9AE0314BC3C3D1272830EB95631000BBFE53C88F815A35`; memory service `8D1AE1CBA5714512D8F94E524B9EB165B20F94E296409A6F71FBF099C2C80BA7`.

## Independent results

- **15 files / 59 tests PASS**, exit0: [final scope raw](retention-009-review-v2-final-scope-run-01.json). Scope includes policy defaults/UTF-8 quota/UNKNOWN/reduction, staging age and recoverable expiry, original retention/adversarial deletion semantics, interrupted-run recovery/backoff, policy-revision races, real governed upgrade, renderer policy fences and Provider continuation/cancellation.
- The original correction/move and legacy17 baseline failures retain their business assertions. New expiry-capture→real correction and in-flight Provider→expiry→late completed answer cases pass. The late result cannot repopulate timeline or caller result.
- Deliberately disabled watcher callbacks plus same-size body edits with restored mtime still cause synchronous admission UNKNOWN. Old measured results across committed deletion/suppression cannot restore capacity. The last-object ghost failure was independently reproduced and then repaired; all four original audit assertions pass in the final scope. [Working evidence and preserved RED](retention-009-review-v2-working.md).
- Actual approved schema18 backup migration repeated on a **new copy** using final source hashes: [raw](retention-009-review-real18-copy-run-v2.json), [result](retention-009-review-real18-copy-result-v2.json). Old tables remain equal at migration, all16 original payload hashes remain unchanged, first full audit gives COMPLETE/407bytes/zero unknown, restoration hook pauses automation, integrity/FK checks pass. No key access or credential decryption/output occurred.

## Measured default-capacity repair

The original v1 samples and v2 timeout remain preserved. The final near-default sample is specifically [batched run raw](retention-009-review-v2-batched-copy-run-01.json), [startup observation](retention-009-review-v2-batched-copy-start-01.json), and [completed metrics/source hashes](retention-009-review-v2-batched-copy-result-01.json). Do not relabel the earlier `v2-default-copy-run-01` timeout as success.

The fresh copy contains25,599 accepted4KiB objects before measurement. A real new4KiB acceptance reaches25,600 objects and104857600 bytes. Original v1 sample DB hash remains unchanged. Copy preparation28.21s is separate from operation timings.

| Operation | Actual v2 observation |
| --- | ---: |
| Constructor | 38.7ms |
| Initial UNKNOWN/PENDING snapshot | 13.7ms |
| Full asynchronous audit | 60.49s |
| Maximum gap of10ms event-loop sampler during audit | 167.4ms |
| COMPLETE snapshot | 122.8ms |
| Real increased acceptance | 649.6ms |

The demonstrated v1 synchronous6–10second pauses are removed. This is one machine/sample, not a latency upper bound. Full audit still takes about a minute at this many small objects; capacity increases remain fail-closed while its status is unknown. UI exposes pending/running counts and completion time, plus UNKNOWN usage. The audit must not be described as instantaneous.

The bounded1000-object comparison measured1001→51 transactions, full audit4422→1234ms and maximum sampling gap200→44.7ms: [old mechanism](retention-009-review-v2-commit-cost-result-01.json), [batched mechanism](retention-009-review-v2-commit-cost-result-02.json). This supports the transaction-batching repair without attributing every timing difference exclusively to it.

## Integrity and scope

Accepted logical byte totals are maintained by trusted transactions. Watch events only invalidate; synchronous admission checks stored full file identity/change metadata, and bounded audits verify full body hashes and source closure. Metadata equality is not a fresh SHA proof. Periodic audits, fail-closed UNKNOWN and original model-facing hash validation remain necessary. Each batch checks audit/governance generation and each object's version/record before saving. Pruning removes nonexistent entries even when the last object was deleted; stale work cannot reinsert them. Garbage is never automatically permanently cleared. Stable assistant IPC count and narrow trusted retention input/output validation remain intact.

Reviewed scope does not require treating every arbitrary filesystem mutation as instantaneously observable; it preserves the established missing/tampered-file admission cases and does not grant authority to filesystem notifications. No claim is made that an attacker preserving every filesystem identity/change field is detected by metadata alone.

Reviewer tests passed scoped lint; author final typecheck/static evidence is separate. Expensive and approved-backup tests are explicitly environment-gated and skip in ordinary suites. No product implementation, Git, build output, installed application, production Registry or published asset was changed by this reviewer. Root full integration, final artifact migration/restart/UI and release acceptance remain required. Toast installer v1 has a separate open REG_SZ completeness REPAIR and is not covered by this PASS.
