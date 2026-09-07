# 014 independent pre-review: ignored SQLite write

Status: original REPAIR mechanism is now closed by a bounded independent regression; the full governance candidate remains unfinished and this is not a release verdict.

Root inspected `production-governance-database.ts`: its BEFORE INSERT/UPDATE triggers insert commit tokens before the main row is accepted. A token can therefore commit even when SQLite ignores the intended row change. Treating that token as proof of the projected NEW state would make the external governance ledger describe a change that never happened.

An independent in-memory experiment used the actual local Node SQLite runtime, without any production data or product-file change:

```sql
CREATE TABLE facts(id TEXT PRIMARY KEY, value TEXT);
CREATE TABLE marks(value TEXT);
INSERT INTO facts VALUES('a','old');
CREATE TEMP TRIGGER before_fact BEFORE INSERT ON facts
BEGIN INSERT INTO marks VALUES(NEW.value); END;
INSERT OR IGNORE INTO facts VALUES('a','not-applied');
```

The command exited 0 and reported `actual=old`, `recorded=not-applied`, `committed=true`. This demonstrates the mechanism rather than a completed end-to-end product exploit. The author received the source finding and actual result before candidate freeze.

Required resolution: commit-token projection must correspond to an applied row change, including INSERT OR IGNORE and UPDATE OR IGNORE constraint conflicts. Evaluate AFTER row triggers with durable callback failure still aborting the statement/transaction, or another proven mechanism. Preserve rollback, cascades, old/new key changes, multi-connection settlement and partial iterator behavior. Do not infer transaction rollback from a later row snapshot.

The author replaced BEFORE with AFTER row triggers and retained durable pre-commit callback failure handling. Root independently ran the ignored-write and original mechanism test files: 2 files / 4 tests passed, exit 0; raw evidence is `delivery-014-root-ignore-01.json`. Inspected `production-governance-database.ts` SHA-256 was `92D37763FFACFF09326F3D56B41B41FCE32DE224C11F640531EFC2667DD3AD43`. This closes the demonstrated ignored-write mismatch only; remaining restore integration has separate acceptance.
