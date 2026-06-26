---
"@runfusion/fusion": minor
---

summary: Add an optional built-in "Code Review" pre-merge step to the coding workflows.
category: feature
dev: New `code-review` WORKFLOW_STEP_TEMPLATE (toolMode readonly, gateMode advisory, phase pre-merge) plus a default-OFF `optional-group` node (group id `code-review`, inner `code-review-step`) wired into the built-in coding + stepwise coding workflows next to browser-verification. Opt-in via task `enabledWorkflowSteps`; reuses the shared prompt-gate verdict machinery (no engine verification code).
