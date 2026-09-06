# 009 independent UI review: REPAIR 4

2026-09-07. Reviewer review_009, actual gpt-6-astra / medium. Program ACTIVE; no FINAL PASS.

## P1: discarded late success frees the still-unreported creation identity

`MemoryPanel.tsx` mutateTracked removes the digest registry entry immediately when `api.mutate` resolves `ok`, before checking whether its expected governance still applies. submitWrite then detects the newer governance generation and discards that successful response without showing its receipt. These two decisions disagree about whether the operation has been acknowledged to the current UI.

Counterexample: B sends an ordinary creation; A cleanup conservatively broadcasts A and B; B's form is cleared; the old successful receipt arrives and is hidden; entering the same unresolved title/body now sends a new command ID. Trusted idempotency cannot identify that as the original command. An ordinary, visibly handled successful creation must still release its key so an intentional later new creation remains possible.

Independent real MemoryPanel test holds the response, delivers cleanup, verifies the private form is blank, releases a successful receipt, verifies the old success text is absent, then resubmits the exact payload. Expected original ID `40f86af8-764b-48b7-8e07-9f2fbd31dbea`; actual new ID `e62b061c-6143-4b9f-9f33-73fa4f1398e9`. This test demonstrates new UI dispatch identity, not actual database duplicate rows or a new Provider call.

Repair: release the registry entry only when handling that success under the matching governance/lifecycle context, or explicitly retain a body-free acknowledged-but-not-yet-presented identity for retry/inspection. Do not retain plaintext, auto-replay a command, or force all future same-content intentional creations to reuse an old ID. Include the existing ordinary-success/new-creation regression.

[Independent UI oracle](retention-009-review-ui-oracles.test.tsx), fourth test, explicit [config](retention-009-review-ui.config.ts). Run 00:29:28, duration 1.65 s: 4 tests, 3 failed / 1 passed. Other failures are the separately documented late AssistantPanel mutation and discarded empty-trash selection; App source-switch fence passes.

No product changes by reviewer. This finding was sent to root for engineering disposition and the current UI writer's narrow repair. No Provider, personal data, Git or shared build actions.
