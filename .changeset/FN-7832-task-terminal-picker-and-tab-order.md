---
"@runfusion/fusion": patch
---

summary: Task Detail terminal now shows its worktree, is shorter on mobile, and sits with Cost after Comments.
category: feature
dev: TerminalModal defaults its workspace picker to the useWorkspaces entry matching `defaultCwd` (embedded task terminal only; footer terminal stays on Project Root). TaskDetailModal reorders the tab strip to Comments → Terminal → Cost and reduces the mobile min-height of `.detail-section--worktree-terminal`.
