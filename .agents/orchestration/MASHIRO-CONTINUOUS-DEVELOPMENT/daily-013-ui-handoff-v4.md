# 013 日常与运行 renderer 最终候选 v4 交接

daily-013-ui-manifest-v4.json 取代 v3。争议观察闭环保持不变：仅未接受 pending 观察可标为有争议，disputed 仍可接受、纠正或拒绝，已接受 Memory 继续只走记忆区影响确认。用户纠正后的观察性质现在明确显示“用户陈述”；模型推测和忠实摘要仍分别显示“推测”“忠实摘要”。

最终 executor 复验为 Daily 定向 6 files/15 tests、完整 renderer 36 files/148 tests、web TypeScript、scope lint、format 和 diff whitespace 全 0。root 独立 oracle 4项包含在通过套件中；最终资格仍由 root 依据 v4 精确清单判定。