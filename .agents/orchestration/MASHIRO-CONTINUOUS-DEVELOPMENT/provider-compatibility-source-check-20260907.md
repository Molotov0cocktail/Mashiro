# Provider compatibility source check

2026-09-07 root preparation during012 independent review, for program B02/B04/B07 and Q4/Q9/Q11. No product code changed, no paid request, no new endpoint permission. Official documentation is DOCUMENTED evidence only.

## Current implementation boundary

ProviderService capabilities and ToolRepository historical expansion explicitly recognize glm-5.3-flash-tools-v1 / standard-non-preserved. Closed previous GLM turns discard reasoning_content while retaining tool messages; other adapter versions are rejected. This must not be generalized to another provider by merely adding a hostname/model to toolsSupported. Existing012 GLM qualification remains separate.

## Primary-source differences

- DeepSeek's current thinking guide requires reasoning_content from prior turns when tools are supplied, including assistant turns without a tool call. Without tools, past reasoning is not required. Its current examples expose thinking.type and reasoning_effort. This requires a distinct retained-protocol policy and permission-aware reconstruction, not GLM's closed-turn stripping. [Official thinking guide](https://api-docs.deepseek.com/guides/thinking_mode/).
- Alibaba's Chat Completions documentation places enable_thinking at the top level for direct HTTP. preserve_thinking and supported reasoning-effort values vary by model; some documented models default to retaining past reasoning. Model and hosting endpoint must therefore both select an explicit tested profile. The page's clear_thinking field is limited to listed GLM models, not a universal Qwen control. [Official API reference](https://help.aliyun.com/zh/model-studio/qwen-api-via-openai-chat-completions).
- Moonshot's official Kimi-K2.5 repository distinguishes official API thinking.type=disabled from third-party chat_template_kwargs.thinking=false, and points to K2 Thinking for interleaved tool use. Do not transfer either hosting profile blindly to another endpoint. The platform quickstart URL returned a browser internal error in this check; this is a source-fetch limitation, not a model capability failure. [Official Kimi-K2.5 usage](https://github.com/MoonshotAI/Kimi-K2.5).

## Required engineering follow-through

Keep finite trusted profiles, explicit adapter/mode evidence and role-specific availability. Test local ordinary/stream/tool/structured parsing, required reasoning retention across user turns, budget boundaries, changed recipient, revoked sources and selected history without importing unrelated context. If a protocol chain cannot be reconstructed legally, report the boundary or start an explicitly legal new segment; never fabricate missing reasoning. Unknown vendor strict/parallel/retained-thinking abilities remain unknown until qualified.

DeepSeek priority compatibility and Qwen/Kimi difference review remain in the existing total coverage, not silently deferred. The current authorized GLM endpoint supports the core product live paths already recorded. Request another endpoint/key only when a necessary specific qualification needs it; no new private data access and no blanket purchase/account gate. Recheck selected model documentation at implementation because these contracts can change. Final whole-product acceptance must distinguish DOCUMENTED, LOCAL_TESTED and LIVE_VERIFIED.
