# 010 actual Provider role verification

2026-09-07: SUPPORTED for the bounded flow below, not independent product acceptance or PROGRAM_DONE.

[Raw run 4](items-010-live-run-4.json), SHA256 `A190ED422ACDCEAE1DA08E1B32722B5326D46E740ED9C8D5D4800C814EC08358`; actual service bundle SHA256 `4c70d4618659c2bb26883684bb46836dd75b25dcf952a457faccff7296bf5e62`. Endpoint https://open.bigmodel.cn/api/paas/v4, model GLM-5.3-FLASH. Root executed actual bundled ProviderService/AssistantService against isolated synthetic data with process-only credentials.

- Natural explicit creation committed an item before the actual Provider continuation.
- Closing/reopening services caused zero requests. A new context-none round retrieved the random item marker via search_items and answered correctly; the initial request did not contain that marker in tool results.
- Model inference created a proposal without increasing formal items. Discussion revised the same proposal ID with an increased version.
- Local API acceptance repeated with the same command produced exactly one accepted formal object, checked through acceptedItemId/originProposalId.
- Natural completion changed the original item to completed. Final formal count was two. All six recorded business/search operations succeeded.

Nine actual requests, all usage available, 22,923 total tokens. Phase totals: create 2,463; recall 4,850; propose 7,667; discuss 5,519; complete 2,424. Including three earlier diagnostic runs, 010 totals are 20 requests and 49,095 known tokens. Program totals are 33 requests and 60,355 known tokens, with three earlier usages unknown; historical task003 calls remain separately recorded.

Disclosures: rendererDriven=false; processRestart=false; serviceReopened=true; acceptanceViaLocalApi=true. This is not packaged/installer or actual UI qualification. Observer incomplete flags are preserved; 505 reasoning characters do not qualify exact reasoning continuation. Credentials were not persisted, bodies were not logged, the successful synthetic root was removed by the runner, and the process credential environment was cleared. Earlier failed synthetic fixtures and [diagnosis](items-010-live-failure-diagnosis.md) remain historical evidence.

Remaining 010 work includes stable preview receipt recovery, conversational deletion/link-removal confirmation, final Electron checks and independent review. Changes after this bundle require proportionate assessment; this report does not confer PASS on later source edits.
