---
"@runfusion/fusion": patch
---

Lease recovery is now central-claim-aware: `MeshLeaseManager.recoverAbandonedLease`
releases the central claim before clearing local task-row lease fields, and
reconciles split-brain state via `reconcileLeaseRow` on the next scheduler /
self-healing tick. Owner-offline handoff policy and progress-preserving handoff
semantics are unchanged. Single-node deployments (no central claim store) keep
the existing local-only behavior. (FN-4823, FN-4819 §2.5 / §3.3 / §3.6)
