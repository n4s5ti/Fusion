---
"@runfusion/fusion": patch
---

Speed up Agents API startup paths by batching task-column sanitization and agent run-status aggregation. This removes per-agent task hydration and per-agent recent-run scans from initial Agents view loading.
