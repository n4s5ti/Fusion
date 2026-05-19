---
"@runfusion/fusion": patch
---

Treat in-review as terminal-until-merged when autoMerge is disabled. All lifecycle-mutating self-healing sweeps now short-circuit on autoMerge=false so PR-based review tasks are no longer kicked back to todo, marked failed, or re-finalized by recovery loops.
