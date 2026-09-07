# Auxiliary-script lint environment repair

The first whole-project run failed with 21 errors confined to five newly archived Node/Electron helper scripts; [original output](delivery-017-root-static-initial-01.json) is retained. Product and renderer source were not the failing paths.

Root's initial configuration attempted Node globals for all orchestration `.mjs`/`.cjs` scripts and CommonJS for all archived `.cjs`. A second actual whole lint run (tool chunk `54545b`, exit 1) exposed nine `no-redeclare` errors in existing `memory-008-hard-kill.mjs`, `memory-008-spike.mjs` and `reminders-012-notification-probe.cjs`, plus the latter's now-unused require-import disable. These historical files already declared their own globals; they were not edited or rerun as experiments.

The final route narrows the environment mapping to the exact five new helpers and the CommonJS override to the exact new login probe. Product/test rules and ignored paths remain unchanged. This fixes the actual runtime classification without altering historical evidence or suppressing product checks. Final verification and independent proportional configuration review are separate evidence; neither failed run is relabeled as PASS.
