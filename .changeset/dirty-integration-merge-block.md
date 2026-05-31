---
"@runfusion/fusion": patch
---

Block AI merge finalization when the checked-out integration worktree is dirty instead of stashing local changes into the merge landing path by default, with an explicit Merge settings UI escape hatch for the legacy dirty-checkout sync behavior.
