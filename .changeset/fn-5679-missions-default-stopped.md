---
"@runfusion/fusion": patch
---

Mission creation now always returns a stopped mission. `POST /api/missions` and the mission store ignore create-time `autopilotEnabled` input, forcing new missions to `status: "planning"` with autopilot disabled and inactive.

Autopilot remains a post-creation action via explicit mission start/update flows.
