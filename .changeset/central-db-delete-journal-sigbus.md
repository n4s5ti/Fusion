---
"@runfusion/fusion": patch
---

summary: Fix random fusion crashes when multiple dashboards/CLIs run on one host.
category: fix
dev: Central DB (~/.fusion/fusion-central.db) now uses journal_mode=DELETE instead of WAL. WAL coordinates concurrent processes via a memory-mapped `-shm` wal-index that SIGBUSes a reader (walIndexReadHdr / `cluster_pagein past EOF`) on macOS/APFS when another process resizes it mid-checkpoint, killing the node process with no JS stack. DELETE mode removes the `-shm` mmap surface and coordinates via POSIX locks (busy_timeout absorbs the added writer serialization). Per-project DBs (db.ts) are unchanged. See central-db.ts open() and central-db.test.ts regression.
