# 005 Executor handoff — persistent-timeline-v1

ROLE: Executor (trusted/core/integration), with delegated bounded UI and migration/Electron test slices implemented by gpt-5.6-sol. Formal independent review has not run; this report is evidence input, not a PASS verdict.

## Contract and exact baseline

- Original Execution Contract: `D:/Mashiro/doc/tasks/005-persistent-timeline.md`, received SHA-256 `A35B92182AFA5344F413CB4FE141BB254A246F237D3CCC23BEFAE9E660890A27`; the tracked task now contains implementation evidence. Original planning version is in `cb65fe501c0a366529d3f0553b2ca6a2b900e0de`.
- Reviewed product baseline: `f5aa9880828b2a0719b6b8c16d1e4e05c475dcd6`.
- Direct execution baseline: `cb65fe501c0a366529d3f0553b2ca6a2b900e0de`, clean main.
- Final tested product HEAD: `6f9f33db032780128ef79aa97c1efdae2b68bf88`, commit `feat: persist assistant timelines with explicit temporary saving`, clean after commit.
- This report is a subsequent documentation-only handoff. Review the complete `f5aa988..final handoff HEAD` diff; the final containing commit is supplied by live Git in the role handoff, avoiding a self-referential commit loop.

## Implemented behavior and scope

28 product-candidate files changed, 2631 insertions / 294 deletions. No dependency or lockfile changes.

- schema v3 adds ordered timeline messages transactionally to populated v2, preserving all existing assistant/state/connection/binding rows, versions and guards. Independent protected credential files remain intact.
- Normal mode commits user + pending response before transport. Completion, failure, cancellation and interruption preserve actual text/state. Close synchronously saves received partials; startup terminalizes residual pending without resending. A final storage failure returns an error, never a success. Shutdown storage exceptions are caught at the application boundary, prevent quit, and emit only a stable sanitized event.
- Strict temporary mode uses separate per-assistant in-memory session/message identities, does not read normal history or automatically persist body text. Explicit saving copies that session atomically to the captured assistant, deduplicates stable source IDs, marks saved only after commit, keeps mode temporary, and refuses while a request is active. Failure preserves unsaved memory.
- Trusted context selects only completed pairs from the target assistant: at most 16 recent pairs and 64,000 UTF-16 units including current input. Selection stops at a pair that exceeds the remaining budget; no local records are deleted. The UI reads the latest 100 messages with hasMore. Temporary mode keeps its existing 64-message / 120,000-unit context limit.
- Each send resolves active assistant, enabled connection, binding and credential in trusted code, freezing the actual recipient/model. Connection changes and credential revocation/replacement abort matching requests; successful assistant archive IPC cancels the affected request. Late responses retain captured assistant/request ownership.
- Two narrow timeline IPC channels with strict input/output schemas; six assistant channels unchanged. The built preload requires only Electron at runtime, with channel constants bundled; no Zod runtime import. Renderer supports Chinese normal/temporary selection, disclosure, loading/save errors, saved markers and real message states.

The interpretation of “current assistant” follows 004: the explicit operation target, rather than an additional equality constraint to global UI current selection. Trusted code constructs its own history and rejects renderer-supplied history, SQL, recipient overrides or authorization claims. Normal read/save are local scoped operations; external send separately checks active target and provider permission.

## Distinguishing oracles and actual validation

The old product has no timeline API/table writes and only in-memory sessions; the new pre-transport SQL observation, persisted IDs after reopen, explicit-save transaction oracle and real process recovery distinguish this implementation from 004.

| Command / check                                                                                                 | Actual result                                                                 |
| --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `npm run verify`                                                                                                | exit 0, first complete candidate run                                          |
| focused + full tests within verify                                                                              | each 20 files / 80 tests                                                      |
| typecheck / lint / format / build within verify                                                                 | all exit 0                                                                    |
| `npm run test:electron` within verify                                                                           | exit 0; fresh PIDs 25572 / 62496                                              |
| trusted timeline final targeted suite plus Provider/assistant IPC regressions                                   | 4 files / 23 tests, exit 0                                                    |
| timeline core included in full chain                                                                            | 12 tests                                                                      |
| populated-v2 migration + original Provider migration targeted suite                                             | 2 files / 5 tests, exit 0                                                     |
| renderer targeted suite                                                                                         | 6 files / 11 tests, exit 0                                                    |
| `npm ls --all --json`                                                                                           | exit 0; no dependency changes                                                 |
| `python .agents/skills/initialize-engineering-project/scripts/validate_project_foundation.py D:/Mashiro --json` | exit 0, ok=true, no errors/warnings                                           |
| `git diff --check`, staged diff check                                                                           | exit 0                                                                        |
| scoped credential-pattern, tracked generated and guarded-write residual scans                                   | 0 matches                                                                     |
| compiled preload inspection                                                                                     | only `require("electron")`; six assistant and two timeline channels preserved |

Core tests directly observe pre-send pending transaction, no transport after storage failure, full explicit-save rollback and retry, stable saved IDs/flags, no unsaved temporary marker in SQLite files, actual failed/cancelled/interrupted states, bounded actual outbound messages, overlapping assistant responses, shutdown partial preservation, late-result rejection after close, honest final-write failure, disabled connection and archive revocation, hostile delta limits, and strict timeline IPC inputs.

Migration tests compare populated v2 identities, archived/current/primary state, revisions, Provider metadata/bindings and protected vault bytes. They inject a conflicting second DDL index to prove that the newly created table is rolled back while all v2 state and decryptable protected credentials remain intact.

## Real Electron evidence

[Tracked synthetic evidence](persistent-timeline-v1-electron-evidence.json), run `1a09637d-d522-4a64-86c2-28695e59d0f3`:

- Electron 44.1.1 / Node 24.19.0 / SQLite 3.53.3, two fresh main PIDs 25572 and 62496.
- Normal and explicitly saved temporary message IDs/content/state recover exactly. A running normal stream's received partial survives ordinary quit and returns under the same ID as interrupted.
- Restore/read transport calls = 0. A subsequent explicit user send raises the new process total to 1; its context excludes incomplete and unsaved temporary turns.
- Temporary session is empty after restart; unsaved synthetic body marker and temporary Key are absent from runtime files. The test transport verifies the actual credential classification: seed temporary, restarted explicit send persistent. Persistent credential bytes are protected with real Windows safeStorage.
- Runtime root is a uniquely owned repository-external synthetic directory, cleaned by the existing validated harness. Screenshot output is synthetic test UI and ignored; it was not used to search for credentials.

## Failures and repairs retained

- The new adversarial delta test initially failed: a CRLF-sensitive transformation had not changed the delta accumulation branch, so 120,001 units could finish as completed. Normalizing newlines and requiring the expected exact match repaired the branch; the oracle then passed and is included in the final full run.
- A synthetic protector fixture initially returned Uint8Array under TypeScript inference. Wrapping the mapped bytes in Buffer.from fixed the fixture; full typecheck passed.
- Old migration fixtures initially retained the new v3 table while declaring user_version=1. The fixtures now remove the additive v3 table before emulating real v1; original migration assertions remain, with successful current schema expectation updated to v3.
- UI integration initially exposed missing timelineApi fixtures, synchronous effect setState lint, and mock timelines that returned empty data after successful send. Fixtures now model the authoritative timeline refresh; error-path tests separately verify retained local text. No lint rules or test assertions were disabled to pass.
- apply_patch created the new channel constants file, but its subsequent existing-file read failed before mutation in the Windows helper. Exact target preimages were verified, then authorized PowerShell/.NET content-addressed sibling-temp atomic replacement was used. Pre/post hashes were checked and no backup/temp residuals remain.
- One automatic approval review timed out before command execution; its allowed single retry succeeded. One oversized documentation write command hit Windows command-length limits before process creation; splitting the same guarded writes by exact file succeeded. An overly broad formatter pass over historical detailed design was reverted to the intended narrow new status section before commit.
- The complete verify and real Electron run had no failures. These are candidate results, not independent Reviewer verdicts.

## External actions, NOT RUN and continuation

Local authorized product commit only; no force/reset/history rewrite, ACL/owner changes, persistent safe.directory settings, dependency downloads, new paid/live Provider calls, real personal-data access, Release or deployment. Existing transport is unchanged, so 004 exact-endpoint ordinary/streaming qualification is reused; synthetic transport calls incurred no paid usage.

NOT RUN: independent final review and push for this candidate; PACKAGED/installer, full crash or multi-instance qualification, Release/deployment, real personal data and advanced Provider capabilities outside 005. Historical Toolhelp32 -003 remains failed/deferred/non-blocking and was neither rerun nor extended.

Worktree was clean at product commit. No push was attempted; the prior reviewed remote observation remains f5aa9880. Next action: a fresh independent gpt-6-astra Reviewer checks the exact final handoff HEAD and full product baseline diff, then authorized repair/review/closing and non-force synchronization of both existing remotes. No user-owned gate is currently required.
