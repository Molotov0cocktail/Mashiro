# 017 independent renderer and local-source review

Verdict: **PASS — limited source/local DOM scope** for [UI candidate v1](memory-017-ui-manifest-v1.json), seven exact paths. The prior [trusted 13-path limited PASS](review017-trusted-independent-pass.md) remains valid: final hashes for all 20 paths match. This is not native Electron, installed Windows, complete migration, live Provider, release, or PROGRAM_DONE acceptance. PROGRAM ACTIVE.

Reviewer: review_017_trusted, requested gpt-6-astra / medium, independent of both trusted and renderer product authors. Baseline/final observed HEAD remains `a3550888d4d6d001f441fb73e806eef4729ca315`; candidate differences are uncommitted working-tree changes. No product/author-test/global-entry edits, commit, push, credentials, personal-data access, or network Provider calls were made by this reviewer.

## Independent result

The final independently executed focused run passed **10 files / 39 tests**, comprising nine reviewer-owned oracles, eight author feature tests, and affected MemoryPanel, history/retention and App synchronization regressions. See [run/static/hash start](review017-ui-final-verification-01.json) and [completed test output](review017-ui-final-verification-01-tail.json), exit 0. Independent `tsc -p tsconfig.web.json --noEmit` passed. Exact candidate TypeScript plus reviewer tests passed ESLint; all seven candidate and three reviewer files passed read-only Prettier checks. [Final static checks and all 20 hashes](review017-ui-final-static-manifest.json) passed, with no hash mismatch.

Seven actual RED findings are now closed by unchanged behavioral assertions:

| Finding | Independent failure | Verified repair |
| --- | --- | --- |
| R-U1 | Refresh/permission epoch changed while the first rendered frame retained the old body. | Route/refresh-keyed inner panel synchronously retires old body state. |
| R-U2 | normal → temporary → normal revived the former body before renewed authority returned. | Temporary unmounts the evidence-bearing inner instance; returning creates a fresh instance, even when route strings repeat. |
| R-U3 | A navigation inspection resolved after refresh and populated the old correction body. | Refresh immediately advances inspectVersion; rejected inspection returns null to the editing continuation. |
| R-U4 | App A → B → A consumed an earlier object target again, issuing a second inspect without a new click. | App target is bound to assistant snapshot revision and current assistant. |
| R-U5 | Successful v2 correction left the hidden answer's provided-v1 body visible after returning to chat. | Parent evidence invalidation starts before any follow-up list/inspection await. |
| R-U6 | An already queued normal refresh started two normal-data reads after temporary mode replaced it. | Effect cleanup cancels the queued callback before invocation. |
| R-U7 | Permission-keyed MemoryPanel remount consumed the former target again after read revocation. | Permission change clears memoryOpenTarget before advancing the remount/evidence generations. |

Original RED evidence is preserved: [R-U1–3](review017-ui-boundary-red-01.json), [R-U4](review017-ui-app-red-01.json), [R-U5](review017-ui-correction-red-01.json), [R-U6](review017-ui-queued-red-01.json), [R-U7](review017-ui-permission-target-01.json). The [working REPAIR report](review017-ui-working-repair.md) records the earlier six-finding stage, not the final result.

Two additional green protection oracles ensure the fixes are not tailored to the original failures: an unrelated refresh does not replay a consumed target over an unsaved correction draft; a successful correction removes stale evidence even if subsequent query/inspect promises never settle. The final nine oracles reside in [round boundaries](../../../tests/renderer/review017-round-boundary.test.tsx), [App target lifetime](../../../tests/renderer/review017-app-target.test.tsx), and [App correction](../../../tests/renderer/review017-app-correction.test.tsx). A reviewer fixture inference issue (`Promise<unknown>`) was corrected with explicit API generics only; assertions and behavior were preserved, and final web typecheck passed.

## Contract and boundary review

The panel is initially collapsed and calls the round API only on expansion. Normal and historical assistant answers use concrete assistant/request identity. Provided and changes sections paginate independently with bounded requests. Local preparation, dispatch started with receipt unknown, observed response, successful/pending/not-applied/unknown changes, and legacy recorded-only history retain conservative labels. The UI explicitly says model use is not proven and accepted-version detail is not the exact outbound byte payload. Obsolete provided versions never display substituted current bodies; current-version navigation is labeled as such. Navigation reaches the existing inspect/correct/delete/withdraw entry without UUID copying.

Read-only final diff review confirms history permission changes, memory permissions, successful object changes, governance epoch, and connection/binding version/enabled changes propagate an evidence refresh. The outer panel preserves expansion while inner evidence state is replaced. Object mutation and confirmation routes share the early parent invalidation function. Permission remounting also retires the old navigation target. Existing scope/ownership/recipient/source revalidation remains on trusted APIs; renderer receives no SQL, paths, credentials or arbitrary network authority.

The App tests retain real App/MemoryPanel, narrowly replacing assistant snapshot events and Provider shells; the correction tests also retain real RoundMemoryPanel. They are DOM evidence, not a real Electron bridge or paid service run. Root's separately reported trusted integration is not presented here as this reviewer's rerun. Final whole-project checks, build, two-PID/native interaction, schema18 installation/upgrade and actual release/download verification remain with root and the dedicated acceptance tasks. No unresolved product finding remains in the reviewed manifest scope.

Tooling used the previously reviewed require_escalated project-read/test route after default helper failure. Reviewer-owned edits used apply_patch Add or fixed-path/preimage/unique-change/same-directory-temp/backup/postimage guarded updates after Update failed before read. No platform denial was bypassed. This role can release its slot; root continues the active program.
