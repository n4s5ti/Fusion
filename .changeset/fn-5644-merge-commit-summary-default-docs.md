---
"@runfusion/fusion": patch
---

Update `useAiMergeCommitSummary` docs/JSDoc to match the intended default of `true`, including that merge commit summaries include a subject plus body summary (narrative + bullets + diff-stat).

Also fixes AI merge-mode prompt guidance so AI-authored squash commits include a summarized body instead of subject-only commit messages.