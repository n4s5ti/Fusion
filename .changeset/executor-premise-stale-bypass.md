---
"@runfusion/fusion": patch
---

fix(executor): exempt `PREMISE STALE:` summaries from `summary-claims-incomplete` refusals

The preflight escape hatch added in the prior commit instructs the agent to call `fn_task_done` with a summary that begins `PREMISE STALE:` when reproduction shows HEAD already matches the desired state. Natural premise-stale wording such as *"PREMISE STALE: the task has no remaining work — implementation is already done on HEAD"* tripped `evaluateTaskDoneRefusal`'s scoped-incomplete regex (`/\b(incomplete|not implemented|not done|not finished)\b/i`) when the 40-char window contained `the task`/`this task`/first-person pronouns, refusing `fn_task_done` and deadlocking the executor — the exact failure the escape hatch was meant to prevent.

Add a sentinel bypass: when `summary` starts (case-insensitive) with `PREMISE STALE:`, skip the dissent-pattern and scoped-incomplete summary checks. The `pending-code-review-revise` and `bulk-step-completion-without-review` guards still run unchanged, so the bypass cannot dodge real review obligations or unfinished work — only the summary-phrasing checks are relaxed.
