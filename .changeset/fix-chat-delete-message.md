---
"@gsxdsm/fusion": patch
---

Fix DELETE /api/chat/sessions/:id/messages/:messageId to actually delete the message from the database instead of returning success without any action.
