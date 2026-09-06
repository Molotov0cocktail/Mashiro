# Provider capability probe v1

## Status

`LIVE QUALIFICATION COMPLETE / TOOL + JSON PASS / TOOL REASONING NOT OBSERVED`

This is an isolated qualification probe for the existing synthetic BigModel endpoint and `GLM-5.3-FLASH`. It does not change Mashiro product transport behavior and is not a product Reviewer PASS.

## Question and acceptance

With exactly three paid synthetic requests, determine whether the declared endpoint/model supports:

1. streaming tool-call argument aggregation;
2. strict trusted validation and one deterministic local no-side-effect tool execution;
3. returning the complete assistant tool call, matching tool result, and unmodified `reasoning_content` so the model continues to a final answer;
4. a separate `response_format={"type":"json_object"}` summary that also passes strict local shape/value validation;
5. per-call usage observation without treating missing fields as zero.

The first two HTTP requests form one tool loop. The third request is the independent structured-output role probe. Ordinary and streaming text alone are not repeated because task 003 already qualified them.

## Official protocol basis checked on 2026-09-06

Primary sources:

- `https://docs.bigmodel.cn/cn/guide/models/vlm/glm-5.3-flash`
- `https://docs.bigmodel.cn/api-reference/模型-api/对话补全`
- `https://docs.bigmodel.cn/cn/guide/capabilities/thinking`
- `https://docs.bigmodel.cn/cn/guide/capabilities/thinking-mode.md`
- `https://docs.bigmodel.cn/cn/guide/capabilities/function-calling.md`
- `https://docs.bigmodel.cn/cn/guide/capabilities/stream-tool`
- `https://docs.bigmodel.cn/cn/guide/capabilities/struct-output`
- `https://docs.bigmodel.cn/cn/guide/start/migrate-to-glm-new.md`

Relevant current statements were read from the complete official pages rather than inferred from search snippets:

- Model code is `glm-5.3-flash`; text parameters match GLM-5.3.
- `thinking.type` must be `enabled`; GLM-5.3/Flash only accept `reasoning_effort` values `low`, `high`, or `max`.
- For the standard API, `thinking.clear_thinking=false` enables preserved thinking. Interleaved tool use requires returning the complete, unmodified `reasoning_content` with the assistant tool-call message.
- Streaming tool arguments require both `stream=true` and `tool_stream=true`; applications must aggregate `delta.tool_calls[*].function.arguments`, execute the tool themselves, append `role=tool` with the matching `tool_call_id`, and invoke the model again.
- Function `tool_choice` currently defaults to and only supports `auto`.
- Structured JSON uses `response_format={"type":"json_object"}`. The expected fields still need application-side validation; the probe therefore performs an exact local check.
- The model page recommends `temperature=1`, `top_p=0.95`, `reasoning_effort=max`, and `clear_thinking=false`. This low-cost qualification deliberately uses the separately documented and historically successful `reasoning_effort=low`, does not set both sampling controls, and caps every response at 1024 tokens.

## Probe implementation

Script: `scripts/provider-capability-probe.mjs`

Properties:

- Native Node 24 `fetch`; no dependency or lockfile change.
- Fixed HTTPS recipient `open.bigmodel.cn`, fixed `/api/paas/v4/chat/completions` path, redirects rejected, no retry.
- Fixed `GLM-5.3-FLASH`, `thinking.enabled`, `reasoning_effort=low`, one 90-second AbortController covering response headers plus the complete body, a 2 MB response byte bound, and bounded content/reasoning/tool arguments.
- The only executable tool is `lookup_synthetic_inventory`. It reads a deterministic in-memory object after exact key, type, enum, value, and `additionalProperties=false` validation. It performs no filesystem, SQL, network, shell, OS, or external business action.
- A long exact synthetic nonce increases the chance that live `tool_stream` produces multiple argument fragments. The report distinguishes the aggregation algorithm passing from whether multiple fragments were actually observed.
- If the assistant returns non-empty first-turn reasoning, it is retained only in memory and passed back unchanged; when the field is absent or empty, the probe does not invent it. Reasoning observation is reported separately from the tool-loop verdict. Prompts, response bodies, tool arguments, tool result and reasoning are never emitted.
- Output contains only status, counts, booleans, lengths, SHA-256 of synthetic final bodies, normalized usage, HTTP status/provider code on failure, and fixed endpoint/model identifiers.
- There are no paid retries. A failed request terminates the probe with a sanitized first bad state.

## Credential interface

Preferred live invocation uses a one-command process environment variable:

```powershell
$env:MASHIRO_PROVIDER_TEST_KEY = <provided secret for this process>
node scripts/provider-capability-probe.mjs --run
Remove-Item Env:MASHIRO_PROVIDER_TEST_KEY
```

The script deletes its process copy immediately after loading it. It also supports `MASHIRO_PROVIDER_TEST_KEY_FILE` for a caller-designated absolute external file. Both sources at once are rejected. A file inside the repository, a symlink, oversized content, whitespace-bearing Key, or missing source is rejected without printing the path or contents. The Explorer will not search for a credential.

Before a credential is supplied, the safe local check is:

```text
node scripts/provider-capability-probe.mjs --self-check
```

## Planned result fields

- `requestsAttempted` must equal 3 for PASS.
- Tool call count and trusted execution count must each equal 1.
- Tool name, complete parsed arguments, tool result, continuation finish reason, and final synthetic markers must pass exact checks internally; their bodies are not printed.
- `argumentFragments` and `fragmentedArgumentsObserved` state whether live fragmentation was actually seen.
- First and continuation reasoning are represented only by presence, character count, and fragment count; reasoning text is not printed or hashed.
- Final answer and structured JSON are represented by length, SHA-256, marker/schema verdicts, and usage, never body text.

## Live attempt ledger

### Attempt 1 — original probe version 1

The Prompter ran exact script SHA-256 `E9E0B05B017F51CC4CB554933286551794B187181C850C65D83C620938BC8074` with the user-provided Key in one process environment. Exit was `1` after exactly one paid synthetic HTTP request:

```json
{"probeVersion":1,"outcome":"FAIL","endpointHost":"open.bigmodel.cn","model":"GLM-5.3-FLASH","stage":"tool-request","requestsAttempted":1,"failure":{"category":"tool-reasoning-missing"}}
```

The successful streaming response had already passed the `finish_reason=tool_calls` and exactly-one-tool-call assertions. The old oracle then required non-empty `reasoning_content` before validating the call ID, name or complete arguments. Therefore this attempt proves only that the model reached one tool-call response with no observed reasoning text. It does not prove argument validity, argument fragmentation, usage, tool execution, result return, continued answer or structured output. Usage and shape counts were not emitted by version 1 and must remain unknown. No tool was executed and no second or third request occurred.

Route assessment: official examples collect `reasoning_content` only when the field is present and non-empty. The official interleaved-thinking rule requires complete unmodified reasoning to be returned when it exists; it does not state that every direct tool decision must contain non-empty reasoning. Binding the tool capability verdict to mandatory non-empty reasoning was therefore an invalid local oracle. It has been removed. Revised version 2 conditionally returns observed reasoning unchanged and records `OBSERVED`/`NOT_OBSERVED` separately. It also saves sanitized finish/tool/fragment/reasoning/usage counts before later assertions so future failures retain available evidence.

This is a materially repaired route, not a blind retry. Completing the originally intended tool loop and structured role now needs three new requests, making four project calls including the stopped first attempt. If version 2 again observes no first-turn reasoning, the tool/structured capabilities may still qualify, while live preserved-thinking remains `NOT_OBSERVED` and requires a separate appropriate reasoning-continuity probe before it can be called live verified.

### Attempt 2 — repaired probe version 2

The Prompter ran exact script SHA-256 `3AB54FBA190C0F22A46CBE0A4AC772C8069ABE9182C78D5F1D6FE916324F7954` with the Key held only in the one command's process environment. Exit was `0` after exactly three new paid synthetic requests. The equivalent complete sanitized stdout was:

```json
{
  "probeVersion": 2,
  "outcome": "PASS",
  "endpointHost": "open.bigmodel.cn",
  "model": "GLM-5.3-FLASH",
  "credentialSource": "environment",
  "requestsAttempted": 3,
  "toolLoop": {
    "toolCalls": 1,
    "argumentFragments": 54,
    "fragmentedArgumentsObserved": true,
    "firstReasoningPresent": false,
    "firstReasoningChars": 0,
    "firstReasoningFragments": 0,
    "trustedExecutions": 1,
    "continuationReasoningPresent": false,
    "continuationReasoningChars": 0,
    "finalAnswerChars": 89,
    "finalAnswerSha256": "80BD5BD00316E873B3885339CE614E8B57AF921B3C4A4189554D7CD8938A04C1",
    "finalMarkers": {
      "itemCode": true,
      "availability": true,
      "quantity": true,
      "reserved": true
    },
    "firstUsage": {
      "promptTokens": 303,
      "completionTokens": 66,
      "totalTokens": 369,
      "cachedPromptTokens": 0,
      "reasoningTokens": 0
    },
    "continuationUsage": {
      "promptTokens": 406,
      "completionTokens": 32,
      "totalTokens": 438,
      "cachedPromptTokens": 0,
      "reasoningTokens": 0
    }
  },
  "structuredOutput": {
    "locallyValidated": true,
    "responseChars": 111,
    "responseSha256": "E341F0599F596CC18F3AD592F36B94F7327A90EF559018EC0948C47A42893A1B",
    "reasoningPresent": true,
    "reasoningChars": 91,
    "usage": {
      "promptTokens": 120,
      "completionTokens": 67,
      "totalTokens": 187,
      "cachedPromptTokens": 0,
      "reasoningTokens": 18
    }
  },
  "disclosure": {
    "requestBodiesLogged": false,
    "responseBodiesLogged": false,
    "toolArgumentsLogged": false,
    "toolResultLogged": false,
    "reasoningLogged": false,
    "credentialLogged": false
  }
}
```

The environment variable was removed by the caller's `finally` cleanup and disappeared with the process. No Key was placed in a file, repository, report or ordinary log.

## Capability verdicts

| Capability | Verdict | Direct evidence |
| --- | --- | --- |
| Streaming function call and complete argument aggregation | `LIVE_VERIFIED` for this endpoint/model | One call, 54 argument fragments, one complete tool call, strict exact argument validation passed |
| Trusted no-side-effect execution | `LOCAL_EXECUTED_WITH_LIVE_INTENT` | Exactly one deterministic in-memory tool execution after live arguments passed trusted validation |
| Tool result return and continued answer | `LIVE_VERIFIED` for this endpoint/model | Matching call/result relationship accepted; second request finished normally; all four synthetic answer markers passed |
| JSON object structured role | `LIVE_VERIFIED + LOCAL_STRICT_VALIDATION` | `response_format=json_object` returned parseable JSON whose exact keys, types and values passed local validation |
| Usage | `LIVE_OBSERVED` | Version 2 returned 829 prompt, 165 completion and 994 total tokens across three calls; cached prompt tokens 0; reported reasoning tokens 18 on the structured call |
| Thinking response field | `LIVE_OBSERVED` on the independent structured call | 91 reasoning characters and 18 reasoning tokens; content was not logged |
| Interleaved/preserved reasoning through the tool loop | `NOT_OBSERVED` | First tool call and continuation both returned zero reasoning characters/tokens, so there was no non-empty field to preserve |

## Current evidence and NOT RUN

- Official protocol pages: read and summarized above.
- Current script version 2 SHA-256: `3AB54FBA190C0F22A46CBE0A4AC772C8069ABE9182C78D5F1D6FE916324F7954`. Node syntax, zero-network self-check, Prettier and ESLint passed. The self-check proves a successful response header followed by a hanging body is aborted and classified as `timeout`; missing/conflicting/in-repository credential oracles exit 1 with zero requests and only fixed metadata/categories.
- Paid live calls across both attempts: `4`. Version 2 usage totals 994 tokens. Attempt 1 usage was not captured and remains unknown; it must not be counted as zero.
- Tool call, fragmented argument aggregation, strict local execution, tool-result continuation, final answer and `json_object` output all passed for the fixed endpoint/model and synthetic data.
- Interleaved/preserved reasoning remains unqualified because neither tool-loop response contained reasoning. The structured request proves reasoning can appear, not that tool-loop reasoning can be returned unchanged.
- Product transport integration, actual operation identity/recovery, cancellation, parallel tools, strict vendor-side JSON Schema, other providers/models, personal data and real business side effects remain NOT RUN. This Explorer result does not claim product implementation or overall feature PASS.
