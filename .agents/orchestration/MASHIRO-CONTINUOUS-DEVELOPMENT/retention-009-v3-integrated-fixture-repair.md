# RET 009 v3 integrated fixture repair

The integrated provenance test opened `ProviderService` over one accepted persistent memory and immediately attempted an increasing correction. The trusted tool receipt was `CONFIRMED_NOT_APPLIED` with `MEASUREMENT_UNKNOWN`, because the required startup audit was still pending. This was the intended fail-closed product behavior.

Only `tests/integration/memory-service.test.ts` changed (SHA-256 `7057AEA364F91C421429C6B70B6B3562A3962EB5F7935B729A2E23A3DD2E00E1`). The fixture now polls the production retention policy API for at most 20 event-loop turns and requires audit state `COMPLETE` before the original search → correction → continued-answer scenario. Its original `SUCCEEDED`, version 2 body, and old historical replay rejection assertions remain unchanged.

`npm exec vitest -- run tests/integration/memory-service.test.ts` passed 1 file / 20 tests. [Raw JSON](retention-009-v3-memory-service-run-01.json) SHA-256 `03B7813FB2E1A7A16AEF88747B6EAE19F699C0103B8CB11588D5B124B2375870`. Node and Web typecheck, scoped ESLint, and scoped Prettier also exited 0 before the v3 freeze. The 44-path [v3 manifest](retention-009-author-manifest-v3.json) SHA-256 is `64BBC021B3926296AFF20F6909E4567881821399206297D907492FC0F38B1A34`.
