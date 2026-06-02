---
"@runfusion/fusion": minor
---

Add self-healing recovery for stale mission validator runs that are left in `running` after their owning execution disappears.

Stale validator runs are now reaped to the existing terminal `error` status (rather than introducing a new `cancelled` status), the reap reason is stored in the run summary, active mission features are moved back to `needs_fix` so validation can re-trigger, and startup/maintenance sweeps emit `mission:validator-run-reaped` audit events for recovered rows.
