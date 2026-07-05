---
"@runfusion/fusion": patch
---

summary: Fix tasks vanishing from the board after being added to a workflow like Coding (Ideas).
category: fix
dev: Board.tsx forces a board-workflows refetch (deferred one tick, signature-guarded) whenever a rendered task is missing from the taskWorkflowIds map, so its real workflow and intake column resolve regardless of which create surface added it; the single-workflow grouping also re-homes a task whose column its workflow no longer declares into the intake lane instead of dropping it. Fixes the FN-7591 regression where intake-column cards (column "ideas") fell back to the default workflow, which has no such column, and were filtered out until a manual reload.
