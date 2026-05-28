---
"@runfusion/fusion": patch
---

fix(FN-5627): close TOCTOU window between merger optimistic `mergeConfirmed: true` write and integration ref advance, add reachability gate on auto-merge fast-path

The merger previously persisted `mergeConfirmed: true` + `commitSha` to the task row as soon as the local squash commit was built, **before** running `git update-ref refs/heads/<integration>` to actually advance the integration branch. If the ref-advance then failed for any reason (lock contention, hook rejection, packed-refs race, or a misclassified non-CAS error via the `merger-ref-update-advance.ts` string heuristic), the task row was poisoned: the auto-merge scheduler's `mergeConfirmed` fast-path would silently promote the never-landed work to `done` on the next tick, including emitting `task:merged` and closing the GitHub tracking issue.

This affected at least 9 tasks across 2026-05-27/28 (FN-5596, FN-5597, FN-5599, FN-5612, FN-5613, FN-5614, FN-5616, FN-5623, FN-5625) — the merger silently dropped real work and marked the tasks complete.

The fix has three layers:

1. **merger.ts** — In `reuseTaskWorktreeMerge` mode, persist `mergeConfirmed: false` initially. Promote to `true` only after `advanceIntegrationBranchRef` returns `advanced: true`. Other merge paths (legacy in-place merge, verified no-op fast-paths, owned-commit recovery) are unchanged because they advance the ref before this point.

2. **project-engine.ts** — Defense-in-depth reachability gate on the auto-merge "merge already confirmed" fast-path. Before `moveTask(taskId, "done")`, verify `git merge-base --is-ancestor <commitSha> <integrationBranch>` succeeds. On failure, clear `mergeConfirmed`, mark task `status: "failed"`, leave in `in-review`, and emit `merger:fast-path-blocked-foreign-commit` run-audit event. Legitimate no-op merges (no `commitSha`) bypass the gate.

3. **merger-ref-update-advance.ts** — Replace the fragile string heuristic that classified update-ref failures as `concurrent-advance` (matching `"is at"` / `"expected"` / `"cannot lock ref"` in error text) with structured detection. After update-ref fails, re-read the ref: if observed equals expected, classify as `ref-update-refused` (no actual race occurred). Eliminates the misleading "expected X observed X" same-SHA log signature seen on FN-5625.
