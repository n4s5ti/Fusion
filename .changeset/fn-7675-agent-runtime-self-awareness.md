---
"@runfusion/fusion": minor
---

summary: Agents now know they run inside Fusion and won't plan actions across a platform shutdown.
category: fix
dev: Adds a shared runtime self-awareness + capability-grounding preamble (packages/core/src/agent-prompts.ts, FUSION_RUNTIME_SELF_AWARENESS) prepended to the chat, heartbeat, and executor base prompts' stable layer.
