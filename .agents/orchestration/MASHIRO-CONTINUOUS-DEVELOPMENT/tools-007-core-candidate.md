# 007 trusted core candidate

Status: IMPLEMENTED CANDIDATE / independent review pending. PROGRAM ACTIVE.

Executor: gpt-6-astra, inherited medium. Route bounded-glm-tools-v1, attempt 1.
Product baseline 88a86a2dacc616ca3a6fa0ba63a345f059d88859; current HEAD e73fd7e56c37970579e04fcff618f5f77894d166 is the subsequent docs/evidence-only closing commit. This executor made no commit, push, paid request or credential lookup. UI files remain the separate executor's ownership.

## S0 evidence and frozen semantics

On 2026-09-06 the executor read the current official model/API pages via approved host HTTPS after browser fetch failures, the thinking-mode page, the existing probe and the relevant authoritative design sections.

- [GLM-5.3-Flash](https://docs.bigmodel.cn/cn/guide/models/vlm/glm-5.3-flash.md): model code glm-5.3-flash, text parameters shared with GLM-5.3, required enabled thinking, recommended preserved thinking and streaming tool mode.
- [Current API](https://docs.bigmodel.cn/api-reference/模型-api/对话补全.md): Flash reasoning levels low/high/max; ChatThinking clear_thinking is a previous-turn control. true removes historical reasoning while retaining visible messages and tool call/results. It does not disable current-turn thinking.
- [Thinking modes](https://docs.bigmodel.cn/cn/guide/capabilities/thinking-mode): active interleaved tool chains must return observed reasoning unmodified; standard API and Coding Plan defaults differ.
- Source UTF-8 SHA-256 observed: API E49B4FEF3CD9AC02A5A39699E3315C75FA8F6F53C8002E5DCBB218AF373113D1; model page 5E1BBE1CCC790AACC737E348E30F0A7920F5F912D1FCFB702CD157226A8C8E52.
- Existing probe report/script independently hashed to D5B6BBA618FFC8B10B6143829FB92C124C2B191E290149D27F64F2CC9FFF9EAA and 3AB54FBA190C0F22A46CBE0A4AC772C8069ABE9182C78D5F1D6FE916324F7954. Historical four calls, three observed usage 994, first usage unknown; tool reasoning NOT_OBSERVED. No qualification is inherited by the new product adapter.

Frozen wire: exact normalized standard endpoint https://open.bigmodel.cn/api/paas/v4, case-insensitive GLM-5.3-FLASH match, adapter glm-5.3-flash-tools-v1, thinking enabled, explicit clear_thinking=true, reasoning_effort=low, max_tokens=2048, tool_choice=auto, tool_stream=true only for tool streaming. No Beta URL, arbitrary template, vendor strict or parallel claim.

Closed-turn replay retains the complete current-user tool call/result sequence and removes only previous-turn reasoning. Active chains retain original reasoning exactly. The implementation initially replayed only visible text; the S0 API evidence did not justify dropping tool pairs, so this was corrected before candidate delivery. Selected replay begins at that segment's last user message, requires its inherited sources, and never injects the segment's earlier context. Incompatible endpoint/model/adapter or incomplete segments fail closed with CONFIGURATION; selecting no history starts a new independent request. No interrupted model continuation is retried implicitly; local operation inspection never dispatches a tool.

Limits: 3 tool rounds, 4 calls per round, 32768 argument characters, 120000 reasoning characters, 524288 UTF-8 bytes of complete protocol messages, 120 seconds total chain, 2048 output tokens per request. Existing native transport bounds each wire response to 4 MiB, with a fixed maximum of four requests. Temporary ledgers additionally cap all assistants together at 64 segments and 768 operations; each existing assistant temporary session remains capped at 32 turns. Exhaustion returns LIMIT without trimming active protocol.

## Implementation and ownership

- Shared narrow tools scope, operation receipts, capabilities and strict input/output schemas. Existing six assistant channels unchanged; two Provider reads added, no arbitrary tool-dispatch IPC.
- Complete response validation before execution; fragmented Unicode/JSON SSE, choice/index identity, duplicate/conflicting/sparse/unknown calls rejected. Reasoning stays in trusted protocol storage and out of events/chat.
- Real current clock and literal current-assistant history search. Tool name/arguments cannot provide assistant, path, SQL or permission. History scope intersects this request, selected/recent range, readHistory and actual endpoint sendHistory. Leading/trailing search whitespace is preserved; blank-only query is rejected.
- Rechecks before dispatch, before reading, after reading, before protocol result/reply continuation and after uncooperative transport. Successful reads retain SUCCEEDED even if subsequent response fails or permissions are withdrawn.
- Schema v5 transaction adds protocol_segments, tool_operations, protocol_results, timeline_sources and provider_capability_evidence; previous schema DDL untouched. Stored protocol/mode and argument versions are explicit; expected object version remains a null slot for future write tools. Actual result and SUCCEEDED receipt share one SQLite transaction.
- Temporary ledger has no persistent store reference. Explicit save copies accepted visible messages only; clear removes only that assistant's temporary protocol.
- Stable mapping segment/modelRequest/toolCall to operation identity, argument/name conflict rejection and terminal-state transition protection. Recovery turns PREPARED into confirmed not dispatched and DISPATCHING into unknown; cold start sends nothing.
- Capability evidence is keyed by actual endpoint/model/adapter/mode; real default-transport normal-mode successful requests may record LIVE_VERIFIED. Injected service test transports and the old standalone probe do not. Missing one usage record makes whole-chain usage unknown.
- Query-by-requestId locates a complete original pair and is strictly exclusive with nonempty query/before; it is always filtered by assistant.

## Red and green verification

- Initial new protocol oracle failed because ToolAccumulator was absent.
- Initial actual service clock oracle failed with injected clock called 0 instead of 1, then passed with one actual read and a second transport call.
- Final trusted suite: node node_modules/vitest/vitest.mjs run tests/unit tests/integration — exit 0, 17 files / 123 tests.
- node node_modules/typescript/bin/tsc -p tsconfig.node.json --noEmit — exit 0.
- Owned src/shared, src/main, src/preload, unit/integration tests, lifecycle and live harness ESLint --max-warnings=0 — exit 0.
- Owned files formatted using Prettier through guarded writes.
- node node_modules/electron-vite/bin/electron-vite.js build — exit 0.
- node scripts/electron-f1-harness.mjs — exit 0, fresh real Electron PIDs 25816/87296; Electron 44.1.1, embedded Node 24.19.0, SQLite 3.53.3. Stable successful operation identity restored, zero recovery Provider calls, explicit next request retained closed tool pairs without reasoning, temporary tool protocol/body absent after restart. Latest raw evidence is test-results/electron-f1.json; global recorder should archive final merged/reviewer evidence.

Coverage includes two nonempty reasoning rounds, cross-turn field retention, non-stream duplication prevention, all-call validation before any execute, malicious arguments, zero cross-assistant selection/navigation, selected source inheritance, changed model rejection, literal spaces and SQL wildcard search, PREPARED/DISPATCHING/SUCCEEDED cancellation, read-after-withdrawal receipt truth, malformed late output cancellation, argument conflict and unknown recovery, v4 migration rollback collision, temporary global bounds and zero persistent protocol during save/clear.

## Attempts and remaining validation

The patch helper updated a new file but failed before reading an existing-file patch. No partial update occurred; explicit hashes were checked. The approved host Node writer used exact allowed paths, SHA-256 preimages, one-match transforms, same-directory temporary files, backup plus atomic rename, postimage verification and cleanup. All pre/post hashes were emitted.

First full trusted run found expected v4 fixture and channel-count drift, plus narrow error-code types. Synthetic active-test downgrade fixtures now remove v5-only tables before marking themselves historical; archived historical evidence was not rewritten. The first enhanced Electron run used an obsolete visible-only context expectation; the repaired oracle additionally requires a retained tool result and checks its exact call relationship without reasoning. Later lifecycle passed twice; latest PIDs above.

This executor has not run paid requests. The sanitized tools-007-live-product.mjs invokes the actual current service/transport/clock/storage path, caps two outbound requests, verifies actual tool ID/result and exact returned UTC in the final reply, and leaves key injection to root. It is not a renderer live invocation; real renderer/preload/IPC is separately exercised by the two-PID lifecycle.

Root product live qualification subsequently returned SUPPORTED, exit 0: [sanitized result](tools-007-live-product-result.json), exact script B9701D326E0141A8A69E94F58651E80D31A83176FB27D7DCD97F9E94205DF985. Two actual streaming/tool_stream requests with explicit clear_thinking=true; one successful real clock operation; matching returned tool result; final 79-character answer contained the exact UTC result. Usage 467 prompt / 54 completion / 521 total, product capability tools LIVE_VERIFIED. Both requests observed no reasoning; preserved/interleaved tool reasoning remains NOT_OBSERVED. Program cumulative requests are now six, observed usage 1515 plus the unknown first probe usage. This executor read the saved sanitized result; root alone injected/cleared the key. Renderer-driven live and cross-user-turn live were not run.

A final history-only correction reads limit+1 before setting the truncation flag, so exact-limit results are not mislabeled. This does not change the live clock branch. Final trusted suite 17 files / 123 tests, node typecheck and owned lint passed after it.

Global merged verify, final UI tests, dependency/foundation/scans and fresh independent reviewer remain coordinated by root. Root owns vitest.config.ts discovery separation for archived historical 006 test snapshots; this executor did not modify those archived files. Scoped secret-pattern/residual scans and Git diff --check passed. Other providers, vendor strict, parallel execution, preserved tool thinking live, business write tools, personal data, installer and release qualification are not claimed by this slice.
