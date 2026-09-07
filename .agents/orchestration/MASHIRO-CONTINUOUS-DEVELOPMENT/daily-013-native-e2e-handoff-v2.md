# Daily 013 retained native E2E handoff v2

Status: **LOCAL NATIVE RETAINED PASS**. Command: `D:\nodejs\npm.cmd run test:electron -- --retain-synthetic`. Run ID: `813ded0c-1e7f-4b44-8442-fdcd19ffe20d`. Retained marker-owned root: `C:\Users\30910\AppData\Local\Temp\mashiro-f1-e2e-YSASSE`.

The real Electron/preload/IPC/DOM flow configured observation, ran one fake-transport request, opened the report, accepted the inference into Memory, reopened the refreshed report after the product intentionally cleared the accepted detail, and restored identical configuration/job/report/observation/Memory/source identities in PID 2 with zero Daily Provider calls. The job budget snapshot is `callsUsed=1` and `inputCharactersUsed=2382` in both processes. The old pending response remains saved and restores as `interrupted`; startup recovery made zero Provider calls.

The captured title, `active` state, body, and Memory receipt rectangles are 209–230, 209–230, 246–267, and 283–333 in a 615px viewport for both phases. Root visually reviewed the final verify screenshot and confirmed the accepted title, body and Memory receipt are visible. Rect metadata is evidence and no longer blocks business PASS.

Candidate source hashes:

- `src/main/testing/e2e-daily.ts` — `17258543A3E02BB947429740A56589DFF272BA2174B1650978CE7EAA8338E2CC`
- `src/main/testing/e2e-controller.ts` — `B6B8921982E8642BECCA7C76C7722097F39D2E68B069DCCE29633EDFBA8EB62F`
- `scripts/electron-f1-harness.mjs` — `5B34221EE36E8FB2393D2231471C5C836414FF11FB247E11613D372539B140A5`
- Astra-authored, root-reviewed budget repair `src/main/background/daily-service.ts` — `04965032CDCCFFEA671F8AEC563D3369A0DC419160FFCE09C29223BD63A958E8`; independently covered by trusted manifest v3 `E53D0458E049713225EB72467695467771D94F801E6BCB48E118C9B7D098EB76`.

Evidence:

- `daily-013-native-e2e-02.json` — `664DDB842DD6A23ADDAA1036266BD093DE3249D8002338E456C80F364FD33FE0`
- `daily-013-native-seed-ui-02.png` — `B06A5A5BFE691C6E5E9CF783E7A32FDF3BD07A48EFDDDE104CCD613A8364D679`
- `daily-013-native-verify-ui-02.png` — `AF30A53B25A5E1770CAF3C45E12F0855DCA2729F01D3720F29EEFDCC73C3B153`

Retained failures preserve the repair trail: early pending cancellation before the request was moved after Daily governance; a seven/eight-call reporting mismatch; current-vs-prior persona separation; one 45-second verify timeout; screenshot attempts that returned `daily-capture-content`, `daily-ui-timeout`, and finally exact detached-node rects of four `0..0` values at viewport 615. The final route reopens the report after `setDetail(null)`, queries current live DOM, captures metadata without treating layout as a business gate, and passes.

This remains local fake-transport evidence. It is not live Provider, PACKAGED, installer, or release qualification.