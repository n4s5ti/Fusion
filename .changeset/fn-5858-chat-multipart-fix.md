---
"@runfusion/fusion": patch
---

Fix chat message sends with file attachments by parsing multipart form bodies on the chat messages SSE endpoint.

Uploaded message attachments are now validated, persisted to the session attachment directory, converted into chat attachment metadata, and forwarded to the chat manager while JSON-only message sends continue to work unchanged.
