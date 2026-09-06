# 010 original-item update live preparation

2026-09-07. The existing synthetic runner now has explicit --update mode; no new paid request has run at this checkpoint. It uses actual itemPrepareUpdateToolSchema and prepare_item_update, with a single selected original item. Local setup and confirmation are explicitly disclosed. The live phase is bounded to four requests, inherits product timeouts, checks the exact authorized endpoint/model, and uses process-only temporary credentials.

Checks: prepare produces one PENDING confirmation and zero pre-confirm changes/new proposals; recover returns the original target/version and complete replacement; only requested deadline/time zone/description change; repeated local confirmation yields the original ID and a single version increment; service reopen preserves the result and makes zero calls. The observer reports only allowlisted names/field types/counts, never argument bodies or secrets.

Zero-network --preflight returned LOCAL_PREFLIGHT_PASS, requestsAttempted=0, schemaAndGrantsInitialized=true, exit0. Node syntax and scoped ESLint both passed. Paid execution waits for the trusted owner to finish current source regression. Existing program totals remain33 requests/60355 known tokens plus3 earlier unknown usages; 010 totals20/49095. Historical run4 remains a distinct bundle-qualified core flow, not qualification of this new tool.
