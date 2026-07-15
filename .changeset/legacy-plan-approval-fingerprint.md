---
"@runfusion/fusion": patch
---

summary: Stop re-asking approval for plans approved before the Original Description update.
category: fix
dev: `approve-plan` fingerprints the on-disk PROMPT.md, so plans approved before the `## Original Description` hygiene injection (`applyOriginalDescription`) shipped carry a hash over pre-injection content. The injection then rewrote the prompt and moved the hash, defeating FN-7569's idempotency short-circuit and re-parking unchanged plans at `awaiting-approval`. `finalizeApprovedTask` now also compares the recorded fingerprint against the as-read (pre-injection) content — safe because `written` diverges from `writtenInput` only via that injection, so both arms hash bytes the operator actually approved — and migrates the stored fingerprint forward on a legacy match so the reconciliation is one-time per task. A genuinely changed plan matches neither arm and still parks.
