# Actual approval gate: full-profile preflight

2026-09-08. The reviewed preflight script (`review019-profile-preflight.ps1`, SHA-256 `512C0B1815D32D433ABEDB3D2DC2C543C43CD905BF484C339702FEBE94C32570`) was not executed. Automatic approval rejected the process-creation request before dispatch.

The stated reason was that reading and hashing the complete Mashiro configuration directory may access real business databases and credential-related files, exceeding the previous private-data access authorization even without modification or external transmission.

Root requested explicit user authorization through an asynchronous question for byte-level integrity checks and reversible preservation/restoration of exactly `C:\Users\30910\AppData\Roaming\Mashiro`. The question states that business text will not be parsed, credentials will not be decrypted, nothing will be sent externally, original data will not be deleted, and the test tree will be retained separately. No response has yet been recorded in this file.

Do not bypass this rejection by changing shells, directly renaming the profile without the rejected preflight, using another agent, or indirectly running the same action. The independent engineering assessment that the repair authorization was sufficient did not constitute platform approval. Source implementation, synthetic tests, interface work and independent review continue; only the dependent native profile-preservation step waits for this specific answer.

## Resolved by explicit user authorization

The user subsequently answered: “允许校验、保全并恢复该目录”. This authorizes the exact scope described in the question; it does not authorize parsing business content, decrypting credentials, external transmission, deletion of original data, or unrelated directories.

The same reviewed command was resubmitted through normal approval after that answer and allowed (tool 9d0775). It ran once from the ordinary desktop at 19:05+08. `review019-profile-preflight-01.json` records PID 81440 with parent/shell 8252, original directory identity `D4AE69AB:011C00000001C1FF`, 92 files / 6,078,369 bytes and aggregate SHA-256 `BFA47C4C5514DE7E6183202465063DB767B65C2593BD0BDAC6A7B70419EAE103`. Current/legacy Run and StartupApproved values are absent using the checked missing-versus-error reader; the exact uninstall subkey is absent. No profile move or app launch occurred.

The former rejection remains historical and was not bypassed. The dependent profile-preservation step is now authorized but still requires immediate preflight, reversible same-volume moves, exclusive ownership checks, and independent scrutiny of the actual operation.
