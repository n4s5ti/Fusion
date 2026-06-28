---
"@runfusion/fusion": patch
---

summary: Stuck triage re-queues now resume from the drafted plan instead of restarting planning from scratch.
category: fix
dev: triage.ts stuck-abort paths seed buildSpecificationPrompt with the on-disk PROMPT.md draft, or a non-empty plan task document when PROMPT.md is absent, and bound consecutive triage stuck-retries by settings.maxStuckKills before escalating to failed/paused.
