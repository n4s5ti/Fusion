---
"@runfusion/fusion": patch
---

summary: Fix "Request revision" error on reviewer-agent task reviews.
category: fix
dev: review/address now validates selected items against the same canonical review source the UI renders (buildDirectTaskReviewData / getPrReviewDetails) instead of the persisted reviewState.items.
