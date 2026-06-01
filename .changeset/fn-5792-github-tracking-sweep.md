---
"@runfusion/fusion": patch
---

Fix GitHub tracking reconciliation for soft-deleted and archived tasks by adding a periodic 15-minute sweep, paginating archive/deleted candidate scans, and correcting done-task filtering to use the task column.