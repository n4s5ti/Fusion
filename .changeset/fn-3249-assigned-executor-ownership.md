---
"@runfusion/fusion": patch
---

Use durable assigned agents as active task execution owners when `assignedAgentId` targets a non-ephemeral agent, instead of always creating transient `executor-FN-*` task-worker agents.