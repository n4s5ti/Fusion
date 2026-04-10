---
"@gsxdsm/fusion": patch
---

Harden CLI semaphore boundaries to task lanes only

This change makes the concurrency semaphore boundary explicit in the CLI bootstrap code (`runDashboard` and `runServe`):

**Task-lane components (semaphore-governed):**
- `TriageProcessor` — specification agents
- `TaskExecutor` — execution agents
- `Scheduler` — task coordination
- `onMerge` — merge execution (via `semaphore.run()`)

**Utility workflows (NOT semaphore-governed):**
- `HeartbeatMonitor` — lightweight heartbeat sessions
- `HeartbeatTriggerScheduler` — trigger scheduling
- `CronRunner` (via `createAiPromptExecutor`) — scheduled automation
- Model sync, auth setup, plugin loading — bootstrap workflows

This boundary prevents utility workflows from being blocked by task-lane saturation and ensures utility work is always available regardless of `maxConcurrent` settings.

Added regression tests to lock this boundary and prevent future regressions.
