---
"@fusion/engine": patch
---

Fix scheduler overlap deferral starvation by considering only runnable queued todo tasks as higher-priority overlap competitors. Dependency-blocked queued tasks now keep their unmet-dependency queue state without reserving overlapping files from ready work, while active in-progress and eligible in-review tasks continue to hold explicit file-scope leases. Dispatch logs now distinguish unmet dependencies, active file-scope lease blocking, and higher-priority runnable queued-task deferral.
