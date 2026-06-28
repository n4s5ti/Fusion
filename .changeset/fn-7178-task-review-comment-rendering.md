---
"@runfusion/fusion": minor
---

summary: Task detail Review tab now hides HTML comments and shows comment avatars, human/bot badges, and author-type filtering.
category: feature
dev: TaskReviewTab renders bodies via the shared sanitized MailboxMessageContent and a new app/utils/githubCommentAuthor helper for bot/avatar derivation.
