---
"@runfusion/fusion": minor
---

Remove the `terminated` AgentState. The agent lifecycle now runs through `idle | active | running | paused | error`, with `paused` (carrying a `pauseReason`) absorbing every former `terminated` use case (manual stop, heartbeat run termination, spawned-child cleanup). Run status is unchanged — heartbeat runs still report `terminated` independently of the agent state.

Migration: existing `agents` rows where `state = 'terminated'` are rewritten to `state = 'paused'` with `pauseReason: 'migrated-from-terminated'` on first store init (`__meta` key `removeTerminatedAgentState`). The dashboard "Terminated" filter option, badge, and CSS rules are gone; "Stop" buttons now transition the agent to `paused`. The `dashboard.READMEs` "Terminated agent filtering" behavior in the agents list is also dropped — paused/error agents are visible by default, and AgentListModal/AgentsView no longer hide them in "All States."
