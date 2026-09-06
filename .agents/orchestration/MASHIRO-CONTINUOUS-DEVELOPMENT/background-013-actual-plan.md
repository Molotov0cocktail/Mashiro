# 013 background and steward: source preparation

2026-09-07, root read-only preparation during012 implementation. Product072dd39/docs6da9ee9; do not edit012-owned provider/main/shared/schema concurrently. This is an execution plan for [013](../../../doc/tasks/013-background-and-steward.md), not product completion or a new scope exclusion.

## Actual integration seams

MemoryService already owns memory_pending, immutable Markdown versions, source DAG, accepted version/hash, permissions and suppressions. It marks new accepted writes pending but has no steward job runner. RetentionService exposes RetentionDependencies.inspectOriginal(assistantId,requestIds) returning blockers and accepted{id,version,hash}; the default deliberately blocks recycling.013 must supply actual stored products and unresolved-topic/operation dependencies, not change a boolean to bypass the blocker. Current Provider transport accepts messages/model/tools/stream but exposes no configurable output limit: tool mode has fixed2048 and ordinary text has none. Background budget cannot merely reuse an ordinary request and claim a token ceiling.

## Roles, authorization and budgets

Implement durable function/role settings and job records, with explicit user selection of connection/model, allowed data and budget before enabling. Assistant-local chapter/relationship/continuity work remains bound to that assistant; warehouse global work is a distinct role without automatic private-timeline access. Share transport and credential handling, but not unfiltered conversational context or the current assistant's blanket authority. Before every external send and result commit, recompute the current recipient/source permissions, cancellation and deletion generation. A model's output cannot rewrite these settings.

Persist a reservation before each paid request: count and bounded input/process amount, plus supported output limit when selected. Settle observed usage without counting cached/reasoning subfields twice; missing usage stays unknown and conservatively consumes the reserved bound where needed. Repeated resume or concurrent runners cannot overspend the same budget. Unknown remote completion remains visible; do not retry indefinitely or switch models. Request identity plus feature/assistant/endpoint/model permits the running-center aggregation required byG03, separate from business operation records.

## Jobs and accepted results

Create normal-conversation increments only after eligible persisted completion, never from strict temporary text. Jobs capture source IDs/versions and bounded content when authorized; avoid copying bodies into ordinary diagnostic logs. Leases/version checks provide one active attempt, and startup marks interrupted states honestly. A completed local business commit and receipt share the transaction; orphan Markdown cannot be accepted by a later scan. User edits, trash, withdrawal and tombstones must invalidate obsolete jobs before accepting their result.

Warehouse handles deduplication, branch assignment and conflicts over the permitted global increments. Preserve each source and whether content is a statement, faithful summary or inference; do not merge an inference into a confirmed fact. New inferred habits remain labelled and source/time-supported. Conflicts are visible and do not overwrite a later user correction. Changes still have default-collapsed source/change inspection.

Assistant work produces browsable chapters, accepted summaries, continuity and unfinished topics. Chapter range uses complete request/tool relationships; selected context can include a currently authorized accepted chapter, with original range and version shown. Accepted memory/summary IDs and actual Markdown hashes feed inspectOriginal; unresolved topics or business operations continue to block009 recycling. Compressing never automatically deletes original messages.

## Daily workflows and visible completion

Daily brief, evening review, weekly planning, deadline/change prompts use configured schedules, scopes and budgets. Scheduling can reuse012 runtime wakeups but never bypass model budget because deterministic reminders are offline-safe. Output must be a readable saved result with sources and retry/cancel state; planning suggestions enter010 proposals and no formal reminder before confirmation. NoClender integration claims. Run-now uses exactly the same permission/budget/job path as scheduled work.

Provide an integrated running center, pending-organization view, chapter browser and real configuration controls. Default warning/error view merges repeated errors by stable cause without hiding current failures or unknown work. Expose business receipts separately from model usage and diagnostic events. No model Key or private body in ordinary logs.

## Discriminating qualification

Zero configuration means zero external calls; revoked/disabled recipient and cancelled jobs send/commit nothing new. Parallel reservations stop at the actual configured limit. Real endpoints must complete warehouse structured output and a daily workflow through actual services, with exact parse/schema validation and honest unsupported role capability. Simulations test malformed results, duplicate completion, crashes before/after accepted pointer and local receipt, stale job after user edit/withdrawal, source permission changes, and failed summary save blocking recycling. Use a real synthetic backlog/heartbeat measurement to decide whether a worker is needed; do not rewrite all work into a worker without evidence.

After013, close009 dependency integration and012/014 cross-module preservation. Continue whole-doc acceptance and actual Windows release/download verification. Pending user decisions remain pending; no new non-goals or automatic budget/retention defaults are introduced here.
