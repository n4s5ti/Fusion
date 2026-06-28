---
"@runfusion/fusion": patch
---

summary: Stopping the engine or pausing a project now frees its global agent slots for other projects.
category: fix
dev: InProcessRuntime now returns the project's held slots back to the shared cross-project AgentSemaphore after abort+drain on stop, and ProjectEngineManager.pauseProject/stopAll return residual slots per project without clobbering slots held by other projects.
