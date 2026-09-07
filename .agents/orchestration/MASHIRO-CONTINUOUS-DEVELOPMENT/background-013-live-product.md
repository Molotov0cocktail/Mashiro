# 013 real chapter role verification

2026-09-07 root ran the [explicit synthetic runner](background-013-live-product.mjs) through actual ProviderService/BackgroundService/MemoryService. [Sanitized result](background-013-live-run1.json) reports SUPPORTED. The user-provided authorized test key existed only in the invoking process environment and in temporary product credential memory; it was removed from the environment and never written into the bundle, Git, report, or package. Successful isolated root was removed after services closed. No private user data was read.

The frozen esbuild product bundle SHA-256 was `7552ab3a82d8023c628411b7e77fdfa2b33084b49689cc1d35d64ba0faceb025`. Source baseline 815e778 plus the in-progress 013 candidate was bundled once before the first request. Later source edits do not change these executed bytes. Scoped runner ESLint passed. A preceding complete synthetic-transport preflight exercised the same bundle and three calls with zero network requests.

Actual endpoint https://open.bigmodel.cn/api/paas/v4, model GLM-5.3-FLASH, all three HTTP 200:

1. Normal conversation records a unique synthetic archive code, with no item/reminder request. Background is disabled and queues nothing. Usage 144 input / 35 output / 179 total tokens.
2. Explicit assistant private-memory read/write and current recipient permissions, chapter configuration and UTC-day budget (one call / 30000 input characters) enable the actual chapter role. The request carries max_tokens=2048. A faithful Markdown summary is accepted through the actual memory version and transaction receipt; the code is preserved. Usage 294 input / 90 output / 384 total tokens. The persistent budget records one call / 584 input characters, known usage and zero unknown attempts.
3. Disable further background work, select the accepted chapter by ID/version into a fresh normal conversation, and ask for its archive code. The actual outgoing system context includes the accepted summary; the actual answer contains the unique code. Usage 254 input / 32 output / 286 total tokens.

The services then close and reopen without a key. The same chapter Markdown remains readable, the budget remains consumed, and 1200 ms observation causes zero new requests. This is a service reopen in one process, not a process restart or native UI observation.

This run totals 3 requests / 849 known tokens (692 input / 157 output). Program accounting becomes 44 requests / 77993 known tokens, with the existing five unknown-usage requests unchanged. No failed paid attempt or retry was needed here.

Limits: rendererDriven=false, processRestart=false, packaged=false. This qualifies the chapter role and selected-context path at the stated endpoint, not all steward/observation/daily roles or every optional Provider capability. Local adversarial budget, revocation, deletion, job recovery and final independent review remain separate required evidence. 013 remains ACTIVE and its later required workflows continue.
