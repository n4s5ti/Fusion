---
"@runfusion/fusion": minor
---

summary: Imported GitHub issues are now linked as tracked tasks when GitHub tracking is on.
category: feature
dev: At import (CLI tools, `fn task import`, dashboard routes) the created task is set `githubTracking.enabled` when `resolveTaskGithubTracking` resolves enabled; the post-create hook adopts the source issue (source_issue_linked) so no duplicate tracking issue is opened.
