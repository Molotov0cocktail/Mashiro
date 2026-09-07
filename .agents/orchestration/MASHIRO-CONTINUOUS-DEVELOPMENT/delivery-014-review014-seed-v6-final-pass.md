# 014 seed capacity delta v6 — independent bounded PASS

Reviewer: `review_014_governance`, actual gpt-6-astra / medium, 2026-09-07. Product files and global progress remained read-only. This review closes [S1](delivery-014-review014-seed-v5-repair.md) and the specific seed read/write capacity mismatch described in [v4 final review](delivery-014-review014-final-v4.md), preserving the other v4 conclusions and limits.

**Verdict: PASS for the v5 capacity delta with its v6 consistency repair.** The complete delta consists of three paths: index, seed reader, and capacity test. [v5 manifest](delivery-014-governance-manifest-v5-delta.json) SHA256 `E237E6B026F6B97547FC3815A8B49D2C26CECBDDE0277EE09BEE458F0C3CD317` supplies index/test; [v6 manifest](delivery-014-governance-manifest-v6-delta.json) SHA256 `6666EB0AE6336F53F12A93184B81CEA7A77D8A93CE54E267A2BA77A4EAB803C2` replaces only the seed reader with SHA256 `3059EF92932FAA73B3FA6B4F57119ADD89D36BC3D29D1AFAC425D9C9FC42ED08`. All three merged paths matched before and after validation, zero drift.

[Final raw independent run](delivery-014-review014-seed-v6-final-tests.json): **4 files / 9 tests passed**, one worker, exit 0. It includes the original reviewer final-stat truncation oracle, exact-byte acceptance above8MiB, legacy unbounded-seed rejection and directory rejection; the author's real portable/import/seed I/O and truncation/tail/hash rejection; and actual production session initialization and schema upgrade recovery. The reviewer oracle SHA256 remains `7E5A28BF3C448D98EBAAF847C63537D96C793C176132EE111B78B9F51D0A3F40`. No behavioral assertion was weakened for the repair.

Final static output from tool chunk `89a245`:

```text
tests: 0
eslint: 0
prettier: 0
typescript: 0
```

ESLint/Prettier cover the three delta files and reviewer test; TypeScript uses the trusted node project. The v4 whole governance suite was not needlessly repeated.

The code now binds each new seed to its accepted serialized byte count and SHA before registration, reads no more than that count in chunks, and rejects initial size mismatch, truncated reads, extra tail, digest mismatch, descriptor/path identity change and final descriptor/path size or modification-time change. S1's actual same-inode truncation immediately before final path stat is rejected. New malformed PREPARING seeds fail before journal creation or registry READY promotion; existing small metadata caps remain. Legacy seeds without recorded bytes retain their previous8MiB acceptance boundary. Large partial journals are preserved by verified ordinary-file rename instead of a small-buffer read.

The specific prior asymmetry is closed: a valid approximately9.2MiB portable projection can be persisted and read back as an import seed. **Journal.create remains stubbed in the80,000-projection capacity test**, so this proves seed I/O acceptance and corruption rejection, not full-scale journal fsync/application throughput or unlimited-memory restoration. No RET-007 capacity or retention-policy decision was introduced.

The original red01 timeout from deep Buffer comparison and S1 assertion failures remain in their reports. Native Buffer.equals retains exact byte comparison without that test-framework cost. No paid call, new dependency/schema, real personal data, product edit, commit or push occurred. All processes finished. PROGRAM remains ACTIVE; integration, native Windows lifecycle, overall acceptance and release/download verification continue separately.
