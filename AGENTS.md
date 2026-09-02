# Mashiro repository rules

## Project overview

- Mashiro is a Windows 11, single-user, local-first desktop assistant. The current F1 candidate is limited to stable local assistant identities and their SQLite-backed create, switch, rename, primary, archive, and restart lifecycle.
- Product language is Chinese; identifiers, APIs, commands, and configuration use English.
- Provider, conversation, memory, item, reminder, installer, updater, migration, packaged distribution, Release, and deployment capability require separate tasks.

## Authoritative sources

- Product scope and design live in `doc/proposal.md`, `doc/high-level-design.md`, and `doc/detailed-design.md`.
- Executable task state lives in `doc/tasks/001-project-foundation.md` and `doc/tasks/progress.md`; task 002 remains the limited Electron 44.1.1/node:sqlite qualification and task 003 remains deferred and NOT RUN.
- Orchestration route and failure evidence live under `.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/`.

## Stable architecture

- Keep renderer untrusted: no SQL, filesystem paths, credentials, shell, broad IPC, or arbitrary network authority.
- Preserve `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, strict trusted-side Zod validation, exactly six assistant IPC channels, stable assistant IDs, SQLite transaction atomicity, and repository-external runtime data.
- The sandbox preload may import only Electron and the Zod-free shared channel constants at runtime; schemas remain on trusted boundaries.

## Workflow

- Use exact dependency versions and the committed npm lockfile. Do not use force, legacy-peer-deps, alternate registries, mirrors, or disabled TLS.
- Clean recovery is `npm ci`, then `npm exec install-electron`, then `npm run verify`; the Electron package exposes the installer as a bin and does not run it as an npm lifecycle script.
- Required verification is focused/full tests, typecheck, lint, format, build, the two-PID Electron lifecycle harness, dependency-tree checks, foundation validation, and secret/generated/residual scans.
- Preserve the historical Toolhelp32 `-003` auxiliary audit as failed, deferred, and non-blocking; do not rerun it or create `-004`.
- Only a mandatory-fresh Reviewer may issue the F1 verdict. Only an explicitly reviewed final HEAD may be pushed to `github/main` and `gitee/main`.

## Environment and Git

- Git commands on this host use `D:\Git\Git\cmd\git.exe -c safe.directory=D:/Mashiro ...`.
- Never persist `safe.directory`, change owner/ACL, reset, reinitialize, rewrite history, force-push, or discard known partial state.
- Runtime data belongs outside the repository. `PACKAGED`, installer, migration, multi-instance, crash recovery, Provider calls, and real personal-data access remain NOT RUN unless a dedicated task says otherwise.
