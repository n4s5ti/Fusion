---
"@runfusion/fusion": minor
---

summary: New projects now default AI merge to sync a dirty checked-out integration branch.
category: feature
dev: Flips DEFAULT_PROJECT_SETTINGS merger.allowDirtyLocalCheckoutSync from false to true; explicit persisted values still win, with no existing-project migration.
