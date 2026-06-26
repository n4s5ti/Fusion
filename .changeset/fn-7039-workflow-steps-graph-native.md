---
"@runfusion/fusion": minor
---

summary: Enabled optional workflow steps now run and show in task progress reliably.
category: feature
dev: Fixes FN-7039. `Store.optionalGroupIdSet` falls back to `builtin:coding` (matching the executor's unselected-task resolution) so a toggled built-in group id (e.g. `browser-verification`) is no longer materialized into a legacy `WS-xxx` step row the graph never matches. Create-time optional-step controls (QuickEntryBox, TaskForm) resolve `builtin:coding` when no project default workflow is set, so the toggles appear. First unit of the broader graph-native workflow-step refactor.
