# Task 018 renderer candidate v1

Status: **CANDIDATE — independent review pending**  
Model: `gpt-5.6-sol/high`  
HEAD observed at freeze: `99bf73d79c35b86973d65699b62cb91e49830edb`  
Manifest: `memory-018-ui-manifest-v1.json`

## Product result

Every locally browsable normal-history round now has a “查看本轮业务与工具回执” control. Opening it performs one trusted `ProviderApi.tools` read with that round's original `assistantId`, `mode: normal` and `requestId`. It neither sends another Provider request nor reconstructs a business command from conversation or memory text. The existing bounded default receipt query remains unchanged.

The selected-round panel states which round it belongs to and has explicit loading, failure, ownership-rejection and empty states. It rejects an entire result when the trusted response assistant, mode or any operation request identity differs from the selected round, so another round cannot be presented as the requested one.

The panel reuses the existing receipt cards and their original actions: unknown-result local verification, memory confirmation/cancellation, item and pending-confirmation navigation, reminder confirmation, retention preview, memory-source navigation and history-citation navigation. The trusted APIs still perform current permission, object-version and governance checks at action time.

## Generation and privacy boundaries

Each opened panel is keyed by assistant, request, assistant snapshot revision, execution binding/connection generation, permission evidence generation and retention generation. Switching assistants or modes unmounts the old panel; returning does not replay it. Connection changes, permission changes and cleanup/purge generations retire the open view. Both receipt reads and confirmation continuations use local generations, so responses arriving after collapse, unmount, permission change or retention change cannot restore old content or notify a stale mutation. Strict temporary mode renders no old-round entry and starts no request-scoped normal receipt read.

## Verification

- The unchanged review016 renderer RED now passes: 1 file / 1 test.
- The reviewer-owned Task 018 boundary oracle passes locally: 1 file / 10 tests. It covers exact pending-confirmation identity and double-click suppression, wrong assistant/request rejection, assistant and mode round trips, permission and retention invalidation, late confirmation, unknown-result verification and zero model resend. This is execution evidence, not a self-issued independent verdict.
- Author coverage passes after the final edit: 1 file / 3 tests.
- Directly affected renderer regression passes: 7 files / 48 tests.
- Renderer TypeScript, exact scoped ESLint and exact candidate Prettier checks pass.

One earlier six-file concurrent run reported a single empty-state failure in an existing RoundMemoryPanel test. The unchanged test passed immediately in isolation, and the final seven-file affected run including that test passed 48/48. No product change was made to suppress or weaken the assertion.

No trusted/shared/schema code or independent oracle was changed by this executor. No build, Git add, commit, checkout or push was run; the Task 018 candidate remains a working-tree delta for Root to integrate after independent review.
