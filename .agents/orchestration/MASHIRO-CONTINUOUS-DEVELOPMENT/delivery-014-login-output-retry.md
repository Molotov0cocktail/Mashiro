# Internal package output retry

Build 05 reached final NSIS output writing after the uninstaller phase, then failed with `Can't open output file`. The [original log](delivery-014-login-packaged-build-05.raw.txt) remains FAIL; this was not another include/compilation dependency error.

Root inspected only `D:\Mashiro\dist\windows-candidate-login-clean\Mashiro-0.1.0-win-x64-setup.exe` and processes under that exact output directory (`a2a70a`, exit 0). The file was 148402 bytes, had Archive attributes, and could be opened for read with FileShare.None. No process executable remained under the candidate directory; drive D had 64054902784 free bytes. The original failing process's handle owner was not observed, so no antivirus or other process is attributed as the cause.

With the frozen source and five runtime output hashes unchanged, root made one retry. [Build 06](delivery-014-login-packaged-build-06.raw.txt) completed both production stages and blockmap generation, exit 0 (`3bedda`). No protection, ownership, ACL, NSIS warning policy, registry, installed application or personal data was changed to obtain success. [The new exact internal artifact identity](delivery-014-login-clean-packaged-hashes.json) records the result; it is not a final release acceptance.
