---
"@runfusion/fusion": patch
---

summary: Fix Anthropic subscription chat failing with 429/502 by routing it through the Claude CLI.
category: fix
dev: Anthropic routing now keeps three surfaces distinct: raw API keys authenticate direct api.anthropic.com/v1, subscription/OAuth remains `anthropic-subscription`, and CLI execution uses `pi-claude-cli`; OAuth-only selections never authenticate direct `/v1` and are routed to the CLI provider when available.
