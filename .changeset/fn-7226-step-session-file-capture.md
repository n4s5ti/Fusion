---
"@runfusion/fusion": patch
---

summary: Preserve files changed by workflow-owned parallel step sessions on task branches.
category: fix
dev: Step-session cherry-pick now uses merge-base ranges and skips empty cherry-picks instead of dropping real step commits.
