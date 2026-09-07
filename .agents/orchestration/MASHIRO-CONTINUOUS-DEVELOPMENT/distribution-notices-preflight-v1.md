# Distribution notices preflight

2026-09-06 coordinator inspected installed exact dependency package metadata and license files. This is input to Q10/Q12, not a complete final-artifact license audit. No project license terms changed. No tracked project LICENSE/NOTICE file was found by the repository filename scan; user authorization to release is not permission to invent a new project license.

| Installed runtime component | Declared license | Original license file SHA-256 |
| --- | --- | --- |
| react 19.2.8 | MIT | DA6D3703ED11CBE42BD212C725957C98DA23CBFF1998C05FA4B3D976D1A58E93 |
| react-dom 19.2.8 | MIT | DA6D3703ED11CBE42BD212C725957C98DA23CBFF1998C05FA4B3D976D1A58E93 |
| scheduler 0.27.0 | MIT | DA6D3703ED11CBE42BD212C725957C98DA23CBFF1998C05FA4B3D976D1A58E93 |
| zod 4.5.4 | MIT | 3F1189B28E3866E0D979968D466B78F813F76827CFDCA1FBB124CC0A5C8841F8 |

The original files are each package's `node_modules/<name>/LICENSE`. Electron44.1.1 distribution contains `LICENSE` (1096 bytes) and `LICENSES.chromium.html` (20472827 bytes). Final packaging must preserve the actual Electron notices, including any builder-renamed Electron license filename, and distribute the applicable exact runtime/bundled dependency notices. Do not replace a complete notice with a package.json license label.

A reproducible [collector](distribution-notices-v1.mjs) now checks installed versions against the committed lockfile, copies original notice bytes into a new direct child of the system temporary directory, and verifies every copy hash. It does not replace an existing output directory or read runtime/user data. Coordinator ran it after scoped ESLint passed: 6 notice files, 20478259 bytes, output `C:/Users/30910/AppData/Local/Temp/mashiro-notices-e17998be503a4b6da771773b37d9af12`; manifest SHA-256 `5e54320feef83520d8e1d4885ea72cea6921c0b9ee9fbc26b5e5f94ca33597e7`. The manifest explicitly sets finalArtifactVerified=false; the generated files remain outside Git.

2026-09-07 coordinator rechecked the collector source and ran it in a new isolated root `C:/Users/30910/AppData/Local/Temp/mashiro-notices-b5566d3d141049c5ae8442845e4f8765`: the same 6 files/20478259 bytes and manifest SHA above matched; generated Markdown contains actual line breaks. An attempted exact replacement to investigate displayed escapes failed its preimage match before writing; inspection confirmed the source already had correct escapes, so no collector change was made. Scoped syntax/lint passed. This remains preparation, not a final artifact audit.

Final work remains: enumerate actual packaged and bundled components from the frozen lockfile/build output, collect their original notices, verify the installed artifact exposes these files, and tie the notice set to the accepted artifact manifest. Later dependency changes invalidate this inventory as a final list. Build-only dependency presence in node_modules is not proof it ships; dependencies bundled into renderer output still require corresponding notices. Missing any actual final component must be resolved before release, not hidden by this preflight.
