---
"@runfusion/fusion": patch
---

summary: Ensure task lifecycle plugins receive runtime context during completion hooks.
category: fix
dev: PluginLoader now appends PluginContext to task lifecycle hook invocations when callers provide only task event args.
