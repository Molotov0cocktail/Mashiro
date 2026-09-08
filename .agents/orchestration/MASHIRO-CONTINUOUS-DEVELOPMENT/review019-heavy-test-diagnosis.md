# 019/020 integrated heavy-test diagnosis

Scope: read full01/full02 receipts and installed Vitest source; execute opt-in copies of exactly three existing synthetic cases with phase logging, unchanged original timeout and assertions. No original test or product edited; no private profile read.

## Actual failures

Full01 retention yields case: 4963.2435 ms, explicit Error('timeout') from its own settled helper, which polls at most 300 times with 5 ms sleeps. This is not the same failure as the later runner deadline.

Full02: retention 5026.6129 ms; timeline-context pagination 5476.0601 ms; timeline-service context budget 5843.0091 ms. All three report STACK_TRACE_ERROR at test registration. Installed @vitest/runner creates that error as a captured registration stack, then uses it when makeTimeoutError produces the deadline error. withTimeout also rejects a test that finishes after its budget even if synchronous/microtask work prevented the timer from firing. Thus the stack label does not indicate stack overflow or a product assertion failure. Repository config has no per-test deadline override.

## Instrumented evidence

`review019-heavy-stage-01.raw.txt`: original deadlines, one worker, 3 selected tests PASS / 39 unrelated cases skipped. Diagnostic copies are `tests/integration/review019-{timeline-context,timeline-service,retention-adversarial}.probe.ts`; only `review019-heavy.probe.config.ts` includes them. Default **/*.test include does not run these copies. Phase logging adds small stdout overhead and is not a calibrated benchmark.

- Timeline pagination: fixture-ready 201.8 ms; 61 historical sends complete 2775.0 ms; actual new arrival complete 2843.7 ms; pagination/search assertions complete 2854.2 ms. Complete test 2874 ms.
- Context budget: fixture-ready 189.5 ms; history population complete 1822.5 ms; assertions complete 1825.1 ms. Complete test 1825 ms.
- Retention: fixture-ready 124.6 ms; 52 remembered objects complete 674.6 ms; preview complete 847.3 ms. Cleanup job contains 156 items. Poll iterations 0/50/100/150 observed completed counts 0/16/33/50, demonstrating progress rather than a stalled worker. Complete test 2371 ms, including all original completion and unrelated-work assertions.

These numbers establish setup-heavy test structure and load-sensitive deadlines; they do not identify AV, filesystem failure, a specific competing process, or prove the exact stage at which the historical full run timed out. Historical failures remain failures.

## Proportionate next route

For the two timeline cases, create the same number and ordering of legitimate complete user/assistant rows in a single synthetic transaction using the existing timeline repository. Preserve UUID relationships, current/foreign assistant separation, lengths, statuses and literal search text. Keep the actual new-arrival call in pagination and final real startChat context capture in the 16-pair test; retain temporary and foreign exclusions. Existing transport/persistence tests continue to cover individual startChat behavior. This removes irrelevant repeated setup work instead of relaxing the assertion deadline.

For retention, keep its separate failure classification. A minimal equivalent workload can use 25 objects: above the production 24-object scan yield boundary and producing 75 cleanup items, also above the 24-item drain batch. Assert actual multibatch size plus the existing unrelated-work yield and full completion. Alternatively retain 52 and explicitly instrument completion/stall state under full load before changing its wait contract. Do not indiscriminately increase all test timeouts or call a single passing rerun proof of no failure.

No repair to product logic is established by this diagnostic sample. Original fixtures remain unchanged pending the implementer's route decision.
## Approved fixture-only candidate

Root selected single-transaction history setup and retained all 52 retention objects. The retention case now subscribes before reading current job state, resolves on a terminal state, unsubscribes in finally, and also unregisters in onTestFinished if the runner times out. Production emits job-status after committing COMPLETED; the original five-second runner budget remains. Other tests' settled helper is unchanged. No 52-to-25 reduction was implemented.

`review019-heavy-optimized-01.json` (fbe982): three selected cases PASS. Durations: pagination 256.7 ms, context budget 381.5 ms, retention 2361.1 ms. These are single diagnostic samples, not guaranteed upper bounds. The timeline cases retain 61 old pairs and the real new arrival, and 19 seeded pairs plus the real twentieth request respectively; original page counts, search strings, 16-pair/64000 budget and foreign/temporary exclusions remain. Node typecheck and scoped lint pass (27ffbb); files formatted.

Candidate test hashes, awaiting root's independent diff review:

- timeline-context.test.ts: `8D07F864A74E32DD38CDB1B2F5796ED23806B6369189442B142EC4BC7AB3E9B5`
- timeline-service.test.ts: `00A381E840BF0B248DBBBE7D0AEA533DCDC5B51275095BEB606F0A238B25BADB`
- retention-adversarial.test.ts: `121C9036CC39CC2175E404D3DA7D9CD8C0ABB601EBB73370EA0449918759D6A0`

Original full01/full02 and the instrumented unoptimized copies remain preserved. No source behavior, timeout or test count was weakened to obtain these results.
## Full03 residual failures — separate decision required

Root full03 remains FAIL: retention event-based 52-object case hit the runner deadline at 5229.4 ms; steward inaccessible-prefix case finished the eligible-job and exactly-one-send assertions, then failed its heartbeat gap bound (557.2 ms versus 500 ms; whole test 4495.8 ms). The successful optimized timeline cases do not erase these failures.

A new-process-per-file proposal is not a materially new isolation mechanism here. Installed Vitest defaults to forks/isolate:true. Its pool only reuses a runner when task.isolate is false (cli-api around3543); isolated runners are stopped (around3551), and single-worker isolated files form separate groups (around3884). Thus a single worker setting does not imply one long-lived test process accumulating all 230 files. Coordinator/host contention or unfinished work within a file remains possible but unproven; no specific host cause should be asserted.

Proposed next distinctions, not yet implemented:

- Retention: separate the 52-object synthetic setup into a case-specific beforeEach, recording its time under the existing hook deadline. Preserve the full test's five-second budget for preview, unrelated-work yield, confirm and actual 156-item drain. This makes the test budget measure its stated behavior, not unrelated construction. If that body still exceeds five seconds, it remains a failure and warrants per-stage profiling; do not raise the threshold silently.
- Steward: 72 suppressed entries plus the later eligible entry already reach COMPLETED and exactly one send. A deterministic responsiveness oracle can require another event-loop callback to run during discovery before the eligible dispatch, with bounded work per scheduling pass and retained permission exclusions. Such an oracle proves cooperative scheduling, not an absolute 500 ms latency guarantee. Keep the numeric threshold in a separately identified performance observation if it is not a user-facing hard bound; if it is mandatory, the measured breach must remain a performance REPAIR until explained or fixed.

The current candidate changes only the already-approved three fixtures. No further threshold, population-size or full-suite rerun change was made for this section.
## Scoped follow-up: retained deadlines and measured synchronous work

Root authorized retention setup separation only. The 52 real accepted memories now populate in a dedicated describe/beforeEach under the unchanged default hook deadline; the unchanged test deadline covers preview, asynchronous yield, confirmation, unrelated assistant work and all cleanup. No other case gets this setup. `review019-retention-separated-setup-01.json` records the targeted result. Root owns independent diff approval.

Steward opt-in diagnostics retain the original 500 ms heartbeat assertion and five-second runner budget. `review019-steward-stage-01.raw.txt` (298bbe): one selected case PASS, observed max heartbeat gap 161.4 ms. Inclusive synchronous timings show longest pump 148.8 ms, of which scanDiscovery took 140.3 ms; the next pump/scan were 116.6/110.9 ms. An individual update took 89.4 ms. Across 73 scan calls, inclusive scan time was 295.3 ms and 73 addJob calls totalled 229.5 ms. These nested times must not be summed as independent work. Wrappers measure the synchronous prefix until an async method returns its Promise, not the entire awaited operation.

The real scanDiscovery query uses LIMIT32 and marks backlog when all32 are returned. It evaluates sources and calls addJob for each; in the pump path each inserted job is an individual durable autocommit. Proposed product work, to be implemented independently: reduce the discovery batch (for example8), update the matching backlog condition, preserve queued blockers/unique source keys so a suppressed prefix still advances, and group batch writes in one synchronous transaction. The existing timer provides the inter-batch yield. Keep the72-suppressed-plus-eligible, one-send and500ms assertions unchanged. This addresses an observed hot segment; it is not proof that filesystem long tails cannot exceed500ms, nor a claim that the original full-run breach has been reproduced or explained completely. No product implementation was changed by this reviewer.