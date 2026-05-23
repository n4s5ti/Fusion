---
"@fusion/engine": patch
---

fix(engine): treat foreign-attributed commits already on main as promoted

`assertCleanBranchAtBase` flagged any commit in `baseSha..branchName`
whose `Fusion-Task-Id` trailer pointed at a different task as
contamination. That misclassified the FN-5475 cascade: the engine
fast-forwards local `main` with single-parent task commits, and any
worktree created during the brief window where local `main` carried a
sibling task's tip inherited that commit. The audit later (correctly)
saw the commit as not-yet-on-main from its merge-base perspective and
threw `BranchCrossContaminationError`.

The audit now skips foreign-attributed commits that are reachable from
local `main` (`git merge-base --is-ancestor <sha> main`). Commits on
main were promoted through integration regardless of whose trailer
they carry, and downstream branches that inherited them via main are
not contaminated.

Resume verifier (FN-5475 fix #2) and the auto-recovery handler
fallback (FN-5475 fix #3) remain in place as defense-in-depth for
the rarer variants (local main rewound, foreign commit not yet on
main when the audit fires).
