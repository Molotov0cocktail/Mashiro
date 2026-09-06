# 010 live failure diagnosis

2026-09-07. Product role qualification remains INCONCLUSIVE; no full010 PASS or release is asserted. Actual failures are preserved and no unchanged paid full-chain retry was made.

## Run1: creation and recall pass, proposal protocol failure

[Raw run1](items-010-live-run-1.json):5 requests,11870 observed tokens, all5 request usages available. The actual product created one item from an explicit natural instruction before Provider continuation; service reopen caused0 external requests; a context-none search retrieved the random title absent from its initial context. Proposal generation then failed withPROTOCOL after a valid JSON tool call. The bounded legacy observer did not have the new schema, so it could not identify the invalid field.

The retained synthetic database contains4 successful operations (apply_item_intent, two search_items, get_current_time),0 proposals, and an interrupted protocol segment without the rejected proposal call. It cannot recover that discarded argument body. Root inspected only table/role/name/count shape, without logging source text or arguments. Actual retained product bundle SHA256:88144A4ED0DC3D2D350245F609A8D7712B1BDAEA0587A9536D424C8C771F323C.

## Incremental diagnostic2

Root added an items-specific bounded observer with allowlisted field paths and actual tool validators. A local synthetic SSE oracle verified that invalid candidate fields are reported and raw argument values are absent, network0. The original008 observer and historical evidence were not changed. The runner now records its actual bundle SHA256.

[Raw diagnostic2](items-010-live-diagnostic-2.json):2 requests,4697 observed tokens, both usages available. This ran only the proposal phase and did not repeat the successful creation/recall prefix. propose_item arguments were valid JSON with known top-level candidate/evidence fields; the precise error was invalid_type at candidate.counterpart. No formal item or proposal was created. Bundle SHA256:bc31b6ecb604024efe9ea4d0d1aacdf64fe121ed300d0ab4ba7d1bc006afad84.

The observer deliberately did not record the value, so the evidence does not distinguish null from an omitted field or another invalid type. The existing product plan makes the optional commitment/waiting counterpart absent when unspecified; an engineering route is a narrow tool-wire representation accepting null/absence and normalizing to the internal empty string, while rejecting numbers/objects and retaining all other strict candidate validation. The trusted owner must verify this with discriminating local cases before another paid qualification; this is not permission to use passthrough or accept arbitrary fields.

## Updated run3: wire passes, deeper evidence/reference failure

[Raw run3](items-010-live-run-3.json):4 requests,9605 observed tokens, all usages available. Updated wire accepts an absent optional counterpart and then normalizes through the full persistent schema; malformed types and other fields remain rejected by local tests. Creation/reopen/recall passed again. propose_item validSchema=true then failed withPERMISSION_DENIED and a CONFIRMED_NOT_APPLIED operation; no proposal was created. This is a different earliest failure after the wire repair, not another unchanged schema retry. Bundle SHA256:58411338145045897a94b1e735b2116099874f1778cab33aa6b40528767ccd4a.

Read-only sanitized ledger analysis found evidenceChars55, rawIncludes=true, rawEquals=false, anchorExact=false, anchorCount4 and coveredAnchors2. The evidence is an original contiguous quote spanning two clauses, while current matching only accepts one exact split clause. The candidate also contains one related ID: existing-item count0, mentioned-in-user-text count1. Thus the model treated the synthetic topic UUID as an item reference; this invalid relation must remain rejected. No raw quote or ID value was logged. The trusted owner is evaluating canonical original-clause coverage, grounded reference handling and a confirmed-not-applied tool result that allows correction, with local discriminating fixtures before another call.

Current010 totals across3 runs:11 requests,26172 observed tokens. Current program totals:24 requests,37432 observed tokens,3 earlier unknown usages. The earlier accounting below describes the checkpoint before run3 and remains historical.

## Closure after updated run 4

[Actual role run 4](items-010-live-product.md) is SUPPORTED after the wire, source-anchor and confirmed-not-applied feedback repairs. Nine new requests /22,923 tokens completed proposal, same-ID discussion, idempotent acceptance and natural completion as well as the prefix. Current010 totals:20 requests/49,095 observed tokens; program:33 requests/60,355 observed tokens plus three earlier unknown usages. Prior failures and their accounting below remain historical. Independent product review and remaining preview/deletion work are still pending.

## Accounting and remaining work

010 so far:7 requests,16567 observed tokens,0 unknown usages in these two runs. Program cumulative:20 requests,27827 observed tokens,3 earlier unknown usages; historical003 calls remain separately documented. Some reasoning text was observed as character counts (307 across these runs), but exact reasoning continuation compatibility is not independently qualified by these counts. Passive observer incomplete flags are preserved; they are not silently changed to complete-wire qualification.

Credentials were process-only, removed in finally, and never written into the synthetic database, reports or product bundle. Two failed synthetic roots remain for scoped inspection; original evidence is retained. Next: strict optional-field wire repair and local tests, then a genuinely updated live run covering proposal revision/acceptance/completion as well as the already demonstrated role prefix.
