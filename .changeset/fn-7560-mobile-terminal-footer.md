---
"@runfusion/fusion": patch
---

summary: Move the mobile terminal controls into a bottom footer so they no longer crowd the header, and keep the shortcut key bar horizontally scrollable.
category: fix
dev: On the ≤768px terminal, the `.terminal-actions` cluster now renders in a `terminal-footer-actions` bar (with `min-width:0; overflow-x:auto`) instead of the header; desktop/floating/pinned-below keep the FN-7502 header layout. Preserves the FN-7550 shortcut-panel scroll fix.
