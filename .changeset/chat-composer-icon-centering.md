---
"@runfusion/fusion": patch
---

summary: Center the Chat composer attach and model icons with the message input box.
category: fix
dev: ChatView.css sizes .chat-attach-btn and .chat-thinking-level-root to --chat-input-control-size so they center with the single-line input across desktop/tablet/mobile while staying bottom-aligned when multi-line (FN-7917).
