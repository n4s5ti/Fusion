---
"@runfusion/fusion": patch
---

fix(FN-4847): discard foreign branch and recreate on `branch-conflict-unrecoverable`

Branch conflicts where the existing `fusion/<task-id>` branch has stranded commits NOT attributed to the task (cross-task contamination residue from the FN-4781/FN-4804/FN-4814 worktree-race era) previously paused the task with `pausedReason: "branch-conflict-unrecoverable"` and the error message `Auto-recovery failed: branch conflict unrecoverable — Branch fusion/fn-XXX is already checked out at /.../ (tip ..., N stranded commits since ...)`. The task got stuck forever waiting for human adjudication.

The user has explicitly opted into discard-and-recreate for this case: those stranded commits aren't this task's work, just delete them and move on.

Changes:

- `auto-recovery.ts:actionForMode` — in `deterministic-only` mode, `branch-conflict-unrecoverable` now returns `"retry"` (was `"pause"`), routing the failure to the handler instead of the pause path.
- `auto-recovery-handlers/branch-worktree.ts` — `live-foreign` inspection no longer emits `irreducible-pause`. Instead: force-delete the foreign branch + worktree (safely respecting the FN-4811 active-session gate to avoid yanking live sessions), then requeue the task. The executor's next pickup creates a fresh `fusion/<task-id>` worktree with no conflict.
- New audit event `branch-worktree:foreign-branch-discarded` records the discard with stranded-commit count and live-ownership status.
