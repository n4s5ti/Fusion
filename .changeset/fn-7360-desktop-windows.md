---
"@runfusion/fusion": patch
---

summary: Fix Windows desktop startup failures in packaged builds.
category: fix
dev: Externalizes Electron updater CJS dependencies, loads the dashboard registry manifest through Node-safe file IO, and separates NSIS/portable Windows artifacts.
