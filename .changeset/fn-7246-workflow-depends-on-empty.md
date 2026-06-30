---
"@runfusion/fusion": patch
---

summary: Preserve explicit empty workflow step dependencies for parallel roots.
category: fix
dev: Keeps omitted dependsOn as previous-step fallback while treating [] as no dependencies.
