# Memory 008 provenance repair executor evidence

Date: 2026-09-06. Role: repair_008_provenance, actual gpt-6-astra / medium. Mode: authorized repair, independent reviewer remains separate. Live HEAD observed: a5041632c09aa3d421654e56a1e76c9e109147bf. Existing 008 work was uncommitted on entry; no commit or push performed.

## Repair

The flattened source closure rejected current corrected memory when a source round pointed back to its obsolete version. Source authorization now traverses paths, allowing an obsolete memory reference only under an already validated current version of that same memory. It retains source edges, checks withdrawal and current scope/recipient grants, traverses old-version dependencies, and checks current accepted body integrity. Ordinary history rooted in an obsolete version remains denied.

Independent review then exposed exponential revisits on a small dense history DAG. Completed validation is now memoized by source key plus sorted current-memory ancestor context; the 4096 bound counts newly evaluated contexts. A shared DAG is bounded without reusing obsolete-version approval on a path lacking its current-version ancestor.

Provider request-local successful correction receipts supply current references for continuation checks. Every such current reference is revalidated before resolving a previously provided old reference. The exemption is not persisted in history, and does not authorize retries or duplicate writes. Selected historical replay containing obsolete tool output remains rejected. Root's providedHistory propagation is preserved.

## Production regressions and validation

- Added four memory-service regressions: model-created correction recall plus two derived levels and source withdrawal/read/recipient revocation; search then correct then successful answer in one request with old historical replay denied; dense 20-node DAG plus withdrawn source rejection; context-sensitive memo isolation.
- Root independently added three production history-search regressions in memory-history-provenance.test.ts. Executor only fixed the handed-back fixture's tool-name TypeScript type and formatted it.
- Trusted unit/integration run: 19 files / 146 tests PASS, 2026-09-06 22:05:33 local. Existing strict temporary and transactional mutation regression cases included.
- Trusted TypeScript tsc -p tsconfig.node.json --noEmit PASS. Scoped ESLint on the two production and two test files PASS.
- Four-file Prettier check PASS before the final type-only fixture edit; that edit was formatted by Prettier successfully.
- Initial fixture literal type widening and root fixture import/type failures were observed and corrected; they were not product failures.
- apply_patch and ordinary exec failed before target access due to sandbox helper setup refresh. Authorized require_escalated host execution succeeded. Edits used exact SHA-256 preimage checks, exact-match transformations, same-directory temporary files, File.Replace backup, postimage verification and rollback branch. No provenance temporary or backup residuals remained in the checked directories.
- No live calls, keys, personal data, dependencies, commits or pushes were accessed/performed by this executor.

## Final production fingerprints

- src/main/memory/memory-service.ts: 68C322A9BAB37BF5D96DA9B6A807B437B3EF66CC073026DD9FE31DBCCFC596E7
- src/main/provider/provider-service.ts: 576F16F287A51652C49FFE1D0F478AA14EB0EA6040583ABC6B9DE6AAE355A9B8
- tests/integration/memory-service.test.ts: DECC316A3D720CBD3B45DD2071F16746C8A2B9627774356574282A8F5F0D80D8

Independent final verdict and final Electron/full qualification belong to root/reviewer. This report is executor evidence, not FINAL PASS or PROGRAM_DONE. Assigned file write ownership is returned to root.
