# Release transport bounded review

2026-09-08, independent Astra/medium. **REPAIR before execution**; local read and ESLint only. No script execution, HTTP, tag, upload or release action was performed.

Reviewed `release-transport.mjs` SHA256 `8884B43C6AF83380DBB386263835033774699955F8875AE8B42FBA37D1697A58`.

Necessary corrections:

1. Persist one uniquely identified attempt result on failure as well as success. Currently a successful publish PATCH followed by failed public download leaves no durable report, while a successful repeated verification ends with a `wx` collision against the prior success report. Record completed stage, known release ID and asset verification, and whether publication was confirmed or remains uncertain after a transport timeout. Preserve prior results; report sanitized error codes rather than raw credential subprocess output. No automated deletion or rollback is needed.
2. Scoped ESLint actually exits 1 with 12 errors: missing globals for process, console, fetch, AbortSignal and Buffer, plus no-useless-assignment for clearing the credential variable. Use explicit Node imports where available and a narrow runtime-global access for fetch/AbortSignal; do not widen product lint rules. The assignment to undefined does not guarantee memory erasure.

Read-only positive findings: repository name and numeric ID are fixed; current local HEAD, remote main and lightweight remote tag are checked against the supplied commit. Review, notes and assets are hash-bound and checked as ordinary files under the real project path. Authenticated requests are restricted to GitHub API/upload targets with redirect rejection; public downloads carry no credential header. Existing asset replacement/deletion is absent; missing assets are uploaded only to a draft, uploaded size/digest is verified, and an existing public release is not modified. Public download size/hash is actually checked by the execution path, but remains NOT RUN. These observations do not authorize execution before the final independent release gate.
