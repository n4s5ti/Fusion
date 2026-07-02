---
"@runfusion/fusion": patch
---

summary: Merges no longer fail when a task adds a dependency without updating the lockfile.
category: fix
dev: In merge-dependency-sync.ts, an inferred frozen install (pnpm/yarn/bun) that fails with an outdated-lockfile error now retries once non-frozen (pnpm gets explicit --no-frozen-lockfile) to regenerate the lockfile in the clean-room worktree, recomputing the install marker. Configured worktreeInitCommand keeps its authoritative frozen intent and still hard-fails. Surfaced via the merge:ai-deps-sync run-audit event (healed/healedCommand).
