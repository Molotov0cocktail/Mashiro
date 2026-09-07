# 013 chapter-core review — R7 addendum PASS

Independent reviewer: gpt-6-astra / medium. **CHAPTER_CORE PASS** applies to the [48-file final v3 manifest](background-013-final-manifest-v3.json), SHA-256 `5E36CF03CEFAAC82B345E588242301CAFBE0AE86AFF70C48362B6B37E54CA00F`. The [independent manifest check](background-013-review-r7-manifest-check.json) matched 48/48 files with no mismatches or removed files. Task 014 remains outside this chapter-core decision. Task 013 and the continuous program remain ACTIVE.

This addendum builds on the [prior final review](background-013-review-final-pass.md), whose actual SHA-256 is `BC709A02DD122825DCA0617AC094187C70A79D775CACCB845E5BDB1DEB29CC0F`. Its 45-file v2 decision and R1–R6 evidence remain historical snapshots; it did not establish that the later-discovered R7 path worked. The original report was not rewritten for R7.

## R7 and the bounded repair

Real background acceptance writes `actor: background` into the memory command. MemoryService.inspect returned this actor, but the strict memory inspect output schema admitted only user/assistant. The real registerMemoryIpc boundary consequently replaced a valid accepted chapter's detail response with STORAGE_UNAVAILABLE. The renderer's previous actor fallback also labelled background changes as assistant changes.

The [independent red oracle](background-013-review-memory-inspect.test.ts) created an actual chapter through BackgroundService and passed the resulting memory detail through the real registered IPC handler. [Red evidence](background-013-review-memory-inspect-red.raw.txt) shows that direct service inspection succeeded with background actor while strict IPC inspection failed.

The repair adds only the already-persisted background actor to the strict enum and static type, plus the Chinese label “后台整理”. No arbitrary actor string, steward actor, execution authority, channel or schema migration was added. Author regressions cover accepted chapter inspection and the memory details label. Relative to v2, the delta is five product/test files and two evidence-maintenance configuration files; three paths are newly included in the manifest. The only new ESLint exclusion is the exact archived memory-inspect oracle, which retains its copied fixture and red evidence; formal tests remain linted. The .gitattributes changes preserve only the actor-repair evidence bytes using the existing archive convention.

## Verification and reuse limits

[Final independent R7 run](background-013-review-r7-final.raw.txt): **2 files / 2 tests PASS**. The first follows actual background acceptance through strict memory IPC and preserves actor=background. The [UI oracle](background-013-review-memory-label.test.ts) selects the memory, checks that “来源与变更” starts collapsed, explicitly expands it, and asserts the background label is visible and not labelled as assistant. Its earlier green run is retained separately; the final run strengthens visibility rather than merely finding hidden DOM text.

[Author targeted evidence](steward-013-actor-green.raw.txt) passed 2 files / 27 tests. [Root final full run](background-013-root-full-03.raw.txt) passed **73 files / 420 tests**. [Static 04](background-013-root-static-04.raw.txt) passed typecheck, lint and format; [build 03](background-013-root-build-03.raw.txt) passed. No further unrelated product rerun was required by this addendum.

The actual Electron 06 dual-PID evidence and screenshots described in the prior report predate R7. They are proportionately reused for the unchanged sandbox, process lifecycle, chapter persistence/context DOM flow and reminder lifecycle. They are **not** claimed to exercise the new memory-details actor path. That bounded path is directly covered by the real IPC-handler oracle, the renderer visibility oracle, author regressions and the rebuilt application. R7 changes no preload runtime import, IPC channel wiring, database schema or native lifecycle; no specific new native-test gap was found.

R7 is closed with no remaining blocker in this increment. Prior honest boundaries remain: historical closed retention previews lacking exact proof are conservatively ineligible as chapter sources; warehouse/steward work, observations, daily roles, broader Task 013, Task 014 release lifecycle, and actual Windows release/download are not completed by this decision. Real personal data was not accessed and no Provider call was repeated.
