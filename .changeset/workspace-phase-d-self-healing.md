---
"@runfusion/fusion": minor
---

Workspace mode Phase D (U1): workspace-aware self-healing. The existing merging-status reconcilers no longer mis-finalize a partial-landed workspace task (recoverInterruptedMergingTasks now clears the transient `merging` status and re-enqueues the idempotent per-repo land instead of running the single-commit finalize over the non-git workspace root), and recoverMergeableReviewTasks now admits workspace tasks (task.worktree is null). Adds three reconcilers: partial-land recovery (re-enqueue via enqueueMerge, FORK-A unrecoverable → park failed; guarded by autoMerge:false + user-pause + workspace-aware liveness), phantom `workspace-repo-land` lease reclaim (new `entriesByKind` registry seam), and per-repo worktree cleanup from stored paths (no temp walk). New run-audit events: `task:reconcile-workspace-partial-land`(`-no-action`), `task:reclaim-phantom-workspace-land-lease`, `task:reconcile-orphaned-workspace-worktree`.
