---
"@runfusion/fusion": patch
---

Fix `fn_task_update` (and `fn_task_create`) silently failing with "Agent  not found" when callers pass an empty string or the literal string `"null"` to clear a task's agent assignment. Empty/whitespace strings and `"null"` are now normalized to a clear-assignment signal, matching the dashboard `PATCH /api/tasks/:id` contract. JSON `null` continues to work as before.
