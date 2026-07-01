---
"@runfusion/fusion": patch
---

summary: Enforce maxWorktrees as a hard cap on active execution worktrees.
category: fix
dev: TaskStore rejects allocated in-progress moves once active holders reach maxWorktrees, independent of maxConcurrent.
