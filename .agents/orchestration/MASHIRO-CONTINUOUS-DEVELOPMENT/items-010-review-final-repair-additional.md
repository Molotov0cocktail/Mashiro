# 010 independent review — additional repair and continuation

2026-09-07, review_010_final, actual gpt-6-astra / medium. VERDICT: REPAIR. Ongoing candidate audit, not final PASS. Baseline HEAD 44c01f7316a1cad1dc20213d74ca641c8d435ca2; previous reviewed product d6cd1fa. Earlier source merge findings and exact old hashes remain in [repair 1](items-010-review-final-repair-1.md).

## Independently observed results

- The original selected-item self-reference and source-65 truncation oracles passed unchanged at 02:48:51 after the trusted author's bounded source merge repair. No full candidate PASS follows from these two tests.
- P2, evidence identity over-suppression: old full evidence “我在考虑修车，车辆可以正常行驶” and new full evidence “我在考虑修车，车辆已经无法启动” both canonicalized to only the first clause. Initial independent unit oracle failed at 02:45:46, exit 1. This prevents new material non-date conditions from creating a new suggestion after rejection.
- P2, evidence identity bypass: exact same user text “我在考虑修车，下周开始”, exact same candidate. First model call quoted the entire evidence and created a proposal; local user rejected it. A later call shortened evidence to “我在考虑修车” and created a second card. Initial independent ProviderService oracle failed at 02:47:13, expected one proposal but got two. This file contains one incidental author regression copied with the fixture prefix, plus one independent suppression test; count them honestly.
- Both evidence oracles passed unchanged in the combined 02:53:26 run after author changes. Source review of that repair and final stable candidate verification remain pending. Do not treat these greens as a frozen-candidate review.
- P1, retained transitive withdrawal: item-service.assertSource catches a failed direct source check and tests withdrawal only for the direct edge ID. A retired direct round with a retained recipient exception can therefore hide withdrawal of an upstream dependency. Independent synthetic direct oracle failed at 02:48:51.
- The stronger public-lifecycle oracle also failed at 02:52:06: create a real shared global memory owned by assistant B; attach its dependency to assistant A's round; create formal item derived from that round; publicly purge A and wait for cleanup job completion; publicly confirm withdraw-information on the shared memory as B. Both governance actions succeed, but item assertSource still permits B at its old endpoint. Formal local preservation is intended; continued source-derived external access after withdrawal is not.
- Initial public-lifecycle fixture attempted the second governance operation while the first cleanup job was active and correctly received STALE_PREVIEW. This was test sequencing, not a product finding; it was fixed by waiting for actual COMPLETED jobs. A diagnostic edit initially failed because PowerShell converted the null backup argument to an empty path; target was unchanged, then a real backup path enabled atomic replacement. Behavioral assertion was never weakened.
- At 02:53:26 the archived combined run showed 4 files: 2 passed / 2 failed; 5 tests: 3 passed / 2 failed. Only the retained and public-retained assertions remained red. [Raw output](items-010-review-final-additional-run.txt).

## Concrete missing conversation capability

The current recognizer supports create, transition and title rename, but cannot prepare a deadline/description/counterpart update for an existing formal item. The tool surface offers search_items, apply_item_intent, propose_item and revise_item_proposal; propose creates a new candidate/new item, and revise only handles proposals. Thus a precise command to change an existing item's deadline cannot affect that original item through any current tool route. This is a missing capability rather than a demand to parse arbitrary ambiguous Chinese.

The renderer has an ItemContext type accepting formal items, but App only establishes itemConversationTarget through proposal discussion. ItemPanel exposes proposal discussion, not a formal-item conversation entry. Root reviewed this finding and authorized filling both gaps, rather than reducing 010 acceptance.

Bounded completion: offer a formal item conversation entry carrying stable item ID/current version; prepare a trusted finite field update on that same object, with explicit date/timezone validation and a clear actionable confirmation/clarification path for unrecognized fields. Never invent target ID/version, silently create a duplicate formal item to implement an edit, infer an ambiguous deadline, or let model assertions grant authority. Add discriminating UI and Provider integration tests. Existing proposal origin restrictions and restoreArchived semantics remain intact.

## Repair constraints and evidence ownership

Trusted author retains main/shared/preload and trusted-test ownership; UI author retains renderer/tests ownership. Root owns global progress, Git and scheduling. Reviewer has not changed any product source, Git, build/Electron state or paid Provider calls. The pre-repair author manifest/result and two-PID evidence are historical inputs and require final delta handling after the new source/UI changes.

For retained-source repair, withdrawal must dominate retained exceptions across the complete bounded dependency closure. Preserve current-version and source authority guards, specific recipient/object/version scope, new-endpoint denial and formal local preservation. Do not turn all sourceCheck failures into generic retention permission.

The six reviewer-owned temporary test files are archived byte-identically below and removed from tests before handing off. To rerun, restore each archive to its listed original path; leave assertions unchanged. Only the public-retained fixture had diagnostic/job-sequencing changes before its archived final version. Do not modify archives. The suppression archive includes one incidental author test as noted above.

| Archive | Original execution path |
| --- | --- |
| [Provider oracle](items-010-review-final-provider-oracle.ts) | tests/integration/items-010-review-final-provider.test.ts |
| [Source limit oracle](items-010-review-final-sources-oracle.ts) | tests/integration/items-010-review-final-sources.test.ts |
| [New evidence oracle](items-010-review-final-evidence-oracle.ts) | tests/unit/items-010-review-final-evidence.test.ts |
| [Suppression oracle](items-010-review-final-suppression-oracle.ts) | tests/integration/items-010-review-final-suppression.test.ts |
| [Retained oracle](items-010-review-final-retained-oracle.ts) | tests/integration/items-010-review-final-retained.test.ts |
| [Public retained oracle](items-010-review-final-retained-public-oracle.ts) | tests/integration/items-010-review-final-retained-public.test.ts |

Next: author finishes retained repair and original-item conversation field-update path; UI finishes formal-item entry; freeze new manifests, restore unchanged oracles, then resume this independent reviewer for final source/diff review, tests and risk-scaled static/Electron evidence. Root confirms the prior items-010-trusted-ui.png shows the chat tab, not an item-panel visual; capture the actual item panel in the next required Electron run. Program remains ACTIVE; TASK_DONE is not PROGRAM_DONE. No new user gate or extra paid call is required for these bounded repairs.