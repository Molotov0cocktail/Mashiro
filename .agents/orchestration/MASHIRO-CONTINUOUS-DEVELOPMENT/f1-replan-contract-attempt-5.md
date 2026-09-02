# F1 Replan Execution Contract — Attempt 5

## Identity

```text
PROGRAM_ID = MASHIRO-CONTINUOUS-DEVELOPMENT
PROJECT_ROOT = D:\Mashiro
PRODUCT_ROUTE_ID = foundation-f1-electron-sqlite-v1
FAILED_ATTEMPT = 4
NEXT_ATTEMPT = 5
GIT_SUBROUTE = git-command-scope-safe-directory-v1
TOOLING_SUBROUTE = content-addressed-atomic-file-writer-v1
SELECTED_ROUTE = zod-free-shared-channel-module-v1
RISK = HIGH
REVIEW = mandatory-fresh
USER_GATE = NONE
CONCLUSION = REPLAN
```

This delta inherits the complete Attempt-1 F1 contract and Attempt-2 Git delta. It does not weaken product scope, dependency versions, SQLite/IPC/security/test acceptance, mandatory-fresh review, Closer, final review, or reviewed-head-only dual push.

## Failed route summary

The real Electron route failed three times before `window.mashiro` could be established:

1. electron-vite emitted `out/preload/index.mjs` while the window referenced `index.js`.
2. After switching to CommonJS `index.cjs`, the sandbox preload contained external `require("zod")`.
3. Removing the explicit preload `externalizeDepsPlugin` did not help because electron-vite 5.0.0 defaults `build.externalizeDeps` to true and still externalized package dependencies.

The current direct artifact contains `require("electron")`, `require("zod")`, the top-level Zod schema construction, and only later `contextBridge.exposeInMainWorld`. Process-only Electron logging independently reproduced `Unable to load preload script`, `Error: module not found: zod`, and then the secondary renderer error reading `window.mashiro.assistants`.

## Proven baseline

```text
BRANCH = main
HEAD = 92a6dd9ccd086192f5f1213ab4030bc5b0a2c3a1
TREE = f086cc7da02bcc0d0009982a3b6bdd2201fbb241
INDEX / CACHED DIFF = empty
CANDIDATE = NONE
PUSH = NONE
github = https://github.com/Molotov0cocktail/Mashiro.git
gitee = https://gitee.com/Molotov0coaktail/mashiro.git
ATTEMPT-4 REPORT SHA-256 = 0fdb7d7a74b8b221888b45f140accdc886a5ba9484811bf497aac62f5ced6dad
```

The tracked worktree contains the known v3-to-v3.1 skill migration: five old tracked paths are deleted and the v3.1 replacements are untracked. The migration, orchestration reports, writer evidence, and all Attempt-4 F1 partial files are known inherited state, not unknown user changes. Preserve them; do not reset, reinitialize, delete, overwrite, change owner/ACL, or persist `safe.directory`.

All Git commands use:

```powershell
& 'D:\Git\Git\cmd\git.exe' -c 'safe.directory=D:/Mashiro' <subcommand> <args>
```

Route-A preimages:

```text
src/shared/assistant-contract.ts = 2a24c8bd10f67a7903ad03241213f1feeeea3e76c2c6d0e4085b511073ce4eb0
src/preload/index.ts = 23a9ea439f0b57848b670fd1cf7c5c46f9e75fc6ac9bf5165dc9e4a9b38e6ce8
electron.vite.config.ts = 6623b5a481d6f4f12c18e0eb8563a049aed1c54c730e873b1bd93b1434236d77
out/preload/index.cjs = 47e0250f664f3f8c481fc73dd14c0894f4423cf92235ea8e2a32871fac0d005c
```

Current independent checks: focused tests, typecheck, lint, format, build, and `npm ls --depth=0` exit 0. `npm run test:electron` exits 1 at sandbox preload `module not found: zod`. No successful `test-results/electron-f1.json` exists.

## Route options

### A — selected: Zod-free shared channel module

Add `src/shared/assistant-channels.ts` as the single runtime source for exactly six channel strings. `assistant-contract.ts` re-exports it and keeps all Zod schemas. `preload/index.ts` imports the channel module at runtime and imports `AssistantApi` from the contract as type-only. Main keeps strict `schema.safeParse(input)` validation.

Expected preload graph: `electron` plus the local channel module, with no Zod runtime dependency.

### B — viable fallback: bundle Zod

Set preload `build.externalizeDeps` to `false` or exclude only `zod`, then prove the standalone CJS artifact and real Electron behavior. Merely setting `ssr.noExternal` is insufficient because electron-vite already sets it true while its dependency externalizer adds explicit Rollup externals. This remains an automatic engineering fallback, not a user decision.

### C — rejected as primary: duplicate channel strings in preload

This removes Zod but creates a second channel authority and drift risk. Disabling sandbox/context isolation, enabling Node integration, exposing broad IPC, or weakening the harness is prohibited.

## Route-A execution contract

Initial allowlist:

```text
ADD    src/shared/assistant-channels.ts
MODIFY src/shared/assistant-contract.ts
MODIFY src/preload/index.ts
```

`assistant-channels.ts` contains only the existing six constants. `assistant-contract.ts` replaces the in-file constant with `export { assistantChannels } from './assistant-channels.js'`. `preload/index.ts` imports channels from the new module and retains `AssistantApi` as a type-only contract import.

Existing files use a content-addressed writer with fixed canonical targets, exact preimage hashes, deterministic exact replacements and match counts, UTF-8/BOM/newline/final-newline preservation, sibling create-new temp, fsync/close/re-read/hash, content-addressed backup, same-volume `os.replace`, rollback on failed postconditions, postimage hashes, minimal backup-to-target diffs, and exact residual cleanup. New files require an absent target and fixed generated postimage.

After writing:

1. `npm run build` must produce `out/preload/index.cjs` at the exact window path.
2. The artifact must contain exactly six channel strings, `require("electron")`, and `contextBridge.exposeInMainWorld`.
3. It must not contain `require("zod")`, Zod schema construction, or another unexpected external runtime require.
4. `npm run test:electron` must use two different real Electron PIDs, Electron 44.1.1, embedded Node 24.19.0, browser process type, unchanged secure preferences, and identical stable persisted snapshot after restart.

If Route A still emits Zod, inspect the actual runtime import graph and automatically use Route B if externalization is the only cause. If preload succeeds and a new product first bad state appears, record and repair that distinct state without weakening acceptance.

## Full F1 continuation

Route-A success proves only the preload route. Continue the full inherited F1 contract:

- finish and audit service/repository/schema/sqlite integration and transaction invariants;
- keep exactly six typed IPC methods and a contextBridge-only preload;
- complete main/app/window/data-root, React AssistantPanel, and the real Electron harness;
- test strict unknown-field/protocol/UUID/name validation, forged/stale input, parameterized SQL, primary/archive invariants, concurrent/stale writes, mutation rollback, corrupted/newer schema, unavailable paths, E2E-root traversal/marker rejection, CSP/navigation/window/permission denial, React text escaping, and error redaction;
- run focused and full tests, typecheck, lint, format, build, real Electron, clean `npm ci` plus verify, npm tree checks, foundation validator, secret/generated/runtime-data scans, diff checks, and writer residual checks;
- update README, AGENTS, and all seven project documents to actual candidate facts while preserving task-002 limited qualification, historical `-003` failed/deferred/non-blocking status, `PACKAGED` and other truthful NOT RUN items, and the full failure history;
- do not rerun Toolhelp32 `-003` or create `-004`;
- do not add Provider, conversation, memory, item, reminder, installer, updater, migration, Release, or deployment capability.

Use explicit staging inventory; do not use broad staging that accidentally consumes the known skill migration. If that migration is included, keep it byte-identical and review it as a separate explicit changeset.

The Executor may create a candidate commit but does not self-declare PASS and does not push. A mandatory-fresh Candidate Reviewer issues the only verdict. PASS goes to Closer; REPAIR to a bounded Repair Executor and re-review; REPLAN to a new Route Assessment; BLOCKED only for irreplaceable external facts, credentials, or permissions. A closing commit requires a mandatory-fresh Final Reviewer. Only the exact final reviewed HEAD may be pushed without force to `github/main` and `gitee/main`. F1 closure is followed by a Continuation Planner.

## Deferred / non-blocking

- The first two historical preload artifacts were not retained; the current third failure is directly reproduced.
- The retired PowerShell writer's defects do not invalidate the proven Python content-addressed route.
- Historical baseline Markdown whitespace, PACKAGED/installer/migration/multi-instance/crash recovery, and Toolhelp32 `-003` remain outside current blocking acceptance.
- Remote authentication is checked only at final reviewed-head push; missing irreplaceable credentials then follow the authorized credential request route.

## User gate

```text
USER_GATE = NONE
NEXT_STATE = ATTEMPT-5 EXECUTOR
```
