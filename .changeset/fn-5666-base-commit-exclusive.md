---
"@runfusion/fusion": patch
---

Fix per-task diff view incorrectly including a task's base commit when a done task lands as a no-op or its resolved merge SHA equals `baseCommitSha`.
