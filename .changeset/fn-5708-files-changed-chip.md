---
"@runfusion/fusion": patch
---

Backfill done-task "N files changed" chips when mergeDetails enrichment arrives after the initial done websocket snapshot. Task cards now pass a done-mode merge enrichment signature into diff-stats invalidation so `/api/tasks/:id/diff` is re-fetched and authoritative lineage stats render without requiring a manual refresh.