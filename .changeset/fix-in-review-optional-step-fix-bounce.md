---
"@runfusion/fusion": patch
---

summary: Fix tasks getting stuck in review forever after a pre-merge code-review revision.
category: fix
dev: performWorkflowRerunBounce now bounces an `in-review` task back to in-progress like `in-progress`/`todo`, instead of throwing "cannot bounce to in-progress". A pre-merge optional-step REVISE reopens the last plan step and schedules the bounce, but a completion race could land the task in-review first, stranding it with a pending step that the merge gate blocks on while self-healing only re-ran the graph. Regression covered in executor-step-session.test.ts (FN-7122).
