# 015 native first attempt

Run `189e0336-7443-4322-9cfc-2e8361164695` retained synthetic root `C:\Users\30910\AppData\Local\Temp\mashiro-f1-e2e-B8RN2A`. The built schema16 candidate used Electron 44.1.1 / Node 24.19.0 / SQLite 3.53.3. The command exited 1.

Seed PID 136792 stopped at `daily-dom-lifecycle / daily-capture-content`, after one synthetic Daily transport call. Verify PID 125640 then failed `daily-default-enabled`, with zero Daily calls. The seed's missing completed Daily evidence means the verify phase did not receive the expected prior Daily identity; neither phase is reported as PASS.

The earliest failure has a concrete new cause: the approved 009 DailyPanel change renders `active` as `已接受`, while `src/main/testing/e2e-daily.ts` still requires the visible status to include `active`. Root inspected both exact source locations. This is distinct from the previously closed detached-card/layout capture route. The fixture author was asked to update only the obsolete visible-status expectation, preserving title/body/Memory receipt checks. No product change or timeout relaxation is requested.

The first repair changed the obsolete substring expectation to `已接受`. Root verified the one-line diff but incorrectly treated the whole span as the status alone; that review missed the nature prefix in the actual JSX and is superseded. Final fixture SHA256: `57EA6BDC15874952262716B1A0458AA14011B9227897F361CC041CE2058BA517`. Title, body, receipt and accepted memory ID assertions remain. The rebuilt candidate exited zero. The second run `d966b6f7-5515-4bd2-a532-3ea62cc3422e`, retained root `C:\\Users\\30910\\AppData\\Local\\Temp\\mashiro-f1-e2e-wHTXT7`, again failed the same seed capture check (PID191252); verify PID67608 had the subsequent missing-prior failure. The real span combines nature and status as `推测 · 已接受`. Before another Electron run, the author must prove that exact DOM expectation through a focused renderer test. No timeout or business assertion is being removed.

The full raw phase reports and screenshots remain in the marker-owned synthetic root. A successful later native run must be recorded separately and cannot erase this failure.
