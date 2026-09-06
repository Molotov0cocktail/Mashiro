# 010 original-item update actual Provider verification

2026-09-07: SUPPORTED for the bounded actual service flow. Not independent whole-product, renderer or packaged acceptance.

[Raw run5](items-010-live-update-run-5.json) SHA256 7C9935AF0848490C7EEE68D94A0310C1FF8341680D0955CCF7979B2AC0D6FDDE. Actual bundle SHA256 016fe228e0105419aa0e1ea595222395766a8a77293c5633102442cc81c3dcbe. Endpoint https://open.bigmodel.cn/api/paas/v4, GLM-5.3-FLASH.

The fixture locally seeded one formal item, selected its exact ID/version and asked the real model to prepare a deadline/time-zone/description change while preserving other fields. Actual prepare_item_update arguments passed the strict product schema, the tool returned PENDING_CONFIRMATION and the model continued with the tool result. Before local confirmation, the item content/version remained unchanged and no proposal/new item existed. Recovery returned the original target/version and complete replacement. All unrequested fields were equal. Repeated local confirmation preserved the original ID and increased its version only once. Closing/reopening services retained the exact result with zero calls.

Two requests, both usage available: 3,670 + 3,907 = 7,577 tokens (input7,262/output315). Final formal count1/proposal count0. 010 cumulative22 requests/56,672 known tokens; program35 requests/67,932 known tokens plus3 earlier unknown usages. Historical003 remains separately documented. No unchanged full nine-request chain was repeated.

The first process launch did not occur because automatic permission review timed out before CreateProcess. The tool explicitly allowed one retry; that retry started the successful run. The timeout is not counted as a Provider call and did not establish an unsafe-action rejection.

Disclosures: seed/confirmation via local API; rendererDriven=false; processRestart=false; serviceReopened=true. Observer incomplete flags remain true, and no exact reasoning continuation qualification is claimed. Credentials were process-only and cleared in finally; the successful synthetic root was removed. Raw result key-shape scan found0 matches. The exact archived oracle ESLint exclusion preserves immutable evidence bytes and does not exclude actual src/tests. Current unrelated retained-source repair still needs independent qualification; this live result does not grant later candidate PASS.
