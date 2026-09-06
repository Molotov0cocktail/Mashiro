# 005 second UI repair handoff

Role: high-reasoning diagnosis and repair Executor. Route: persistent-timeline-v1 / UI observation repair 2. This is implementation evidence, not an independent PASS.

Repair baseline: `b1aa9b9a1db6973799f42850b268f84ee1fccbcc`.
Reviewed product baseline remains `f5aa9880828b2a0719b6b8c16d1e4e05c475dcd6`.
The exact final containing commit and report SHA-256 are supplied by live Git in the handoff after commit; no self-referential future verdict is embedded here.

## Inputs and diagnosis

[Original second review](persistent-timeline-v1-review-b1aa9b9.md), SHA-256 `2C5DA8C026C288A99F042468DC3F85811146E83AC57FF5DACF7C6FECA35CAFAE`, preserved byte-for-byte.

Frozen reviewer R1/R2 oracle: `C:/Users/30910/AppData/Local/Temp/mashiro-review-8421760-7fadd8f281e34a51a8e21b293b0b5712/review-repair.test.tsx`, SHA-256 `42AD0A0C05CE0851EC77133E47E37D31D9E495EFC28E95B827B6737F9A2289BC`.

On the exact baseline, running that file through repair.config.mjs produced exit 1, two tests and two explicit failures: accepted partial disappeared after a failed read, and successful saved rows generated a false zero-save receipt.

Root cause: UI inferred execution facts from incomplete observations. A nullable read collapsed failed/superseded reads into confirmed absence. Separately, optimistic renderer UUIDs were compared with trusted stable IDs to infer an insertion count that the UI could not know.

Routes compared:

1. Add trusted admission and insertion-count DTOs to all command success/failure paths. This can supply new explicit facts but expands shared/trusted/IPC validation for facts already available at the current boundary.
2. Represent existing observations and command evidence explicitly in the renderer, and report the authoritative saved total rather than an unprovided insertion count. Chosen: preserves the existing contract and reduces unsupported inference.

## Repair mechanism

- Timeline reads return a discriminated snapshot/unavailable/superseded observation.
- Each captured request retains positive accepted and terminal evidence from trusted events/success replies. A fresh complete snapshot can confirm presence or, absent positive acceptance, non-admission. Trusted pre-admission rejection codes also establish rejection; storage/IPC uncertainty does not.
- Unknown outcomes retain input, partial and request identity with explicit uncertainty and no automatic retry. Accepted/terminal observations survive later unavailable replies; an already known terminal status is not downgraded to unknown.
- Both reads and saves use the same request+role reconciliation, preserving protected current/newer rows while adopting actual trusted IDs and saved metadata.
- A successful save reports only the confirmed saved total returned by trusted code, explicitly including previously saved messages. It never guesses newly inserted rows from optimistic IDs. Independent rejected drafts remain visible.

Product edits are confined to ProviderPanel.tsx. Repository regressions are in ProviderPanel-timeline.test.tsx. Task/progress and this report record the repair; the frozen review is archived unchanged. No main/shared/preload/schema/transport/dependency/lockfile change was required.

## Actual validation

- Frozen `review-repair.test.tsx` / repair.config.mjs: baseline exit 1, 2 failures; repaired exit 0, 2 tests. The frozen file was not edited.
- Frozen original `review-ui.test.tsx` / vitest.config.mjs: exit 0, 1 test.
- Frozen original `review-stream.test.tsx` / stream.config.mjs: exit 0, 1 test.
- `npm exec vitest run tests/renderer/ProviderPanel-timeline.test.tsx`: exit 0, 12 tests.
- `npm exec vitest run tests/renderer tests/integration/timeline-service.test.ts`: exit 0, 7 files / 31 tests (renderer 6 files / 19 tests; trusted timeline 12 tests).
- `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build`: all exit 0. No rule suppression or test skips.
- Added six repository cases covering failed/throw observations with accepted partial, ambiguous IPC outcomes without events, known completion despite lost replies, superseded old reads plus newer request isolation, optimistic-to-trusted IDs, repeat save and retained rejected drafts.
- Existing receipt assertions were updated from an unsupported newly-inserted count to the explicitly confirmed saved-total wording; false-zero, preservation and idempotency assertions remain.

Only initial frozen product red was observed during this repair; first repaired frozen run and repository additions passed. A JavaScript orchestration helper declaration initially failed to parse before any tool/file action; it was corrected without target mutation. Actual edits used exact counted transformations, recorded preimage hashes and sibling-temp atomic replacement; formatting was limited to the two edited code/test files.

## Boundaries and next action

The independent full trusted/migration/Electron qualification remains applicable because those sources and interfaces are unchanged. Independent reviewer run `df964408-2b79-46dc-9ced-fc3c3faa7d54` used PIDs 59660/62500, recovery calls 0 and explicit calls 1. Full verify/Electron/migration were deliberately not repeated for this renderer-only repair, as authorized by the review contract.

No push, paid/live Provider call, real personal-data access, credential-source search, Release/deployment, system security change or dependency action occurred. PACKAGED/installer, multi-instance, full crash recovery and advanced Provider capabilities remain outside scope; historical Toolhelp32 -003 was not rerun or extended.

Next action: independent exact-HEAD review of the entire `b1aa9b9..repair HEAD` delta against both original and second-review findings. Final product PASS/push remains with the independent review/closing chain. No user-owned gate is needed.
