---
"@runfusion/fusion": patch
---

summary: Reviews stop failing on formatting: approvals pass, trailing-JSON verdicts parse, retries clear stale gate failures.
category: fix
dev: reviewer.ts adds shared `proseSignalsClearApproval` (approval prose with a revise/negated-approval guard), `extractJsonObjectCandidates` (string-aware balanced-brace scan, last-object preferred for prose→trailing-JSON), and `classifyReviewVerdictToken` (any APPROVE*/APPROVAL token → APPROVE). `extractVerdict` now prefers an explicit heading/line verdict over an incidental/example JSON object. Gate parser (`parseWorkflowStepVerdict`/`inferWorkflowStepVerdictFromProse`) shares the same logic. `executeWorkflowStep` retries the fallback model on malformed (not just timeout) and malformed gate output is a non-blocking advisory (relaxes FN-6582; genuine parsed REVISE still blocks). Retry paths clear prior terminal step failures (`clearTerminalWorkflowStepFailures`) only after the task leaves the mergeable in-review column (`clearTerminalStepFailuresForRetry` in the rerun bounce / resume path) to avoid an auto-merge race. Fail-closed merge/PR/mission-verification gates are unchanged.
