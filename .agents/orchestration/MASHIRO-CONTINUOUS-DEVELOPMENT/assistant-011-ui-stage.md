# Assistant 011 UI executor evidence

- Task: `011-assistant-basic-configuration`, renderer slice
- Role: renderer executor
- Actual model: `gpt-5.6-sol`, reasoning effort `high`
- Product baseline: `ab11110a45c6ddb65bd114547225dd4e329bba11`
- Coordination head observed before implementation: `4c044f9c269fa90ed7e9677a4603601268e343eb`
- Status: frozen for trusted integration and independent review
- Freeze manifest SHA-256: `08DECA64C104AE8FC2359B8996D6EA35369F6F7207F1E004537235AAF3A8C769`

## Implemented behavior

- Added stable-ID profile drafts for display name, persona, and one of six fixed built-in avatars. The UI counts Unicode code points against the shared 4000-character limit and previews the selected local avatar without accepting a URL, path, or HTML.
- Saves the full profile through the existing assistant rename channel with both assistant-version and state-revision CAS. A stale write refreshes trusted data while preserving the affected local draft for comparison and explicit resave.
- Shows the same trusted avatar in the assistant list and current chat identity. Archived profiles are read-only.
- States that display name and persona are sent to the actual Provider receiver in both normal and strict-temporary requests, while history, memory, and item permissions stay independently authorized.
- Links profile cards to the real Provider settings, history permissions, memory permissions, and item permissions. A non-current assistant is switched successfully before navigation begins.
- Navigation uses request/governance fences, invalidates pending work when the user selects a primary tab, waits for permission data where needed, binds each focus request to its target assistant, and consumes each assistant/nonce pair once. Old switch failures, late successes, unrelated rerenders, and A→B→A switches cannot replay an old history request or force strict-temporary mode back to normal.

## Renderer verification

- `npm exec vitest -- run tests/renderer`: PASS, 19 files / 93 tests.
- `npm exec tsc -- -p tsconfig.web.json --noEmit`: PASS.
- `npm exec eslint -- 'src/renderer' 'tests/renderer' --max-warnings=0`: PASS.
- `npm exec prettier -- --check 'src/renderer' 'tests/renderer'`: PASS.
- `git diff --check -- src/renderer tests/renderer`: PASS.
- Content-addressed scope: 23 renderer source/test files listed in `assistant-011-ui-stage-manifest.json`.
- No `.assistant011ui.tmp` or `.assistant011ui.bak` writer artifacts remain.
- The avatar component contains no URL, path source, or `dangerouslySetInnerHTML`.

Focused tests cover full-profile CAS saves, Unicode counting, stable A/B drafts, stale-write recovery, archived read-only state, delayed permission focus, superseded switch results, explicit-tab cancellation, unrelated rerenders, and same-nonce A→B→A history replay.

## Parent-echo repair

A post-freeze parent-wrapper oracle reproduced a same-snapshot echo clearing the STALE_WRITE conflict message: `acceptSnapshot(refreshed)` notified the parent, and the echoed `externalSnapshot` incremented local fences and cleared `error`. AssistantPanel now ignores external snapshots whose `stateRevision` is equal to or older than its accepted snapshot. A strictly newer external revision still increments request and operation fences, replaces the trusted snapshot, clears superseded local status, and preserves the existing governance behavior.

The owned profile test now uses a stable parent callback, echoes a cloned same-revision snapshot, waits for the parent to receive revision 3, flushes the echo, and then asserts the conflict message plus both stable-ID drafts. The existing higher-revision retention tests remain green. Root independently ran its three-scenario parent-echo oracle (1 file / 3 tests), archived it byte-for-byte as `assistant-011-root-parent-echo.test.tsx.txt` with SHA-256 `B9DDB1ED862ACC75778040EE264385D9A089349F5A3E4F0A4C7C4E9BE2A25DF0`, and removed the temporary active test. The formal renderer rerun after removal passed 19 files / 93 tests.

## Execution notes

The normal patch helper repeatedly failed during sandbox setup refresh. Authorized writes therefore used fixed allowlists, exact preimage hashes, one-match replacements or exact generated postimages, sibling temporary files, atomic `File.Replace`, postimage hash checks, rollback, and cleanup.

An initial stdin writer experiment created an empty new avatar file; its empty-file SHA-256 was detected immediately and it was atomically replaced by the intended verified content before tests. Focused tests also exposed a React synthetic-event lifetime bug and a stale test-only DOM reference; the product event values are now captured before state updates, and the regression test reacquires the rerendered list item. No paid Provider call, credential access, Git mutation, or out-of-scope file write was performed by this executor.

Full repository tests, static/foundation checks, build, and Electron lifecycle verification are intentionally coordinated by the trusted author after this renderer freeze. Independent candidate review remains pending.
