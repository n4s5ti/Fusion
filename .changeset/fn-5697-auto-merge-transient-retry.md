---
"@runfusion/fusion": patch
---

Auto-merge now treats transient provider/network failures during merge (for example "This operation was aborted", "socket hang up", and provider `server_error` payloads) as bounded retryable errors instead of immediate terminal failures. The engine re-enqueues affected in-review merges with exponential backoff for both direct and pull-request merge strategies, then parks the task as failed with explicit transient-retry exhaustion logs once the retry cap is reached.
