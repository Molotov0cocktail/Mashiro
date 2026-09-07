# Schema18 internal installation candidate

Source: `99bf73d79c35b86973d65699b62cb91e49830edb`, reviewed main and observed on both existing remotes. This is an internal acceptance artifact, not a released product.

The five frozen outputs in `delivery-017-built-output-01.json` matched before packaging. The builder consumed those outputs directly without running a new source build; unreviewed task018 renderer changes are not included.

The first NSIS invocation exited1 at makensis after packaging and left an incomplete setup. Its returned output was truncated before the precise error was retained, so no root cause is claimed. One diagnostic repetition with full output capture exited0 and generated the setup and blockmap. See `delivery-017-packaged-build-diagnostic-02.raw.txt` and exact artifact hashes in `delivery-017-packaged-hashes-02.json`. No dependency, TLS, security setting, compiler option or product source was changed between attempts.

Installer: `dist/windows-candidate-schema18/Mashiro-0.1.0-win-x64-setup.exe`, 112571376 bytes, SHA256 `62A3E437064ED1F1A7B8FBBEE7FC50499ACB2188C92F94B1F4F92FE1C7192754`.

This unsigned artifact now proceeds to isolated schema15-to18 installation and data-preservation validation. Build success does not establish installed functionality, notification visibility, credential decryption, final acceptance or publication.
