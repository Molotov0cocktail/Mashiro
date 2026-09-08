# v0.1.0 post-publication independent review

Verdict: **Q12_PUBLICATION_AND_ANONYMOUS_DOWNLOAD_PASS**. Independent review_017_trusted, GPT-6 Astra / medium. This reviews executed evidence and unchanged transport code; it does not repeat the 112 MB download or modify the public release, tag, source, assets or installed scene.

The public release is Molotov0cocktail/Mashiro release 384579648, tag v0.1.0, commit 6c72c007fc22bb17eb3173a919abc58de8153ffe: https://github.com/Molotov0cocktail/Mashiro/releases/tag/v0.1.0 . The anonymous reconciliation receipt reports draft=false and an exact body match to reviewed release notes. All five asset IDs, byte lengths and SHA-256 digests agree with the final materials review and the completed recovery receipt.

| Asset | ID | Bytes | SHA-256 |
| --- | ---: | ---: | --- |
| Mashiro-0.1.0-win-x64-setup.exe | 550187017 | 112587919 | 8F33C7E10FA663F52EABD9418B2B51979D1E191B1C3F5D28606068F95FCDDB58 |
| Mashiro-0.1.0-third-party-notices.zip | 550187194 | 2670275 | 541450973FA7DB5E7270D5DAF6F0AD23065B0C36FECD2F83D5FD9E4446A95BAC |
| Mashiro-0.1.0-install-upgrade-guide.md | 550187213 | 15584 | 56F0F951B6E4915437EE18F648FA2CE4E83AA3BBA3F74969BCA38E843D100AD1 |
| release-notes-0.1.0.md | 550187237 | 6354 | BE1CA92B5767B4DCE4683BED6DA14BEA320444CA8E66F96D8F9AD932156ED3DA |
| SHA256SUMS.txt | 550187269 | 396 | D4A43E4A8CB01F5681D043C6DC6034AD408F20165345A09B441FC7A960C8B9B9 |

The original attempt remains FAILED_OR_UNCERTAIN_RECONCILE_EXISTING_RELEASE_BEFORE_RETRY after PUBLIC_RELEASE_CONFIRMED. Its report cached the draft untagged browser URLs before publishing; transport line 154 rejected those URLs before line 155's public GET. This is a real coordination defect/first failure, not a failed upload and not a successful initial download. No history is relabelled.

Recovery uses the existing-public branch: a fresh GET supplies current v0.1.0 URLs; all five existing assets pass state/size/digest checks. Missing assets on a public release would fail before POST; draft=false skips PATCH. The actual recovery stages contain EXISTING_PUBLIC_RELEASE_CONFIRMED, five ASSET_DIGEST_VERIFIED, PUBLIC_RELEASE_CONFIRMED, five successive PUBLIC_ASSET_DOWNLOAD_VERIFIED, then COMPLETE. There is no draft creation, upload or publish pending stage. Together with the code branches this supports no repeated POST/PATCH, deletion or replacement during recovery; these checkpoints are not a packet capture.

Each download calls globalThis.fetch on the exact public tag URL without the authenticated request helper or Authorization headers, checks HTTP success, consumes response bytes and compares both length and SHA-256 before marking downloadVerified. All five reach true. Final receipt completed at 2026-09-08T09:05:14.792Z (17:05:14.792 +08:00), verdict PUBLISHED_AND_PUBLIC_DOWNLOAD_VERIFIED. Reviewed code SHA remains 4AACFE26E6C400685CAB4BC21C46761412362743D74D0B0297B43A18A3CE932C.

Frozen evidence (independently read and hashed, tool chunks f96fb5/b6e525/c571cc):

- First failure: release-v0.1.0-2cbf5d97-08df-4be8-8927-b920d4144fb2-016.json, SHA-256 B1F31418E0AD208B1800955512C80AB020787413EC16A49FA4F93749903A9564.
- Anonymous metadata reconciliation: release-v0.1.0-public-reconcile-01.json, SHA-256 78262772CC0E61A58F13A2FE44B64842BFB896B8952B1358128557C86E875425.
- Recovery sequence: release-v0.1.0-fc6fd512-606f-44ff-838d-55c2ffb41cea-001.json through -014.json.
- Completed receipt -014.json, SHA-256 279D8C5DBBBBBFB1BAB9FBD28B7EB7560D1518D64AC0FE1E6B514F18047B08DD.

Q12 and the remaining actual-publication/download part of G08/G09 are closed by this executed evidence, combined with the existing product/Windows and final-materials PASS. Actual NotSigned status and all documented product limits remain unchanged. Future availability is not guaranteed by this point-in-time verification. No additional product repair or publication operation is required for this completed release.