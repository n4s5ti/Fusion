---
"@runfusion/fusion": patch
---

Closing/deleting the linked GitHub issue when deleting a tracked Fusion task now completes reliably even after the task is removed from the store, including observable success/failure signals and safe post-delete logging behavior.
