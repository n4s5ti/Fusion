---
"@runfusion/fusion": patch
---

Harden Remote Access tunnel lifecycle behavior: tunnel startup remains manual-only, restart restore now uses explicit safety gates (`rememberLastRunning`, prior-running markers, valid provider config, runtime prerequisites), and `/api/remote/status` now reports machine-readable restore diagnostics with consistent dashboard/headless parity.
