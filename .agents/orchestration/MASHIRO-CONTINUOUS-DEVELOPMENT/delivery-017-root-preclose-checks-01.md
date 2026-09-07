# 014/017 integration preparation checks

2026-09-07, PROGRAM ACTIVE. These checks do not replace whole-product or installer acceptance.

- Existing project foundation validator executed against `D:/Mashiro`, exit 0, `ok: true`, no errors or warnings (tool chunk `300165`). No initialization or product mutation occurred.
- `npm ls --all --json` exited 0 (tool chunk `dff395`); dependency-tree output was large and truncated in the tool display. This is an executed dependency-tree check, not a claim that its entire output was archived.
- Existing tracked-change scanner examined 266 paths, no credential-pattern findings, generated artifacts or editing residuals; `git diff --check` exited 0. [Raw scan](steward-013-scan-governance017-preclose-01.json). This is a point-in-time preclose check while 017 renderer work remains active, so final staging must check subsequent changes again.
- Login v2 [independent limited PASS](reminders-014-login-independent-pass-v2.md): 4 files / 20 tests, candidate hash checks and actual Electron API evidence.
- Governance v4 [independent limited PASS](delivery-014-review014-final-v4.md) plus seed capacity v5/v6 [independent delta PASS](delivery-014-review014-seed-v6-final-pass.md) are available. Root read the latter report and its explicit scale limits.

Remaining work: finish and independently review 017 UI, run integrated checks without competing full suites, commit and synchronize reviewed changes, build a corresponding Windows artifact, complete full-domain installation lifecycle and native reminder/credential checks, close RET-007 after the user's decision, complete overall acceptance and actual release/download verification. Earlier whole-test failures are preserved in [integration record](delivery-017-root-integration-01.md); the later focused diagnostic does not retroactively convert that run into PASS.
