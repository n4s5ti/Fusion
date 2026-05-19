---
"@runfusion/fusion": patch
---

Fix activity-log triple-write caused by multiple TaskStore instances polling the same SQLite DB. When the dashboard, engine runtime, and per-project stores each `watch()` the same database, every column move was previously recorded once per instance — inflating `task:moved` rows ~3x (146k+/day) and amplifying failure noise. TaskStore now suppresses activity-log writes for events re-emitted from its polling loop, leaving the originating instance as the sole audit writer.
