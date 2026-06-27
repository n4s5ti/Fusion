---
"@runfusion/fusion": patch
---

summary: Mutating agent tools now obey each agent's permission policy instead of always being allowed.
category: security
dev: Classifies fn_workflow_*, fn_task_update/promote/refine, fn_run_verification, fn_acquire_repo_worktree, and fn_research_cancel in shared gating classifications so both the action gate and permanent-agent gating govern them; closes the unrecognized-tool exempt→allow fall-through. Parity tests lock the decisions.
