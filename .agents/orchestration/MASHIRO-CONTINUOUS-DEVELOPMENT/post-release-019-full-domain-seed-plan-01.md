# 019 non-empty synthetic dataset A seed route

Status: PREPARED_ONLY. No execution has opened the isolated profile, a database, or the historical dataset9f. No app, installer, Provider, or profile transition has been started by this helper.

## Fixed source and desktop ownership

- Seed helper: `.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/post-release-019-full-domain-seed.mjs`.
- Desktop context helper: `.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/post-release-019-full-domain-seed-context.ps1`.
- Source must be a newly retained successful `scripts/electron-f1-harness.mjs --retain-synthetic` root under the canonical OS temporary directory. The caller supplies the exact run ID and independently frozen harness hash.
- The Node seed process must be a direct child of the actual desktop shell returned by `GetShellWindow`. The fixed System32 Windows PowerShell helper also proves its own parent is that Node process and reads the current `%APPDATA%\Mashiro` directory identity through `GetFileInformationByHandle`.
- The observed directory identity must equal `profile.identity` in the independently bound initialization receipt. A copied marker or a caller-supplied identity cannot substitute for the live directory identity.
- The profile must still contain only `.mashiro-019-isolated-profile.json`; exact Mashiro/setup/uninstaller processes must be absent.
- The fixed target `%APPDATA%\Mashiro\data-set-a-full-domain-019` is created exclusively. Existing content stops execution.

## Source qualification

The retained source must have matching browser-phase `seed.json` and `verify.json`, the owned E2E marker, schema 19, DELETE journal mode, integrity `ok`, zero foreign-key violations, and no nonempty WAL/SHM. Any source containing `.mashiro-dataset.json` is rejected, so a production dataset or historical dataset9f cannot become A.

Required durable sentinels include assistants, completed history, memory and its file, items, a reminder, one enabled Provider connection, one binding, one protected persistent credential, background chapters/jobs, daily jobs/reports, steward jobs/branches, retention jobs, content and assistant tombstones, production governance, and a succeeded tool receipt.

The current reviewed E2E source has exact fake transport counts:

- seed: background 1, steward 2, daily 1;
- verify: background 1, steward 0, daily 0.

These are in-process fake transport observations from the retained harness. They are not network calls by this seed helper.

## Snapshot, copy, and safe pause

1. Open the source SQLite database read-only and begin a read transaction.
2. While that transaction remains open, verify schema/integrity/FK/journal, freeze counts and the file hash, initialize the target through the production initializer, and exclusively copy `mashiro.sqlite`, `memory/`, and `credentials/`.
3. Verify the copied database hash exactly equals the source and all required counts match before releasing the source read transaction.
4. Open only the target copy and perform one `BEGIN IMMEDIATE` safe-pause transaction:
   - change the single enabled persistent Provider connection to disabled while preserving its ID, URL, persistent-credential flag and binding; only `enabled`, `updated_at`, and `version` may change;
   - strictly parse the current schemas and set every enabled `background_configs`, `daily_configs`, `steward_configs`, and `discovery_configs` record to disabled, incrementing only its saved version and the background outer version where present;
   - preserve schedules, budgets, recipients, permissions, jobs, reports, history, content, bindings, credential blobs and memory files.
5. Require at least one enabled background row and one enabled daily row to have been paused. Verify every automatic config is disabled, the Provider binding digest is unchanged, credential and memory file hashes still match, table counts are unchanged, integrity is `ok`, and FK violations remain zero.
6. Compare every table and row before/after the pause. Any table outside the five allowlisted configuration tables and retention_state must retain its exact digest. The existing retention trigger must advance epoch by exactly one for the Provider connection update while generation and every other retention_state field remain unchanged. Allowlisted configuration rows accept only the fields above.
7. Record the source hash, equal pre-pause target hash, distinct post-pause target hash, per-table count/digest pairs, changed row IDs and version transitions. The report contains no connection URL, credential bytes, history text, memory body, SQL, or raw error.
8. Release the production lease and source snapshot before CreateNew writing the success receipt.

Disabling both connection and automatic configuration prevents the first packaged launch from dispatching the real BigModel endpoint. The nonempty Provider binding and protected credential remain present as upgrade sentinels. Any later re-enablement must be an explicit product UI action; this preparation never performs one.

## Failure and later native sequence

A failure preserves the target in its actual empty/PREPARING/partial state and writes a sanitized stage when possible. It never deletes or overwrites the target, retained E2E source, preserved original profile, or historical datasets.

After independent review, final artifact binding, profile preservation, and isolation initialization, root launches this helper from the actual desktop shell with:

`node .agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/post-release-019-full-domain-seed.mjs --source <retained-root> --run-id <run-id> --harness-sha256 <hash> --initialized-receipt-sha256 <hash> --context-helper-sha256 <hash> --execute`

The packaged app then selects A through the normal existing-data UI. A is frozen before upgrade. Creating B must produce a different dataset ID and empty business domains, with no inherited assistant, connection, binding, credential, history, memory, item, reminder, background, daily, steward, retention, or governance data. The original preserved profile remains opaque and is restored only through the separately reviewed profile transition helper.
