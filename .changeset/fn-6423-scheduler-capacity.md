---
"@runfusion/fusion": patch
---

Fix scheduler concurrency diagnostics and semaphore slot accounting so queued tasks are not held behind contradictory or negative capacity readings.
