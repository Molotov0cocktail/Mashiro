# 010 live qualification preparation

2026-09-07. Root owns items-010-live-product.mjs; this is synthetic validation infrastructure, not product implementation or an independent PASS.

The script compiles actual ProviderService/AssistantService into an isolated temporary root, uses temporary credentials only, and requires explicit --preflight or --run. The fixed allowed endpoint is the existing authorized BigModel Chat Completions endpoint and model GLM-5.3-FLASH. A per-run request ceiling bounds unexpected loops; it is not a user cost authorization gate. It emits counts, known statuses and non-prose operation identities, retaining only synthetic failure data when necessary.

Actual --preflight result: LOCAL_PREFLIGHT_PASS, requestsAttempted=0, schemaAndGrantsInitialized=true; shell exit0. It initialized schema and endpoint-specific grants without reading the real Key. Syntax and scoped ESLint passed. No live request has run for010 at this checkpoint; previous program total remains13 requests,11260 observed tokens and3 requests with unknown usage.

Planned live closure: explicit natural task creation; service reopen with zero external calls; context-none search retrieves a random title absent from initial context; model creates one proposal without increasing formal count; original-assistant discuss/revise keeps the same proposal ID; repeated local accept command links exactly one formal item; natural completion changes the original item. Local API acceptance is disclosed and is not described as renderer-driven. Proposal/revision tool operation receipts are required. Real full-process restart and actual renderer interaction are separately validated by the Electron harness.

The initial draft assumed accept receipts point to the new item. Before execution, actual ItemService showed that they identify the proposal; the runner now checks that proposal receipt, its acceptedItemId and the unique item's originProposalId together. No failing product test was weakened. Existing memory008 bounded stream observation is reused only for counts/shape; unknown item tool names are masked there and actual trusted operation names provide the role evidence.

Network execution waits for trusted Provider/retention/source checks to finish, to avoid paying for known incomplete wiring. The product remains ACTIVE/IMPLEMENTING and requires independent review.
