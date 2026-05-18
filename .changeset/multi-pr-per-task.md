---
"@runfusion/fusion": minor
---

Dashboard PR panel now supports tasks linked to multiple GitHub PRs. `Task.prInfos` is the new canonical list; `Task.prInfo` is preserved as the primary-PR mirror for back-compat. PR refresh, unlink, and self-healing conflict reclaim all operate per-PR.
