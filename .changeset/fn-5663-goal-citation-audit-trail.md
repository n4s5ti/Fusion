---
"@runfusion/fusion": minor
---

Add a goal-citation audit trail to support Slice 2 anchoring success-signal measurement.

- Introduce a persisted `goal_citations` table (schema v93) with deduplication on `(goalId, surface, sourceRef)`.
- Record citations from `agent_log` and `task_document` write seams.
- Extract goal IDs using `GOAL_ID_PATTERN` (`/\bG-[0-9A-Z]+(?:-[0-9A-Z]+)*\b/g`) and store bounded snippets (max 200 chars).
- Add `fn goals citations` with filters: `--goal`, `--agent`, `--surface`, `--since`, `--until`, `--limit`, and `--json`.
