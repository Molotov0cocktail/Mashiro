# 018 integration

The exact seven-path candidate received independent source/local-UI PASS in `review018-independent-final-pass.md`: ten files / 55 tests, Node and renderer typechecking, focused lint/format and before/after manifest hashes passed. Root ran the integrated build successfully (139 renderer modules), then whole-project formatting successfully.

Whole-project lint initially found only missing Node globals in newly added installation evidence helpers, not product files. Root followed the previously independently reviewed exact-path configuration approach for two frozen helpers; a subsequent run identified a third helper still being authored by the installation executor, who is adding explicit Node imports. This is not recorded as a passing whole-project lint run.

The preceding 017 trusted/main/preload verification and two-PID lifecycle evidence remain applicable to unchanged trusted/runtime code. Final installed UI acceptance will use a later artifact containing 018; the current schema18 internal installer deliberately contains the previously reviewed 017 build. No new native 018 or final release PASS is claimed here.

The 016 old-round access regression is closed at source/local-UI scope. Notification late failure is a newly independent RED within 014 and remains outside this renderer candidate. RET-007, installation lifecycle, actual protected credential use, final overall acceptance and publication/download verification continue. PROGRAM ACTIVE.
