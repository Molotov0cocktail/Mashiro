# 008 S0 — 即时记忆、来源与跨资源提交冻结建议

Date: 2026-09-06. Route: DESIGN + isolated SPIKE. Product baseline independently queried: `711463a9dd7fbcf16de73c413fe6ad0c56c311cc`. This is a bounded implementation contract recommendation, not product PASS. PROGRAM remains ACTIVE. No product/shared contract/task/progress files changed, no commit/push/Provider call/credential access performed.

Read: root AGENTS; orchestration skill/modes/role contracts; current progress/program; complete 008 preparatory contract; 007 contract and [exact final review](tools-007-review-final-711463a.md); proposal memory/privacy scenarios; high-level data-authority/retention/protocol rules; detailed §7–9 and MEM/EVT/RET decisions. Root owns global continuation and closing documents.

## 1. Required user closure

Normal Chinese conversation must support “记住我更喜欢茶”, “纠正为咖啡”, “删除这条记忆”, and “撤回这条信息的依据”. Saving/correction is immediately effective under the current business grant, independently of warehouse execution; deletion gets an inline concrete confirmation when necessary. A successful model sentence is not a receipt. A failed/interrupting answer must leave an already committed operation visible.

The memory view must offer global / current-assistant private / personal-event filters; Chinese title and body, literal full-text search, edit/correct, delete representation, withdraw source, restore applicable representation, source/change disclosure, and original-round navigation. Source disclosure distinguishes **provided to model** from unobservable **actually used**. Event fields distinguish planned, arranged, reported-happened, completed and unknown, with explicit time/time-zone or unknown; they never create an item, reminder or calendar booking.

Scope/kind: global user memory; private relationship; private continuity; global or private personal event. Archive/rename/rebind does not change stable owner IDs or delete global objects. Explicit global remember is immediately active; its branch-reorganization work can also enter a real pending queue. Automatic global extracts enter pending organization; private continuity can be active under its own grant. The pending queue is a durable record with status and source, not a fake warehouse-completed badge. Q9 owns actual warehouse processing, chapters, observations and daily jobs.

Nature remains separate from validity and retention: `user-statement`, `faithful-summary`, `inference`. An exact source quotation can support a user statement; a paraphrase is shown as assistant summary with source, not as newly user-confirmed wording. Inferences stay visibly tentative regardless of score or future placement. All reads and model results treat Markdown and source text as data, never authority.

## 2. Concrete trusted boundary and DTO

Keep the six assistant channels. New narrow `memory:*` channels use Zod strict trusted input/output validation and preload constants with no runtime Zod import. Renderer supplies intent, UUIDs, expected versions and editable text; never paths, SQL, credentials, accepted versions, source approval, grant conclusions or endpoint fingerprints chosen by the model.

Recommended DTO fields:

```text
MemoryRecord = id, objectVersion, kind, scope(global|assistant), ownerAssistantId|null,
  title, markdown, nature, event{status, occurredAt|null,timeZone|null}|null,
  state(active|pending|suppressed|integrity-blocked), retention(persistent|staging|trash),
  createdAt, updatedAt, sourceRefs[], integrityStatus
MemorySource = sourceId, type(user-round|memory-version|manual-edit),
  assistantId|null, requestId|null, memoryId|null, version|null, availability
MemoryChange = operationId, objectId, fromVersion|null, toVersion, action,
  sourceRefs[], createdAt, actor(user|assistant), status
Query = assistantId, scopeFilter, kindFilter, query, cursor?, limit
Mutation = action, targetId?, expectedVersion?, title?, markdown?, nature?, event?,
  requestedScope?, confirmationId?  // discriminated strict unions, not optional-field soup
```

Browse locally as the user is distinct from the assistant reading for a Provider. A user can inspect global/private entries through an explicit owner filter without granting the current assistant those private contents. The selected assistant cannot use that inspection path as a tool. Display source metadata without silently reading another assistant's private source body; explicit local user source inspection can use a separate authorized user browse path.

Narrow API methods: query/read; mutate; inspectSourcesAndChanges; permissions/updatePermissions; previewExternalReload/acceptExternalReload. All use current owner/object checks. Application edit supplies a trusted manual-edit source; it does not forge a historical user quote.

## 3. Business authorization and tool contracts

Tool availability, domain read access, endpoint receive access and write business policy are four separate gates. Persist user-visible policies per assistant/domain for `read`, `writeStatementsAndSummaries`, `writeInferences`, with endpoint-specific `receive`. Newly introduced external-receive and business-write grants start ungranted and have actual Chinese controls. Reading one's private continuity never permits reading another assistant's continuity. Global sharing does not erase source-derived constraints.

User granting low-interference memory writing is the trusted authorization; the model may extract a statement under that policy but never enlarge it. The product need not classify natural language with an authority-bearing regex or accept `confirmed:true`. For restrictive per-turn use, a composer “本轮记忆操作” control can select remember/correct and scope; default conversation still supports natural commands once the persistent grant is enabled. Correction targets the current known object version and cannot silently change scope/owner/nature to a stronger claim.

Destructive/ambiguous requests produce a persisted local preview identifying target, current version, action **delete representation** versus **withdraw information/source**, and affected derived objects. A narrow user-confirm action binds the preview hash, object/source versions, current assistant and current permission revision. Editing, cancellation, changed target or withdrawal invalidates it. The model receives pending-confirmation as a truthful non-success result; clicking confirmation commits locally without requiring another paid model call. Explicit user action in the memory view is itself the same concrete confirmation. No UI control may accept arbitrary approved payloads from renderer without reloading the stored proposal.

Tools: `search_memory` (bounded query, kind/scope filters), `write_memory` (create/correct/record-event with strict discriminated arguments), `request_memory_removal` (target/version/intent). Sources are checked against actually provided current-round text, authorized history hits and memory hits. Arbitrary request IDs in model arguments are not sufficient. Current round can be a source before assistant completion because the user message is already durable.

For minimal robust operation identity, reserve one trusted mutation slot per original user request; remember multiple short facts can be one entry. The slot has a stable `commandId/operationId` before dispatch. Later calls with identical normalized arguments return the existing outcome, and differing mutations in the same slot return a clear limit/conflict, not another write. Read calls retain normal 007 budgets. Application edits/confirmations mint separate trusted commands. This is an explicit engineering bound to expose in tool descriptions/UI, not permanent removal of future multi-object requests. A later bounded batch can allocate trusted command slots before dispatch. Do not key business identity solely by model-generated call IDs or newly generated modelRequestId.

Tool schema definitions should be derived from allowed capability sets, preserving off/clock/history behavior and adding explicit memory choices without enabling history by accident. Validate the whole batch before dispatch. Strict temporary mode exposes no memory business or normal-repository tools; saving temporary chat is only the existing chat-save action, never memory extraction or permission grant.

## 4. Real integration changes required

`ToolRepository.update` currently opens its own transaction; `SqliteStore.transaction` uses `BEGIN IMMEDIATE` and cannot nest. Refactor ledger validation and mutation into an internal transaction-participating method, called by the memory commit coordinator. Do not call old update inside another transaction. Preserve read-tool callers using the standalone wrapper.

`ToolRepository.prepare` currently keys replay by `(segment, modelRequest, toolCall)`; this is sufficient for the reviewed read tools but not new business retries. Add command identity/current object version and exact argument digest for the reserved mutation slot. A model retry cannot mint a second business action. Terminal operation states cannot be rewritten after later memory edits. Recovery reads intent and committed receipt, rather than changing every dispatched memory write to generic RESULT_UNKNOWN.

`ProviderService.startChat` currently builds history before transport, records same-assistant request sources and checks only history grants. Add memory context/hits plus their dependency closure to the current round and execution segment. Every transport send, stream continuation, tool dispatch, commit and replay calls current domain/source checks. Abort affected in-flight executions when permission or suppression changes; success already committed stays historically successful. Recheck before sending tool results, including replayed prior results.

`timeline_sources` only expresses same-assistant round dependencies. Keep it for 007 compatibility; add typed dependency edges for round/memory-version/source nodes, or an equivalent normalized source table. This must cover historical answer contamination and protocol snapshots/results. An answer derived from a now-withdrawn memory cannot be resent via ordinary recent history, selected history, tool history search, citation excerpts or protocol replay. Reject/omit the affected complete round; never leak its assistant half. If selected explicitly requests a blocked round, return a clear refusal. Propagate dependency closure when a derived answer becomes a source of a new memory.

Dependencies enforce source restrictions, not blanket bans on global sharing: distinguish per-source assistant and recipient grants from source display ownership. Initially enforce inherited restrictions conservatively and surface why a global entry is unavailable to an assistant/endpoint. Future widening requires an explicit user source-scope action, not a Markdown edit or global flag. A correct implementation may block a global entry until the relevant source grant is explicitly shared; it must not promise universal sharing first.

## 5. SQLite plus Markdown acceptance protocol

Additive schema v6: objects/current pointer; immutable version metadata; typed sources/dependencies; changes; mutation intents; suppression records; domain/source grants; pending organization; rebuildable text index. Accepted semantic body lives in Markdown, not two independently editable authoritative copies. Index body is explicitly a disposable cache.

Trusted path builder uses application-owned external runtime root and validated internal UUID/version names. Never accept a path from IPC. A path/hash manifest identifies the accepted version; frontmatter cannot set scope, owner, source, permission or suppression. Titles/body can be ordinary Markdown; rendering must not enable arbitrary HTML, script, local file/image loading or network resource fetches.

1. Reserve durable operation and intent with expected object version, source revisions, intended body SHA-256 and application-generated immutable version filename. No success yet.
2. Write exclusive same-directory temporary file, flush file descriptor, rename to a never-overwritten version path, reopen and verify bytes/hash. Failures leave the old accepted pointer unchanged. Future external edits cannot retroactively redefine this accepted version.
3. In one synchronous SQLite transaction, recheck cancellation/current grants/source suppression/current object version; compare-and-swap accepted pointer; write version/source/change/index/pending rows; mark intent ACCEPTED; mark operation SUCCEEDED and write its minimal protocol result. One transaction owns all SQLite mutations.
4. Emit success only after COMMIT. Model continuation may fail; business receipt remains. Success results prefer IDs/version/summary, avoiding unnecessary body duplication in protocol JSON.
5. On startup reconcile intent+pointer+receipt. Unaccepted intent is definitively not applied; classify without auto-running it or accepting orphan files. Accepted pointer plus receipt is a committed operation even if UI never received it. Verify the file/hash before any affected read. Missing/tampered accepted content blocks affected recall/outbound writes with a visible recovery action; never silently choose another version or erase history.

Same-volume rename is not a SQLite/filesystem transaction. File flush plus SQL durability improve crash safety, but arbitrary power-loss/file-system guarantees remain bounded; startup integrity checks are mandatory. Do not scan version directories and infer accepted state from filenames. Orphan/temp files remain outside the active index and can be tracked for later safe cleanup; no automatic irreversible retention policy is invented.

External reload: show expected accepted hash versus disk candidate and a content-only diff, then accept as a new version after current-version/source/grant checks. The altered old file cannot be treated as trusted old history; preserve the candidate separately for inspection and show the old integrity failure. Metadata/frontmatter changes never expand authority. App-internal editing remains primary. Backup manifest lists database/governance plus all referenced accepted/history files and hashes; WAL-consistent snapshot/copy choreography belongs to Q10. Plain Markdown export is not a complete backup.

## 6. Correction, deletion and withdrawal

Correction writes a new version and retires the old accepted version from recall. Record a source/object suppression barrier so a stale job based on the old version cannot overwrite it. Rebuild selects accepted, unsuppressed pointers, then validates source closure and hashes. Restoration is a new command/version with explicit current checks, never deletion of a tombstone allowing every old job to run again.

**Delete representation** moves that representation to non-recalled/trash state, records suppression against its source lineage and object generation, and removes its index entry. It does not delete chat text, all other information from the source round, formal items or external objects. Whole-source suppression is overly broad for this action. Re-deriving the same object/lineage from old work is blocked; a new explicit user remember command can supersede the barrier with a new generation and auditable source. Future warehouse lineage registration must consult this barrier.

**Withdraw information/source** records the explicit scoped source withdrawal and immediately excludes its affected memory/event versions, excerpts, derived answer/protocol data and index paths from recall/model use. Preview must expose when the minimal granularity is an entire source round, rather than pretending a single fact can be isolated from a mixed round. Block current execution/replay before its next external step. Store a durable cleanup intent with affected references. Local UI can show a withdrawn placeholder and audit metadata rather than withdrawn body in normal paths.

Q6 owns complete message/segment/timeline retention transitions, recoverable original-text reclamation, eventual physical cleanup of withdrawn original/old Markdown/protocol copies, and all capacity/time/auto-empty controls. The 008 receipt must say **已撤回并停止使用；原文/历史副本清理待生命周期处理**, not “所有历史痕迹已永久删除”. This is not postponing the immediate suppression behavior. It is a concrete residual to retain in Q6 and the final program coverage. Q6 must complete it before PROGRAM_DONE.

AST-006 is permanent assistant deletion; RET-007 is capacity/time/automatic-empty defaults. Neither blocks these already-confirmed MEM-003/RET-005 immediate operations. No new user decision is needed to implement the above reversible, explicit paths. Before Q6 implementation root should ask its existing prepared AST/RET questions; REM-002 is Q8. If users request finer than current source-round withdrawal, ask an in-product concrete clarification instead of silently broadening destruction.

## 7. Distinguishing experiment and acceptance

[Runnable isolated experiment](memory-008-spike.mjs) executed with `D:\nodejs\node.exe`, Node v24.18.0, exit 0. Runtime data: `C:\Users\30910\AppData\Local\Temp\mashiro-memory-008-GNNnlG`. Synthetic only, retained exact directory for inspection. Nine scenarios: intent-only, temp-only, renamed orphan, uncommitted SQL, committed SQL, stale version, deleted state, tampered accepted file, and legacy split-transaction red case.

Eight green checks show unaccepted versions do not recall, unfinished SQL rolls back, commit couples pointer/receipt, newer edits/deletion survive adjudication, and tampering blocks current recall while preserving historical success. Legacy red reproduced accepted business without a success receipt. This experiment uses real SQLite and actual files, but process-close rollback is **not** a hard process-kill/power-loss qualification and it does not test production permission/source code. Route is SUPPORTED for candidate implementation with additional tests below.

Required candidate oracles:

- Actual normal conversation writes once, shows trusted receipt, next turn recalls exact accepted corrected content with permitted source/endpoint; no warehouse execution is necessary.
- Statement, summary, inference and event status remain distinct; global/private matrix includes archive/rebind and cross-assistant denial.
- Old retry with changed call/model-request identity cannot duplicate the reserved business command; old expected version cannot overwrite user edit/delete; committed success survives response failure, restart and late empty UI snapshot.
- Every file/SQL fault window including hard child-process termination before/after COMMIT; reopening checks correct pointer, receipt, index and no auto Provider call. Missing/tampered file, disk error and index rebuild cannot select old or orphan content.
- Delete representation affects only its intended lineage; withdraw source suppresses dependent memory, event, historical answer, search excerpt, protocol result and replay. New explicit restore/remember cannot silently reactivate unrelated old jobs.
- Read/receive/write grants and temporary isolation are independently tested. Revoke between tool result and next send, and between file write and SQL commit. User confirmation is bound to current target/source/grant versions; forged model confirmation fails.
- Chinese UI exercises conversational action, permission setup, correct/delete/withdraw/restore, source jump, search and external reload conflict. At least one authorized synthetic real Provider business write+next-round retrieval, plus real Electron two-process restart lifecycle; mocks do not replace these.

Owner split: one Astra trusted writer owns schema/SQLite, memory repositories/service, permissions/provenance, ProviderService/tool execution integration and trusted tests. Sol UI writer receives a frozen shared contract and owns only renderer feature/components/styles/tests; do not concurrently change shared contracts/preload/provider panel without named ownership. Root owns global docs and integration commands. A fresh independent Astra reviews final behavior and fault oracles. Start the trusted vertical slice and DTO first, then parallelize UI against it; avoid splitting transactional/provenance integration across unrelated writers.

No product implementation or independent product PASS is claimed. Next action: root freezes the shared contract from this recommendation, grants concrete trusted/UI ownership and continues 008 execution, then Q6/Q7/Q9 and remaining release coverage.
