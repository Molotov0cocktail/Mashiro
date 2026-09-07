# 014 v5 seed delta — REPAIR S1

Fresh independent Reviewer review_014_governance, gpt-6-astra / medium, 2026-09-07. Production remained read-only. The three files in [v5 delta manifest](delivery-014-governance-manifest-v5-delta.json) matched their hashes; manifest SHA256 `E237E6B026F6B97547FC3815A8B49D2C26CECBDDE0277EE09BEE458F0C3CD317`. The prior v4 bounded PASS remains valid for its scope.

`readGovernanceSeed` checks descriptor size/time after reading but the subsequent path `lstat` checks only device, inode and symbolic-link status. A real same-file truncation between those two checks is accepted: the path is now shorter, yet the previously read buffer and hash pass.

The [independent oracle](../../../tests/unit/production-governance-seed-review014-independent.test.ts) wraps only `lstatSync` to truncate an actual synthetic file immediately before the final path stat. The original expected exception fails explicitly in [red01](delivery-014-review014-seed-red-01.json), independently of the first test's deep-Buffer-comparison timeout. That slow assertion was replaced with native `Buffer.equals`, retaining exact byte comparison. [red02](delivery-014-review014-seed-red-02.json) completes quickly: the size/legacy-limit and directory checks pass; final path truncation still fails.

Required bounded repair: final path must still be a regular file with the recorded length and unchanged modification time, in addition to existing descriptor, identity, no-tail and hash checks. Preserve the oracle and freeze a new delta. No larger journal/fsync performance run is requested. Large-seed journal creation remains stubbed in the author's capacity test and must not be represented as full-scale restoration qualification.

No commit, product edit, paid call or real personal data access. Tool processes finished. Next: original author applies S1, then this same Reviewer reruns the small capacity/session delta suite and verifies final hashes. Current v5 verdict is REPAIR.
