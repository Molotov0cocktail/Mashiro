# 008 trusted implementation evidence

2026-09-06. Product parent baseline: `711463a9dd7fbcf16de73c413fe6ad0c56c311cc`. This is executor evidence, not independent review or PROGRAM_DONE. No keys were accessed, no paid calls or commits/pushes were performed by this executor.

## Implemented boundary

Eight narrow memory IPC channels preserve the six existing assistant channels. Strict shared Zod contracts govern trusted operations; sandbox preload imports only Electron and channel constants at runtime. User-visible local controls and model permissions remain distinct. Model business/read/inference/endpoint-receive grants distinguish global and current-assistant private scope. Temporary conversations reject memory scopes before dispatch. Event statuses include intention, planned, arranged, reported-happened, completed, cancelled and unknown.

Immediate normal conversation creation, correction and removal preparation use one deterministic command identity per original user request. Memory body files are immutable accepted versions; SQLite atomically commits acceptance pointer, sources, index, pending organization, business receipt and tool success. Filesystem writes themselves are not claimed atomic with SQLite. Interrupted unaccepted files never become accepted merely by existing. Hash mismatch blocks recall; explicit external reload uses version/digest preview and acceptance.

Delete representation and withdraw source are distinct. Preview shows bounded source rounds and affected memory/round identities plus total counts, and hashes the complete dependency/version/withdrawal set. Confirmation rechecks that set and grants. Its own request dependency is inserted before snapshot inside the same preview transaction. Withdrawal suppresses derived historical/context/protocol recall immediately; physical original/old-version/protocol cleanup remains Q6/009. Pending global organization remains Q9, not a completed worker.

Recent context omits suppressed whole rounds and inherits only actual selected context IDs. Explicit selected suppressed rounds fail before provider dispatch. Exact user statements remain different from faithful summaries and inference; current raw user source is tracked separately from answer dependencies.

## Final wire correction following real observation

Parent's third structural live observation found valid `write_memory` JSON containing `action: remember`, a model-generated non-null target UUID and version 0. It produced NOT_FOUND before any memory command/object but the old tool ledger said RESULT_UNKNOWN. This does not establish the causes of the first two PROTOCOL failures.

`memoryCreateToolSchema` now exports creation fields only: kind, scope, title, markdown, nature and nullable event. `write_memory` has no action, targetId or expectedVersion. Trusted code supplies remember/null/null and creates the identity. `memoryCorrectToolSchema` requires an existing UUID and positive expectedVersion, exposes the content fields without action, and backs separate `correct_memory`. The application MemoryApi mutation union is unchanged. Unknown or extra creation fields are rejected, not silently discarded. Removal tools still return pending confirmation, never an assertion that deletion happened.

Tool business error recovery queries the deterministic command's durable state. Missing/uncommitted command proves not applied and produces CONFIRMED_NOT_APPLIED. An accepted matching receipt is recovered; conflicting committed payloads cannot become successful retries. Unreadable storage remains uncertain. Tool execution does not overwrite a terminal known-not-applied state with unknown. Business dispatch/cancellation text now describes submitting memory or preparing confirmation rather than reading.

## Validation

- Focused memory integration: 16/16 PASS, including old observed wire rejection, no model create-ID field, positive correction version, actual ProviderService NOT_FOUND with no new command and CONFIRMED_NOT_APPLIED ledger, immediate save/search, selected refusal, recent omission, preview confirmation and refreshed nested receipt.
- Trusted unit/integration: 18 files / 139 tests PASS; raw current result `test-results/memory-008-trusted-tests-final.json`. This generated output is not a tracked release artifact.
- Trusted TypeScript and scoped ESLint PASS. Full `npm run lint` PASS after removing seven named executor-only one-use editing scripts. Edits used exact preimage guards and temporary atomic replacement/backups; no residual backup is needed for completed transforms.
- Actual Windows child termination at intent, file-temp, file-ready, before-commit and after-commit: first four restore zero accepted objects with NOT_APPLIED; after-commit restores one accepted object and SUCCEEDED. See [hard-kill evidence](memory-008-hard-kill-evidence.json) and [runner](memory-008-hard-kill.mjs). This is hard child process termination, not a power-loss claim.
- Actual Electron/preload/IPC seed and second-process restore passed with PIDs 87008/94804, run `9c734ccb-aa14-4b6f-9b9f-3c4e39d1d846`: saved/corrected data, sources, deletion confirmation, scoped permissions, receipts, strict temporary rejection and recovery zero calls. See [Electron evidence](memory-008-electron-evidence.json). This run predates the final nested receipt/recent-context/wire corrections and is explicitly not exact-final qualification. Parent will assess or rerun after source freeze.

Independent review, final exact-source qualification, Q6 cleanup, Q9 worker, and remaining program lifecycle/release work are not claimed complete here. Parent owns final live evidence and total-program continuation.

## Parent live result after final wire correction

Parent reported the actual default-transport run SUPPORTED (exit 0): four requests cover natural Chinese write_memory with durable SUCCEEDED, service close/open with zero automatic calls, and a context-none new round using search_memory to retrieve the random synthetic code and answer accurately. One object/one change remain at the same version after search. The first recall wire contains no old assistant/tool messages or code. Observed product usage is 4010/124/4134 plus 4041/71/4112, total 8246 tokens. See [live result](memory-008-live-create-v2-result.json) and [source fingerprints](memory-008-live-create-v2-source.json). Parent performed the paid run; this executor did not access credentials.

The observer clones retain incomplete=true diagnostic read-finalization markers; original flags are not rewritten. Product completion and usage are present, distinct from those observer markers. Earlier failed attempts remain separate evidence, with the first two PROTOCOL causes still undetermined. Core source writing is now handed back to parent for fusion and independent review; no further product changes are planned without a necessary defect.
