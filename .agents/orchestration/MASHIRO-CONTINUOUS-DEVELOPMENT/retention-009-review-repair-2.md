# 009 independent UI review: REPAIR 2

2026-09-07. Reviewer review_009, actual gpt-6-astra / medium. Frozen renderer was independently tested: 13 files / 58 tests PASS at 00:18:14, duration 4.66 s. This does not cover the following nested component counterexample. Program ACTIVE; no FINAL PASS.

## P2: late assistant-management receipt restores deleted identity in local UI

`src/renderer/src/features/assistants/AssistantPanel.tsx` accepts successful list/mutation results through acceptSnapshot, which directly sets its own snapshot without checking a newer externalSnapshot or revision. Reproduction with the real component:

1. Initial snapshot revision 1 contains A with a private display name.
2. Click Save Name and hold the already-produced revision-2 rename response.
3. Deliver external revision-3 snapshot after permanent deletion; A disappears.
4. Release revision-2 rename response. A's private name and management controls reappear.

App's new receiveAssistantSnapshot lower-revision check protects the parent snapshot but cannot repair this child-local write: rejecting the old result retains the same parent object, so the externalSnapshot effect is not retriggered. App's source-navigation/list double fences are useful and should remain. Trusted authority still refuses deleted A; this is stale UI/private identity resurrection, not database resurrection or an independently proven body disclosure.

Narrow repair: fence every AssistantPanel local snapshot write against the latest externally accepted snapshot/revision and relevant request generation; ensure late initial list and ordinary mutations cannot roll back a newer purge. Clear removed identities' rename drafts as part of accepting governance state, without clearing unrelated valid drafts unnecessarily. Preserve the six assistant IPC channels and App fences.

Independent isolated test: [UI oracle](retention-009-review-ui-oracles.test.tsx), [explicit config](retention-009-review-ui.config.ts). Command:

```text
node node_modules/vitest/vitest.mjs run --config .agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/retention-009-review-ui.config.ts
```

At 00:20:47, duration 1.27 s: 1 test failed; expected no deleted private identity, received `<strong>已删除私密身份</strong>` at oracle line 23. The earlier 00:20:01 run failed before exercising product behavior because the isolated review location did not inherit JSX automatic conversion. Explicit `esbuild.jsx='automatic'` fixed that fixture configuration; the subsequent result is the actual product counterexample.

## Trusted repair 1 review continuation

The canonical-empty-file fix independently passed the original lifecycle assertion plus the author's 15 new cases: 2 files / 17 tests at 00:21:35, duration 3.32 s, exit 0. Static reading confirms safePath remains strict and empty resources require prior completed cleanup evidence plus canonical metadata/hash/tombstone association. Full trusted/suite and final source-byte qualification remain pending.

Reviewer-only integration test cleanup moved its root-path validation to a helper called from finally, resolving no-unsafe-finally without changing validation or product assertions. Original failing SHA `417234F43614C443520BD37D0396E3DD82B1A9DFD0B18B007B262678633713AB` was previously replayed by repair author; post-cleanup pre-format SHA `61A6D3018BD5ACC814C85CAF2F276384C208A1D768B9FC181924546895D96B39` passed 17 tests above. This is a proportional test-only lint repair, not a weakening of the reproduction.

Reviewer edits remain confined to its reports, isolated configuration/oracles and designated integration oracle. No product modification, Provider call, personal data, Git mutation, shared build or Electron execution occurred. UI author may read/run the new oracle; write ownership remains with reviewer until explicit handoff.
