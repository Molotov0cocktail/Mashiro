# 009 independent UI repair review

2026-09-07. Reviewer review_009, actual gpt-6-astra / medium, did not implement the UI repairs. Verdict: PASS for the three reported UI repairs on the exact bytes below. Whole MANUAL_CORE/009 remains pending a separate trusted listing/count repair and final integrated evidence; PROGRAM remains ACTIVE.

## Independently executed

- Original isolated UI oracle unchanged, SHA-256 `AB9D6B37FF331D02C07B4A4421A4F3FA1CEC5FC0D149696E5CA8BD3EA86C06B3`: 1 file / 4 tests PASS at 00:49:59, duration 1.52 s, exit 0. Command: `node node_modules/vitest/vitest.mjs run --config .agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/retention-009-review-ui.config.ts`.
- All renderer tests: 15 files / 69 tests PASS at 00:50:21, duration 4.59 s, exit 0. Command: `node node_modules/vitest/vitest.mjs run tests/renderer`.

The earlier failing evidence remains in [REPAIR 2](retention-009-review-repair-2.md), [REPAIR 3](retention-009-review-repair-3.md), and [REPAIR 4](retention-009-review-repair-4.md). No independent assertion was removed or weakened.

## Findings closed

1. AssistantPanel rejects older external/list/mutation snapshots using request/operation generations and latest accepted revision, rejects late errors/finally writes, and removes rename drafts for identities absent from accepted state. The real component no longer displays the purged identity after the held rename response. Author tests additionally cover initial list and all five mutation types. App source-switch double fence independently passes.
2. Empty-trash preserves explicitly selected trash IDs and versions. Non-trash selections are dropped, an empty selection cannot silently become a whole-memory-zone deletion, and pagination is honestly described. A deliberately imported conversation target remains available for original-round trash. Full trusted preview and local confirmation are retained.
3. MemoryPanel releases the digest registry identity only after the successful response is accepted under the same governance generation. Hidden late success keeps body-free identity; retry uses the original command ID. Existing ordinary visible success/new-creation regression passes, so normal intentional new creation is not permanently collapsed onto old identity.

## Exact reviewed UI bytes (SHA-256)

| File | SHA-256 |
| --- | --- |
| src/renderer/src/features/assistants/AssistantPanel.tsx | 3B5DC8217B8795E8EC7A3DE1C5AC07CE122619A7662A5B616B6D5221779CEB8D |
| src/renderer/src/features/retention/RetentionPanel.tsx | 2845D5C7B864F38836F557C323AFE4BEC86E03AE2F307429440974F6CC97A33D |
| src/renderer/src/features/memory/MemoryPanel.tsx | F7D7A975CF259F8FFBA48FB3D5B3498DE508249DB653B4D46B68E4D108310620 |
| src/renderer/src/App.tsx | D1D4669FD9C2C94689588CFDB40C158F3D3438698D6DEAF04BDF8232B47623DC |

## Root's Electron validation increment

Static review found no weakened prior lifecycle assertions. Seed now completes private memory cleanup before purging its owner; verify binds both cleanup job identities across a second process. The additional real renderer script uses native input setters/events and an actual form submit, then verifies a unique synthetic body through trusted query/inspect and visible UI; it does not replace renderer persistence with a mock. It runs after saving the original restoration evidence. The small synthetic dataset makes the query-count assertion valid here; it is not a general all-database count.

Static snapshot: e2e-controller.ts `23C92FF38E76D33D0D115922AA7785817C786DC7AEA13EB35151AFCDA973CE68`; harness `9CFD1400D99BF0045E1E2A3F4075EEF06BB9A8E4CA15FDA628B444CBF0E5260C`. Suggested recording `verify.memoryUi` explicitly in the final summary as well as asserting it during execution, so root may make that evidence-only addition. This reviewer has not run the new build/Electron or qualified future bytes.

No product/Git changes, Provider call, personal-data access or shared build by this reviewer. The new trusted tombstone listing/count issue is still owned by repair_009_cleanup and is not included in this UI PASS. RET policy, additional assistant-private user/event purge scope, real Q9 accepted-result dependencies, Q10 and program/release completion remain separately pending.
