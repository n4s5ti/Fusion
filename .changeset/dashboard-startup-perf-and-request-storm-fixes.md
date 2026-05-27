---
"@runfusion/fusion": patch
"@fusion/dashboard": patch
"@fusion/engine": patch
---

Dashboard startup and request-storm fixes:

- **Faster startup**: parallelized independent store inits, started CentralCore init early in background, and ran plugin loading concurrently with extension resolution. The duplicate-runtime root cause is also fixed — `shouldUseHybridExecutor` no longer auto-enables for local-only multi-project setups, where `ProjectEngineManager` already handles project lifecycle (set `FUSION_HYBRID_EXECUTOR=1` to force-enable). Eliminates ~7s of redundant self-healing pipeline work per cold start.
- **Per-page request reduction**: added in-flight request dedupe (`packages/dashboard/app/api/dedupe.ts`) wrapped around the top API offenders. A single page load went from ~177 requests to ~101, with `/api/plugins/ui-slots` dropping from 17× to 1×.
- **Stale-data-after-mutation hazard**: `forceFresh` option on the deduped fetchers now redirects ALL in-flight waiters to receive the fresh post-mutation response, not just the forcing caller. Generation counters in `useAgents` and `AgentListModal` provide a second layer of protection against slow polls overwriting fresh state.
- **SSE refresh storm**: agent SSE event handler now debounces (250ms) with a trailing-edge guard, so multi-agent activity bursts coalesce to at most 2 refetches per burst instead of one per event.
- **Live isolation-mode transition**: PATCH `/api/projects/:id` with an `isolationMode` change now returns a 503 with actionable guidance when HybridExecutor is unavailable (local-only single-node), instead of silently persisting a config that the live runtime won't honor.
- **Error handling regression**: restored try/catch around `HybridExecutor.initialize` and `engineManager.ensureEngine` in the parallel engine setup so a paused or broken cwd project no longer aborts dashboard startup.
- **TaskStore migration race**: sequenced the SQLite store inits (TaskStore → AutomationStore → PluginStore → AgentStore) since they all open the same `.fusion/fusion.db` and run `addColumnIfMissing` migrations with a TOCTOU `hasColumn` → `ALTER` pattern.
