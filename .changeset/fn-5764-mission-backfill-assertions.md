---
"@runfusion/fusion": minor
---

Expose mission assertion backfill through operator-facing surfaces.

- Added dashboard API route `POST /api/missions/:missionId/backfill-assertions` with dry-run default and `MissionAssertionBackfillReport` response.
- Added agent/CLI tool `fn_mission_backfill_assertions` for dry-run/apply remediation of FN-5696 legacy zero-assertion features.
- Updated mission operator docs and synced fusion skill/tool reference docs.