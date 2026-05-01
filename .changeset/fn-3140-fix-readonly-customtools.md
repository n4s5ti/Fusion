---
"@runfusion/fusion": patch
---

Fix readonly `createFnAgent` sessions to preserve caller-supplied engine custom tools while still excluding host extensions. This restores delegation and memory tools for no-task heartbeat/reviewer readonly sessions without reopening host extension tool injection in summarizer flows.
