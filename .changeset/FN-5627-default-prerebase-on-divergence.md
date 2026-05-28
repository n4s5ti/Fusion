---
"@runfusion/fusion": patch
---

fix(FN-5627): default auto-prerebase to fire when branch is >=1 commit behind integration

`decideAutoPrerebase()` previously defaulted `prerebaseDivergenceThreshold` to `0`, which meant the threshold path **never fired** unless the user explicitly set a positive value. Only hot-file matches could trigger prerebase.

The result: tasks whose branch was started against an older main tip (because other tasks landed concurrently) would skip prerebase, build their squash commit against the stale base, and then fail at the `git update-ref` step because the squash commit didn't descend from current main. The merger correctly detected this as a non-fast-forward advance and threw `IntegrationBranchConcurrentAdvanceError` — with both "expected" and "observed" SHAs set to the current main tip (because `observedCurrentSha` was captured from the pre-update rev-parse). This produced the misleading "expected X, observed X" same-SHA error signature that stranded FN-5632 stuck at `mergeRetries=3`.

New default: `prerebaseDivergenceThreshold = 1`. Any branch behind by at least 1 commit auto-rebases before squash. Users who want the legacy never-fire behavior can explicitly set `prerebaseDivergenceThreshold = 0`. Threshold comparison also changed from `>` to `>=` so an explicit threshold of N rebases at N+ commits behind instead of N+1+.

The self-healing classifier comment for `spurious-concurrent-advance-same-sha` is updated to reflect that the signature can come from either the pre-FN-5627 misclassification OR the legitimate post-FN-5627 non-fast-forward path; the auto-recovery sweep is unchanged because both cases self-heal cleanly once prerebase fires on the retry.

Tests:
- Default threshold (undefined) fires at 1 commit behind
- Explicit threshold = 0 stays as opt-out (never fire on commit-count)
- Default threshold doesn't fire when branch is up-to-date (commitsBehind=0)
