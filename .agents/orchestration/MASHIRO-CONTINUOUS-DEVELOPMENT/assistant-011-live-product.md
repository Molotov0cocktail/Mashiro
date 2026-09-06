# 011 real profile role increment

2026-09-07. SUPPORTED for the actual service increment, not full 011, renderer, process-restart or packaged acceptance. Coordinator used only newly created synthetic data and the user-authorized endpoint/model, https://open.bigmodel.cn/api/paas/v4 / GLM-5.3-FLASH.

[Runner](assistant-011-live-product.mjs) bundles the current actual AssistantService and ProviderService; accepted bundle SHA256 6d6f57b2f2a89b10850e0886a0a8629b5a55f10f9696b9b5e06a8ef1c9af0a18. It saves a synthetic persona and built-in moon avatar through actual rename/CAS, then sends normal and strict-temporary text with tools off. The passive fetch wrapper checks the exact endpoint/model, system persona presence and absence of normal-only synthetic text in temporary requests; it never changes outgoing payloads.

[Successful JSON](assistant-011-live-run-2.json), SHA256 87175FDB259427F5705388B569A5BF2B2606FF0D920A7EEBF10AB8B007F59F70, records 2 requests, both HTTP200/completed and both actual responses containing the random persona marker. Normal usage178/29/207, temporary147/48/195; total input325/output77/402 tokens. No response/persona/random-marker prose or credential is logged. Before/after temporary counts are equal for timeline_messages, protocol_segments, tool_operations, memory_objects, items, item_proposals and item_commands. This is row-count evidence plus outgoing-body assertions; detailed adversarial content and old-job checks remain separate deterministic tests.

After closing the Provider service, reopening AssistantService preserves the same ID, persona and moon avatar with zero network calls. This is same-process service reopen, not a fresh Electron PID. Successful synthetic root was removed by the prevalidated OS-temp direct-child guard; credentials existed only in process memory, were deleted from the runner environment immediately, and shell cleanup ran.

## Preserved preparation failure

[First JSON](assistant-011-live-run-1.json), SHA256 3176DD024D3C670F07BC176DE4E1E3DC7F0E04888D0140A8AD7B07F72C16DAC4, records INCONCLUSIVE/TEMPORARY with zero actual requests. The runner reused a tool-mode max_tokens<=2048 assertion. Actual chat-completions-transport.ts only sets that field in tool mode; ordinary text omits it. The passive wrapper rejected locally before originalFetch, and the service sanitized the local failure to TEMPORARY. The fixture now permits omission and explicitly records maxTokens:null. No product change or relaxed persona/temporary assertion was needed. Existing transport timeout, response limits and runner two-request ceiling remain; this does not claim a provider-side 2048-token text cap.

The first shell wrapper did not preserve the Node exit code through its finally cleanup and reported shell0 despite JSON INCONCLUSIVE. The second wrapper captured LASTEXITCODE before cleanup and exited with it; successful run exit0. The retained first synthetic root is recorded in its JSON. It contains only synthetic data, never a persistent key. No paid retry occurred before the local cause was identified.

An earlier --preflight passed profile save/reopen with zero requests. It did not validate response style or temporary outgoing content; the runner's preflight disclosure was corrected to mark those checks false. This preparation is not additional paid usage.

## Accounting and continuation

011: 2 paid requests, all usage known, 402 tokens. Program cumulative: 37 requests, 68334 known tokens, plus the original 3 unknown usage records; historical003 remains separate. 010 remains22 requests/56672 tokens. No other vendor or background role is qualified here.

Independent 011 review still must inspect final source, migration, permission/CAS barriers, UI and the final build/Electron candidate. Later request-composition changes need a reasoned evidence delta; do not rerun unchanged paid calls solely for a new report/commit hash. PROGRAM remains ACTIVE through reminders, background, full Windows delivery and actual release/download verification.
