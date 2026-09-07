# 014 notification diagnosis — late failure and retained activation route

Date: 2026-09-07. Independent reviewer: accept_016_final, assigned gpt-6-astra / medium. Observed source baseline: `99bf73d79c35b86973d65699b62cb91e49830edb`, with separately reviewed018 renderer changes. Product and installed scene were read-only. Verdict: **REPAIR** for the reproduced service defect below. Actual notification-center visibility and cold activation remain **NOT_PROVEN**; this report does not assign the entire live OS symptom to the service defect.

## Proven local defect R014-N1

[Independent real-service oracle](../../../tests/integration/review014-notification-late-failure.test.ts) creates an actual assistant, formal item and reminder in a repository-external synthetic SQLite store, attaches a controlled native-event port, advances the injected clock and invokes real dispatch/settlement.

[Original RED result](review014-notification-late-failure-red.json): 3 tests, 2 passed, 1 failed, process exit1. The first test observes DISPATCHING→DISPLAY_OBSERVED, then emits failed. The persisted reminder remains DISPLAY_OBSERVED, failing the expected FAILED assertion. The paired occurrence assertion is after that first failing assertion and therefore is not falsely claimed as separately executed. Controls pass: failed→late show remains FAILED and is not redispatched; item completion→late failed remains CANCELLED. ESLint on this independent file passed.

ReminderService.settle at line710 only accepts records presently DISPATCHING or RESULT_UNKNOWN, so a later failure after a show event is discarded. The current renderer calls the retained state “已观察到展示”. A native failure must remain observable without making an already-failed or cancelled reminder eligible for delivery again.

Frozen diagnostic source hashes:
- reminder-service.ts: FF2C6D0444EDE8C25532DEA4AE9E9A9749A0BD422697533D958BC22234A86411
- windows-reminder-platform.ts: 9015453516B5DC1CDB1FB977EDB7736821A4D6EBC2EA8C45ADC9AB509320C7A8
- reminder-runtime.ts: 192C94D559967BBEA708B578CC54766DD00D51B3A0576B93A4ECDAED77B65D09
- independent test: AFA7774B0B7FC4718C99208D0C18D7FCC83754480B026A803028D7433C4394CB

Required bounded repair: additionally permit FAILED to supersede DISPLAY_OBSERVED for the same current version and valid item. Keep transactionally consistent reminder/occurrence records, current-version/validity checks, cancellation protection and no automatic repeat delivery. Do not broadly allow every terminal transition. Preserve the original three independent assertions.

## Verified platform meaning and shutdown path

Electron44.1.1's [Windows toast source](https://raw.githubusercontent.com/electron/electron/v44.1.1/shell/browser/notifications/win/windows_toast_notification.cc) reports its displayed callback immediately after successful WinRT Show. A separately registered Failed handler can later post a failure. The same source implements explicit removal from notification history and native hiding. Thus show is evidence of successful API submission, not proof of persistent center presence; later failure is a possible real event ordering.

The [Electron API implementation](https://raw.githubusercontent.com/electron/electron/v44.1.1/shell/browser/api/electron_api_notification.cc) maps displayed/failed callbacks to corresponding JS events. Its Close path removes or dismisses the native notification. HandleActivation registers a central callback; it does not initialize the presenter by itself. Local installed electron.d.ts lines10575–10637 separately documents pending activation delivery and the Windows close contract; getHistory is marked darwin and must not be used as a Windows history oracle.

In Mashiro, ReminderService.close at line784 closes every native notice. ProviderService.close at line1747 invokes it before closing SQLite; index before-quit invokes ProviderService.close before runtime.stop. Changing runtime.stop alone cannot preserve a delivered notification. This source path is consistent with root's observed zero app history after explicit exit, but was not newly exercised on the live desktop by this reviewer.

Recommended lifecycle repair: distinguish invalidating a business reminder from stopping its process. Cancellation, completed items and invalid membership still withdraw the native notification. Ordinary shutdown stops scheduling/timers and invalidates/detaches callbacks while retaining already-delivered toasts for later activation. Ensure all production shutdown paths use the same semantics, including ProviderService.close and runtime.stop. Late native callbacks after shutdown must be inert before any closed-store access. A shared merged native notice should be withdrawn at most once when its last valid member retires.

Do not treat removal of one close call or retaining a JavaScript reference as proof of Windows persistence. Verify final Electron teardown/GC behavior with an actual retained toast and clean process exit. If the lifecycle route fails directly, compare a narrow native Windows toast adapter preserving the same reminder identity/governance contract; do not lower the cold-activation acceptance or introduce broad IPC/network authority.

## Cold activation checks and ruled-out suspicion

The [Windows presenter source](https://raw.githubusercontent.com/electron/electron/v44.1.1/shell/browser/notifications/win/notification_presenter_win.cc) initializes the toast platform and starts activator registration. The [activator implementation](https://raw.githubusercontent.com/electron/electron/v44.1.1/shell/browser/notifications/win/windows_toast_activator.cc) handles unpackaged registration through app-specific shortcut/CLSID metadata, queues early activation until a handler exists, and parses unstructured launch arguments as click. Registration work is asynchronous; installed metadata must correspond to the current executable.

One suspicion was ruled out at source level: on a restart with no newly due reminder, runtime.recover→tick→runtimeValue still calls Notification.isSupported, which initializes the presenter. The current runtime is therefore not solely registering a JS callback without activating the native presenter. This is source-path evidence, not COM registration success.

Next exact installed checks, coordinated with the single desktop writer:
1. While the app is running and before any explicit exit, pair one newly due synthetic reminder's durable state with `ToastNotificationManager.History.GetHistory('Mashiro.Desktop')` metadata. Root's existing helper reads only tag/group/expiration and must not enumerate other apps or output XML/body.
2. Record the exact toast tag/group with app identity and final installed executable. Show/LastNotificationAddedTime alone cannot replace actual retained history. If absent, obtain a bounded app-specific native failed category/HRESULT or synthetic-only Electron diagnostic log; raw arbitrary user bodies must not enter general logs.
3. Confirm the exact app shortcut AUMID/ToastActivatorCLSID and that CLSID's LocalServer32 current executable, using read-only metadata. Do not broadly rewrite notification settings or registry.
4. After repaired clean exit, prove the same delivered toast remains; click it to cold-launch the installed executable, handle original persisted notification group, open current item/reminder UI and suppress duplicate activation. Reject stale, completed, cancelled, withdrawn and foreign identities. No new model call is necessary.

Remaining native metadata was not queried by this reviewer because the installer writer was updating the isolated scene. Current setting values and empty-center observations are root inputs, not independent desktop measurements. Official raw-source fetches for generic notification.cc/presenter.cc and API Markdown returned cache-miss errors; the successfully retrieved fixed-version Windows/API sources and installed type declarations support only the specific claims above.

No product edits, native notification, registry write, desktop interaction, Provider call, personal data, commit/push or release was performed. Root has assigned the minimal repair to the separate executor; independent repair verification follows its frozen candidate. PROGRAM ACTIVE.
