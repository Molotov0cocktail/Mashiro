# Chat-first viewport integration

Current result: actual isolated Electron lifecycle and both requested window sizes PASS. Packaged/native acceptance remains separate.

The independently reviewed compact renderer has ProviderPanel SHA63B8D00D984E64926B1A4AE2AD7A54BFF75AF93C903BB7D6F99C99E6226C80F9 and AppShell SHAEBE8AC0F0B676E04CFDE3783AAB795DCCE70C772FF667265D0164DF7EF5258B8. Astra's compact-layout review retained model settings, named region, hidden drafts and permission deep links; original 11 independent checks passed. Earlier complete renderer integration passed 53 files / 202 tests.

Root independently read the test-only viewport hook, SHA4CC7034D5E4C5434D2845118A8436AFDFDD8C428F9172CA466F01A90B2068978. It preserves existing lifecycle/business assertions, checks exact actual outer dimensions, captures actual content geometry and synthetic PNG/JSON before rejecting an invisible result, and restores the previous bounds. Root required positive dimensions, horizontal bounds and correct failure-stage retention before admission. The hook does not grant a production renderer new capabilities or access original data.

Actual failures were retained rather than relaxing the geometry predicate:

- Electron07, run72203e3e-d75c-46ee-9990-37910f61c947: at outer960x680/content944x615, composer bottom678.16 and send bottom665.16 were offscreen. Repeated page/Provider headings were compacted.
- Electron08, runae5d7f61-4462-46c5-af49-59ef1c2933cc: 960 passed, outer720x520/content704x455 failed with composer bottom493.48 and send482.48. The fixed-width identity area inherited flex wrapping and stacked its avatar above the text.
- Electron09, run155337c1-e29e-43e9-b22c-73dbc4e36227: nowrap reduced height by35px; textarea and send were fully visible, but the stricter full-composer predicate still failed at458.48 versus455. Reducing only short/narrow composer vertical padding from10 to6px addressed the remaining border overflow. The predicate was unchanged.

Root reconstructed the reviewed stylesheet SHA7D210DCD8D819D63530236346ACD2AB636C4E8C0FD66C05D99EDC79081D11300 by reversing exactly the nowrap/basis/min-width/text-wrapping and short-window padding changes from final SHAE912CFDE6C79E9EF9F7E2C192C721995F026DBE8DF824C92A26C368F547484FD. Exact hash equality proved there were no unrelated stylesheet changes (tools80d9bd/19894c). These small author changes received independent root read/diff review and actual geometry verification.

Build08 passed. Electron10 exited0 with E2E_SUCCESS_RETAINED, run09527ef1-e568-4c0f-bea0-e85814b2fe83, seed PID95924 / verify PID92712. Both actual outer sizes exactly matched requests. At960x680/content944x615, composer bottom519.91 and send508.91 were visible; at720x520/content704x455, composer bottom450.48 and send443.48 were visible below the107px sticky navigation. Root viewed the actual final720 screenshot. Evidence is the post-release-020-viewport-10-* JSON/PNG pair for each size and root-electron-10 raw log. Five build outputs are frozen in post-release-019-020-output-08.json.

Final full-suite05 is running at this record's creation; its result must be recorded separately when complete. No final 0.1.1 release or packaged UI PASS is implied. Native foreground work was explicitly paused for the isolated window run and released after exit; original-profile preservation and restoration remain owned by the separate native lifecycle.

Final result update: full05 completed with230files/909tests,901passed/0failed/8explicit optional skips. Final typecheck and format passed. Lint01 retained its three offline-checker missing-Node-import errors; explicit Buffer/process imports only were added, and final-lint-02 passed. No product changes followed the build08/Electron10 freeze. Native v0/v1 startup crash remains a separate release blocker; this is SOURCE/E2E PASS only.
