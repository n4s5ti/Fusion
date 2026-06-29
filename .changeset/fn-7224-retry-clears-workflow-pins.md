---
"@runfusion/fusion": patch
---

summary: Make dashboard retry clear stale workflow step pins before re-execution.
category: fix
dev: Clears persisted workflow step instances on manual execution retry so parse-steps can repin the current plan.
