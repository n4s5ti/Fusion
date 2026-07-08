---
"@runfusion/fusion": patch
---

summary: Fix dashboard terminal showing a blank screen for seconds before the first prompt appears on open.
category: performance
dev: `useTerminalSessions` no longer awaits a discardable `listTerminalSessions()` round trip before auto-creating the first session when there are no persisted `kb-terminal-tabs`; the round trip only produced a no-op filter result in that case. Reload-with-persisted-tabs is unaffected — it still awaits session-list validation.
