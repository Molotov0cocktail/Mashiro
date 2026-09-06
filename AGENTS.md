> Current authorization (2026-09-06): PROGRAM_ID=MASHIRO-CONTINUOUS-DEVELOPMENT is ACTIVE until documented product requirements, overall acceptance, Windows packaging/install/update/uninstall validation, and actual release/download verification are complete, or a genuine user gate/proven platform limitation requires TECHNICAL_PAUSE. `doc/tasks/progress.md` is the sole continuation entry; `doc/tasks/program-docs-to-release.md` holds total coverage. TASK_DONE is not PROGRAM_DONE. The user authorizes development, exact dependencies, additive versioned schema changes, necessary synthetic paid Provider tests, reviewed non-force main pushes to both existing remotes, isolated installation lifecycle tests, version/new-tag management, and reviewed releases with assets in the existing Mashiro repositories. No repeat per-SHA, per-call, or final-release approval is required. Real personal-data access, unrelated projects, repository visibility changes, history/tag rewriting, destructive published-asset replacement, substantive license changes and purchases remain outside this authorization. Preserve the six assistant channels; new domain channels need strict trusted validation. New behavior needs independent review; docs-only changes need proportionate fact/link/format review. Historical F1/004/005 scope and NOT RUN statements do not prohibit subsequent authorized tasks.

# Mashiro repository rules

## Project overview

- Mashiro is a Windows 11, single-user, local-first desktop assistant. The historical F1 qualification covers stable local assistant identities and their SQLite-backed lifecycle; current reviewed capabilities and remaining product work are recorded in `doc/tasks/progress.md`.
- Product language is Chinese; identifiers, APIs, commands, and configuration use English.
- Provider, conversation, memory, item, reminder, installation, migration and release work use stable tracked tasks; follow the current program queue rather than historical F1 scope.

## Authoritative sources

- Product scope and design live in `doc/proposal.md`, `doc/high-level-design.md`, and `doc/detailed-design.md`.
- `doc/tasks/progress.md` is the sole current continuation entry. Read it first, then the active task and relevant design; do not reread every historical report. Task 002 remains the limited Electron 44.1.1/node:sqlite qualification; task 003 has endpoint-specific ordinary/streaming text evidence and separately unrun advanced capabilities.
- Keep one stable, tracked task file per implemented product slice. Update its checklist/evidence and progress at milestone starts, key results, route changes, handoffs, and before stopping. Prompter or a designated recorder coordinates the global entry; Executors return slice results. Archive essential sanitized reports in Git with relative links.
- Orchestration route and failure evidence live under `.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/`.

## Stable architecture

- Keep renderer untrusted: no SQL, filesystem paths, credentials, shell, broad IPC, or arbitrary network authority.
- Preserve `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, strict trusted-side Zod validation, exactly six assistant IPC channels, stable assistant IDs, SQLite transaction atomicity, and repository-external runtime data.
- The sandbox preload may import only Electron and the Zod-free shared channel constants at runtime; schemas remain on trusted boundaries.

## Workflow

- Use exact dependency versions and the committed npm lockfile. Do not use force, legacy-peer-deps, alternate registries, mirrors, or disabled TLS.
- Clean recovery is `npm ci`, then `npm exec install-electron`, then `npm run verify`; the Electron package exposes the installer as a bin and does not run it as an npm lifecycle script.
- Required verification is focused/full tests, typecheck, lint, format, build, the two-PID Electron lifecycle harness, dependency-tree checks, foundation validation, and secret/generated/residual scans; the historical F1 Candidate Reviewer evidence records 10 test files / 18 tests. Current candidate counts, applicable two-PID evidence and proportionate reuse are recorded in its final review.
- Preserve the historical Toolhelp32 `-003` auxiliary audit as failed, deferred, and non-blocking; do not rerun it or create `-004`.
- Historical F1 Candidate PASS applies to `90335af96bf95e531ddadc4f3f19259a75c18ee4`; 004 final PASS applies to `f5aa9880828b2a0719b6b8c16d1e4e05c475dcd6`. New product differences require independent review. Later docs-only closing differences need proportionate fact/link/format review, not repeated product qualification. Record past reviewed commits and remote observations without self-referential report/commit loops; query live Git values.

## Environment and Git

- Git commands on this host use `D:\Git\Git\cmd\git.exe -c safe.directory=D:/Mashiro ...`.
- Never persist `safe.directory`, change owner/ACL, reset, reinitialize, rewrite history, force-push, or discard known partial state.
- Runtime data belongs outside the repository. `PACKAGED`, installer, migration, multi-instance, crash recovery, Provider calls, and real personal-data access remain NOT RUN unless a dedicated task says otherwise.
