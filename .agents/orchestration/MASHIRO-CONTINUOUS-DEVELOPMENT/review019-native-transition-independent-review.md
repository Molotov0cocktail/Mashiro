# 019 native transition preparation — independent static review

Result: REPAIR, PREPARED_ONLY. No real profile/registry read, helper execution, directory move or application launch was performed. Existing user authorization to hash, preserve and restore the exact profile is acknowledged; this finding requires engineering correction, not another user gate.

The plan and binding template appropriately retain an unbound candidate gate, an actual-preservation receipt gate, fixed Desktop subdirectory rather than Desktop root, nonempty synthetic cross-domain A, fresh B noninheritance, ordinary Explorer execution, no Provider calls, and final rename-only retirement/restoration. Unknown uninstaller hash may legitimately be filled after installation; its absence in this preparation template is not a defect. Native observations and historical failures remain separate from preparation.

## Actual PowerShell guard defect

The expression `if (Registry-ValueExists $runKey $name -or Registry-ValueExists $approvalKey $name)` is parsed as one command invocation with additional arguments. A pure in-memory equivalent (ee99c1) with Run absent and approval present called only the Run function and returned PASSED; the approval check was never invoked. No registry access was used in this proof. Parenthesize each function invocation before applying -or.

## Required static corrections before admission

- Get-TreeSummary rejects root/descendant reparse points but not existing ancestors. Validate the exact normalized profile and fixed sibling paths through all existing ancestors before each sensitive operation, as in the previously reviewed preservation helper.
- InitializeIsolation uses Directory.CreateDirectory after checking absence and hashing the preserved tree. That method can merge into a directory created concurrently. Prefer creating a distinct owned staging directory, writing its marker, then Directory.Move to the still-absent exact profile path, which refuses an existing destination. Preserve staging on conflict; do not delete unknown contents.
- RestoreOriginal accepts any current non-original directory containing a copied marker. Bind the final test-tree identity/hash to a frozen end-of-test receipt before retirement, not merely a hash computed from whatever currently occupies the path. This binding can be populated after the tests; no future value is demanded now.
- The only process checks precede potentially long tree hashing. Recheck zero relevant processes and the intended directory identities immediately before rename, and recheck exact registration absence after hashing. A changed or concurrently occupied source/destination must preserve both trees, not proceed using stale observations. Directory identities and same-parent checks alone are not proof of quiescence.
- Write a CreateNew pending receipt before the two directory moves, recording fixed source/destination and compared identities. Current success/failure-only reporting leaves an abrupt termination between moves without an action receipt. A failed final verification after originalMoved must retain both trees and report uncertainty; never overwrite them to manufacture rollback success.

These are bounded changes to the prepared transition helper, not a request for a new account or broad lifecycle matrix. The initial preservation helper's prior review does not automatically qualify this separate restore implementation. The final filled artifact/test-profile binding still needs its exact values checked before use.
## R2 static follow-up

Read the complete revised helper, SHA256 `B00EB2711A902D63F2BEFFEC3865D7E620EB2BB17E8ED71BBACF5AD932BB1006`, without executing it or accessing the profile. Parenthesized registry predicates, ancestor checks, exclusive CreateDirectoryW, frozen final-tree receipt, both pending records and immediate pre-move checks address the prior findings. Failure paths preserve both trees and do not delete data.

One remaining REPAIR: FreezeTestProfile does not read the initialization receipt or require its recorded directory identity. A replacement directory carrying a copied marker can therefore be frozen as the test tree. Bind freezing to the initialized receipt's kind, scene, exact profile path and original created directory identity; permit expected file-content changes but reject directory replacement. Restore must continue binding to the final frozen tree. This is a static counterexample, not a claimed execution failure. No real helper operation was performed.

## R3 identity binding closeout

STATIC LIMITED PASS for helper SHA256 `DA556D10E3F65F5D78AE0CE48F5ACB829E0D9A975F711D05DFC4063B6446E05C` (24516 bytes), independently read without execution. Initialize writes its exclusive-created directory identity and exact scene/path/candidate identity to the fixed CreateNew initialization receipt. Both FreezeTestProfile and RestoreOriginal now validate that receipt and require the current directory identity to match initialization; normal test content changes remain allowed. Restore additionally checks the final frozen identity/hash before retirement, so a copied marker on a replacement tree no longer authorizes retirement. The prior R2 finding is closed.

The previously reviewed fixed sibling scope, ancestor non-reparse checks, registration-clear predicates, preserved-original identity/hash, pre-move checks, pending receipts, rename-only operations and retain-both-on-conflict behavior remain applicable. This admits the prepared helper for final exact artifact binding under the existing authorized plan. It does not attest to an actual preservation, test-tree retirement or original-profile restoration: none was executed by this reviewer. Historical R1/R2 findings and failed evidence remain preserved; actual phase receipts must establish execution outcomes.
